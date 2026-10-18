/* M1 視覺 spike：一頁拉桿調參數，回答 H1（DESIGN「要驗證的假設」）。
 *
 * 這頁只是試作台，**不是編輯器**：沒有存檔格式、沒有流程，M3 會整頁換成 React 編輯器。
 * 但它畫面用的是正式的 core 與 player —— spike 裡看到的就是之後播放器會畫出來的樣子。
 */

import { COLS_MAX, COLS_MIN, sampleImage, type Sample } from '../core/convert'
import { clipDuration, emptyGrid, stillClip, type Clip } from '../core/grid'
import { canvasInkMeasure } from '../core/ink'
import { gifSamples, gridsFromSamples, textGrid } from '../media/render-source'
import { GifSource, isGif } from '../media/gif-decode'
import { exportGif, GIF_MAX_SECONDS, suggestSeconds } from '../media/gif-export'
import type { EffectKind, EffectSpec } from '../player/effects'
import type { RenderStyle } from '../player/renderer'
import { ScenePlayer } from '../player/scene-player'
import { decodeProject, encodeProject, extractProjectFile, validateProject, type Project } from '../core/project'
import { buildHtml } from '../media/export-html'
import { buildDemo, drawHeart } from './demo'

/* ─────────── 狀態 ─────────── */

interface FxState {
  on: boolean
  speed: number
  intensity: number
}

interface State {
  source: 'image' | 'text'
  mode: 'density' | 'message'
  charset: string
  message: string
  text: string
  cols: number
  brightness: number
  contrast: number
  invert: boolean
  outline: boolean
  outlineThreshold: number
  threshold: number
  minAlpha: number
  fg: string
  bg: string
  useColors: boolean
  fx: Record<EffectKind, FxState>
  gifWidth: number
  gifFps: number
  /** 自動決定長度（涵蓋進場特效、動圖一輪、持續特效）。 */
  gifAuto: boolean
  gifSeconds: number
  gifLoop: boolean
}

const DEFAULTS: State = {
  source: 'image',
  mode: 'message',
  charset: ' .:-=+*#%@',
  message: '有些話我一直沒有說出口。謝謝你，一直都在。',
  text: '有些話\n我一直沒有說出口',
  cols: 80,
  brightness: 0,
  contrast: 1.2,
  invert: false,
  outline: false,
  outlineThreshold: 0.25,
  threshold: 0.2,
  minAlpha: 0.35,
  fg: '#f1e7d8',
  bg: '#0b0b0d',
  useColors: true,
  fx: {
    typewriter: { on: false, speed: 1, intensity: 0.3 },
    decode: { on: true, speed: 1, intensity: 0.8 },
    wave: { on: false, speed: 1, intensity: 0.4 },
    glitch: { on: false, speed: 1, intensity: 0.4 },
  },
  gifWidth: 720,
  gifFps: 15,
  gifAuto: true,
  gifSeconds: 4,
  gifLoop: true,
}

const STORE_KEY = 'unsaid.spike.v1'

/** 參數存在這台瀏覽器，重新整理不用重調。圖片不存 —— 只是試作台。 */
function loadState(): State {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      return { ...DEFAULTS, ...saved, fx: { ...DEFAULTS.fx, ...saved.fx } }
    }
  } catch {
    /* 私密視窗或被封鎖：用預設值 */
  }
  return structuredClone(DEFAULTS)
}

function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state))
  } catch {
    /* 存不了就算了 */
  }
}

const state = loadState()

/* ─────────── 圖片來源 ─────────── */

/** 靜態圖或 GIF 動圖。動圖不展開成像素存著，每次欄數改變才逐格重解（見 media/gif-decode）。 */
type Source =
  | { kind: 'still'; img: CanvasImageSource; w: number; h: number }
  | { kind: 'gif'; gif: GifSource }

/** 沒載圖時的範例：一顆帶漸層的心。程式畫的，repo 不必放圖檔。 */
function sampleHeart(): Source {
  const img = drawHeart()
  return { kind: 'still', img, w: img.width, h: img.height }
}

let source: Source = sampleHeart()

async function loadFile(file: File) {
  // 匯出的 HTML 或專案 JSON 拖進來 = 取回那則訊息（DESIGN「匯出」：拖回編輯器可以繼續編輯）。
  if (/\.(html?|json)$/i.test(file.name)) return importProject(file)
  if (!file.type.startsWith('image/') && !/\.gif$/i.test(file.name)) return
  const bytes = await file.arrayBuffer()
  let next: Source | null = null
  if (isGif(bytes)) {
    try {
      const gif = new GifSource(bytes)
      if (gif.frameCount > 1) next = { kind: 'gif', gif }
    } catch (e) {
      console.warn('GIF 解析失敗，改用瀏覽器內建解碼（只取第一格）', e)
    }
  }
  if (!next) {
    const bmp = await createImageBitmap(new Blob([bytes], { type: file.type }))
    next = { kind: 'still', img: bmp, w: bmp.width, h: bmp.height }
  }
  source = next
  sampleCache = null
  state.source = 'image'
  syncControls()
  rebuild(true)
}

/* ─────────── 轉換 ─────────── */

const measure = canvasInkMeasure()
let sampleCache: { cols: number; samples: Sample[] } | null = null

/** 每一格動畫各取一份樣本。只有欄數變了才重取 —— 亮度、對比等參數不用重解 GIF。 */
function getSamples(): Sample[] {
  if (sampleCache && sampleCache.cols === state.cols) return sampleCache.samples
  let samples: Sample[]
  if (source.kind === 'still') {
    samples = [sampleImage(source.img, source.w, source.h, state.cols)]
  } else {
    samples = gifSamples(source.gif, state.cols)
  }
  sampleCache = { cols: state.cols, samples }
  return samples
}

function buildClip(): Clip {
  if (state.source === 'text') return stillClip(textGrid(state.text, state.cols))
  const frames = gridsFromSamples(getSamples(), state, measure)
  return source.kind === 'gif' ? { frames, delays: source.gif.delays.slice() } : stillClip(frames[0])
}

function effects(): EffectSpec[] {
  return (Object.keys(state.fx) as EffectKind[])
    .filter((k) => state.fx[k].on)
    .map((k) => ({ kind: k, speed: state.fx[k].speed, intensity: state.fx[k].intensity }))
}

function style(): RenderStyle {
  return { fg: state.fg, bg: state.bg, useColors: state.useColors }
}

/* ─────────── 播放 ─────────── */

const stage = document.getElementById('stage')!
const canvas = document.getElementById('view') as HTMLCanvasElement
const statusEl = document.getElementById('status')!
const player = new ScenePlayer(canvas, () => {
  const cs = getComputedStyle(stage)
  return {
    width: stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
    height: stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
  }
})

let current: Clip = stillClip(emptyGrid(1, 1))
let pending = 0

/** 合併同一幀內的多次變更 —— 拖拉桿時一秒會觸發幾十次。 */
function rebuild(restart = false) {
  if (restart) player.replay()
  if (pending) return
  pending = requestAnimationFrame(() => {
    pending = 0
    current = buildClip()
    player.show(current, effects(), style(), false)
    showStatus()
    syncGifLength()
    saveState()
  })
}

new ResizeObserver(() => player.resize()).observe(stage)

function showStatus() {
  const g = current.frames[0]
  const chars = g.cells.filter((c) => c.w > 0 && c.ch !== ' ').length
  const anim = current.frames.length > 1 ? ` · 動圖 ${current.frames.length} 格／${(clipDuration(current) / 1000).toFixed(1)} 秒` : ''
  statusEl.textContent = `${g.cols} × ${g.rows} 格 · ${chars} 字${anim} · 每幀繪製 ${player.lastDrawMs.toFixed(1)} ms`
}
setInterval(showStatus, 500)

/* ─────────── 控制面板 ─────────── */

const controls = document.getElementById('controls')!
/** 每個控制項登記一個「從 state 讀回畫面」的函式，載入圖片或重設時一次同步。 */
const syncers: (() => void)[] = []
/** 依目前模式決定要不要顯示的區塊。 */
const visibility: [HTMLElement, () => boolean][] = []

function syncControls() {
  syncers.forEach((f) => f())
  visibility.forEach(([el, show]) => (el.hidden = !show()))
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  Object.assign(e, props)
  e.append(...kids)
  return e
}

function group(title: string, show?: () => boolean, ...kids: Node[]) {
  const fs = el('fieldset', {}, el('legend', {}, title), ...kids)
  if (show) visibility.push([fs, show])
  controls.append(fs)
  return fs
}

type Obj = Record<string, any>

function range(label: string, obj: () => Obj, key: string, min: number, max: number, step: number, opts: { restart?: boolean } = {}) {
  const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step) })
  const out = el('output')
  const show = () => {
    input.value = String(obj()[key])
    out.textContent = (+input.value).toFixed(step < 1 ? (step < 0.1 ? 2 : 1) : 0)
  }
  input.addEventListener('input', () => {
    obj()[key] = +input.value
    show()
    rebuild(opts.restart)
  })
  syncers.push(show)
  return el('label', { className: 'row' }, label, input, out)
}

function check(label: string, obj: () => Obj, key: string, opts: { restart?: boolean } = {}) {
  const input = el('input', { type: 'checkbox' })
  input.addEventListener('change', () => {
    obj()[key] = input.checked
    syncControls()
    rebuild(opts.restart)
  })
  syncers.push(() => (input.checked = obj()[key]))
  return el('label', { className: 'row wide' }, label, input)
}

function seg(label: string, key: 'source' | 'mode', options: [string, string][]) {
  const name = `seg-${key}`
  const box = el('div', { className: 'seg' })
  for (const [value, text] of options) {
    const input = el('input', { type: 'radio', name, value })
    input.addEventListener('change', () => {
      ;(state as Obj)[key] = value
      syncControls()
      rebuild(true)
    })
    syncers.push(() => (input.checked = state[key] === value))
    box.append(el('label', {}, input, text))
  }
  return el('div', { className: 'row wide' }, label, box)
}

function textField(label: string, key: 'charset' | 'message' | 'text', multiline: boolean) {
  const input = multiline ? el('textarea', { rows: 3 }) : el('input', { type: 'text' })
  input.addEventListener('input', () => {
    state[key] = input.value
    rebuild()
  })
  syncers.push(() => (input.value = state[key]))
  return el('label', { className: 'row stack' }, label, input)
}

function color(label: string, key: 'fg' | 'bg') {
  const input = el('input', { type: 'color' })
  input.addEventListener('input', () => {
    state[key] = input.value
    rebuild()
  })
  syncers.push(() => (input.value = state[key]))
  return el('label', { className: 'row wide' }, label, input)
}

function button(text: string, onClick: () => void, primary = false) {
  const b = el('button', { type: 'button', textContent: text, className: primary ? 'primary' : '' })
  b.addEventListener('click', onClick)
  return b
}

const S = () => state as Obj
const isImage = () => state.source === 'image'

const fileInput = el('input', { type: 'file', accept: 'image/*,.gif,.html,.json', hidden: true })
fileInput.addEventListener('change', () => fileInput.files?.[0] && loadFile(fileInput.files[0]))

group(
  '來源',
  undefined,
  seg('圖層來源', 'source', [
    ['image', '圖片'],
    ['text', '純文字'],
  ]),
  el(
    'div',
    { className: 'buttons' },
    button('選一張圖…', () => fileInput.click()),
    button('範例圖', () => {
      source = sampleHeart()
      sampleCache = null
      state.source = 'image'
      syncControls()
      rebuild(true)
    })
  ),
  fileInput
)

group('純文字', () => state.source === 'text', textField('內容（Enter 換行）', 'text', true))

group(
  '字元模式',
  isImage,
  seg('模式', 'mode', [
    ['message', '訊息填充 ⭐'],
    ['density', '密度'],
  ]),
  textField('要填進去的話', 'message', true),
  textField('字元組（自動依墨量排序）', 'charset', false)
)

group(
  '轉換',
  undefined,
  range('欄數', S, 'cols', COLS_MIN, COLS_MAX, 1),
  range('亮度', S, 'brightness', -1, 1, 0.01),
  range('對比', S, 'contrast', 0, 3, 0.01),
  check('反相', S, 'invert')
)

group(
  '訊息填充',
  () => isImage() && state.mode === 'message',
  range('亮度門檻', S, 'threshold', 0, 1, 0.01),
  range('最低明顯度', S, 'minAlpha', 0, 1, 0.01)
)

group(
  '輪廓',
  () => isImage() && state.mode === 'density',
  check('描邊', S, 'outline'),
  range('門檻', S, 'outlineThreshold', 0.02, 1, 0.01)
)

group('顏色', undefined, check('沿用原圖色', S, 'useColors'), color('前景', 'fg'), color('背景', 'bg'))

const FX: [EffectKind, string, string][] = [
  ['typewriter', '打字機', '進場'],
  ['decode', '解碼', '進場'],
  ['wave', '波浪', '持續'],
  ['glitch', '故障', '持續'],
]
const fxBox = group('特效')
for (const [kind, name, cat] of FX) {
  const fx = () => state.fx[kind] as Obj
  const toggle = el('input', { type: 'checkbox' })
  toggle.addEventListener('change', () => {
    state.fx[kind].on = toggle.checked
    rebuild(true)
  })
  syncers.push(() => (toggle.checked = state.fx[kind].on))
  fxBox.append(
    el(
      'div',
      { className: 'effect' },
      el('label', { className: 'head' }, toggle, name, el('small', {}, cat)),
      range('速度', fx, 'speed', 0.1, 3, 0.05, { restart: true }),
      range('強度', fx, 'intensity', 0, 1, 0.01, { restart: true })
    )
  )
}

function download(blob: Blob, name: string) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function select(label: string, key: 'gifWidth' | 'gifFps', options: [number, string][]) {
  const input = el('select')
  for (const [v, text] of options) input.append(el('option', { value: String(v), textContent: text }))
  input.addEventListener('change', () => {
    state[key] = +input.value
    saveState()
  })
  syncers.push(() => (input.value = String(state[key])))
  return el('label', { className: 'row wide' }, label, input)
}

/** 自動長度：跟著畫面內容重算，並把拉桿推到那個值。 */
function syncGifLength() {
  if (!state.gifAuto) return
  state.gifSeconds = suggestSeconds(current, effects())
  gifLengthSync()
}

const gifLength = range('長度（秒）', S, 'gifSeconds', 0, GIF_MAX_SECONDS, 0.1)
const gifLengthSync = syncers[syncers.length - 1]
const gifInfo = el('p', { className: 'hint' })
const gifButton = button('匯出 GIF', async () => {
  gifButton.disabled = true
  try {
    const opts = { width: state.gifWidth, fps: state.gifFps, seconds: state.gifSeconds, loop: state.gifLoop }
    const blob = await exportGif(current, effects(), style(), opts, (done, total) => {
      gifInfo.textContent = `錄製中… ${done} / ${total} 格`
    })
    gifInfo.textContent = `完成：${(blob.size / 1024 / 1024).toFixed(2)} MB`
    download(blob, 'unsaid.gif')
  } catch (e) {
    gifInfo.textContent = `匯出失敗：${e instanceof Error ? e.message : e}`
    throw e
  } finally {
    gifButton.disabled = false
  }
}, true)

group(
  '匯出 GIF',
  undefined,
  select('寬度', 'gifWidth', [
    [480, '480 px（小檔）'],
    [720, '720 px'],
    [1080, '1080 px（清楚，檔案大）'],
  ]),
  select('每秒格數', 'gifFps', [
    [10, '10'],
    [15, '15'],
    [20, '20（順，檔案大）'],
  ]),
  check('自動長度', S, 'gifAuto'),
  gifLength,
  check('循環播放', S, 'gifLoop'),
  el('div', { className: 'buttons' }, gifButton),
  gifInfo
)
visibility.push([gifLength, () => !state.gifAuto])
// 自動長度一開，立刻重算一次。
syncers.push(() => {
  if (state.gifAuto) syncGifLength()
})

controls.append(
  el(
    'div',
    { className: 'buttons' },
    button('重播', () => player.replay(), true),
    button('存成 PNG', () => canvas.toBlob((blob) => blob && download(blob, 'unsaid.png'))),
    button('重設參數', () => {
      Object.assign(state, structuredClone(DEFAULTS))
      syncControls()
      rebuild(true)
    })
  )
)

/* ─────────── 整則訊息（M2） ─────────── */

/** 匯入的專案；null = 用示範流程（第一個 Scene 是目前的畫面）。 */
let imported: Project | null = null

function currentProject(): Project {
  return imported ?? buildDemo({ clip: current, effects: effects(), style: style() })
}

const msgInfo = el('p', { className: 'hint' })
const msgSource = el('p', { className: 'hint' })

function describeSource() {
  msgSource.textContent = imported
    ? `使用匯入的訊息「${imported.title || '（未命名）'}」`
    : '示範流程：第一個 Scene 用目前的畫面 → Choice → 兩條路 → End'
  revertButton.hidden = !imported
}

/** 匯出前一律驗證（DESIGN「Node 種類」：沒接好的地方要擋下）。 */
function readyHtml(): string | null {
  const p = currentProject()
  const problems = validateProject(p)
  if (problems.length) {
    msgInfo.textContent = '還不能匯出：' + problems.map((x) => (x.node ? `［${x.node}］` : '') + x.message).join('；')
    return null
  }
  const html = buildHtml(p)
  const frames = p.nodes.reduce((n, x) => n + (x.type === 'scene' ? x.layers.reduce((m, l) => m + l.frames.length, 0) : 0), 0)
  msgInfo.textContent = `HTML ${(new Blob([html]).size / 1024).toFixed(0)} KB · ${p.nodes.filter((x) => x.type === 'scene').length} 個 Scene、共 ${frames} 格字元畫面`
  return html
}

async function importProject(file: File) {
  try {
    const text = await file.text()
    const raw = /\.json$/i.test(file.name) ? JSON.parse(text) : extractProjectFile(text)
    if (!raw) throw new Error('這個檔案裡找不到 Unsaid 的訊息資料')
    imported = decodeProject(raw)
    msgInfo.textContent = `已匯入「${file.name}」`
  } catch (e) {
    msgInfo.textContent = `匯入失敗：${e instanceof Error ? e.message : e}`
  }
  describeSource()
}

/** 預覽 = 把**匯出檔本身**放進 iframe。看到的就是對方會看到的，不是另一套畫法。 */
function openPreview(html: string) {
  const frame = el('iframe', { title: '預覽', srcdoc: html })
  frame.setAttribute('sandbox', 'allow-scripts')
  const close = button('關閉預覽（Esc）', () => shut())
  const box = el('div', { className: 'preview' }, frame, close)
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && shut()
  const shut = () => {
    box.remove()
    window.removeEventListener('keydown', onKey)
  }
  window.addEventListener('keydown', onKey)
  document.body.append(box)
  frame.addEventListener('load', () => frame.focus())
}

const revertButton = button('改回示範流程', () => {
  imported = null
  msgInfo.textContent = ''
  describeSource()
})

const projectInput = el('input', { type: 'file', accept: '.html,.json', hidden: true })
projectInput.addEventListener('change', () => projectInput.files?.[0] && importProject(projectInput.files[0]))

group(
  '整則訊息（M2 試作）',
  undefined,
  msgSource,
  el(
    'div',
    { className: 'buttons' },
    button('預覽', () => {
      const html = readyHtml()
      if (html) openPreview(html)
    }, true),
    button('匯出 HTML', () => {
      const html = readyHtml()
      if (html) download(new Blob([html], { type: 'text/html;charset=utf-8' }), 'unsaid.html')
    })
  ),
  el(
    'div',
    { className: 'buttons' },
    button('下載專案 JSON', () => {
      const p = currentProject()
      download(new Blob([JSON.stringify(encodeProject(p), null, 1)], { type: 'application/json' }), 'unsaid-project.json')
    }),
    button('匯入…', () => projectInput.click())
  ),
  el('div', { className: 'buttons' }, revertButton),
  projectInput,
  msgInfo
)
describeSource()

/* ─────────── 拖放 ─────────── */

for (const target of [stage, document.body]) {
  target.addEventListener('dragover', (e) => {
    e.preventDefault()
    stage.classList.add('dragging')
  })
  target.addEventListener('dragleave', (e) => {
    if (e.target === stage || !stage.contains(e.relatedTarget as Node)) stage.classList.remove('dragging')
  })
  target.addEventListener('drop', (e) => {
    e.preventDefault()
    stage.classList.remove('dragging')
    const file = e.dataTransfer?.files[0]
    if (file) loadFile(file)
  })
}

/* ─────────── 啟動 ─────────── */

syncControls()
// 字型載好再量墨量，否則量到的是後備字型。
document.fonts.ready.then(() => rebuild(true))
