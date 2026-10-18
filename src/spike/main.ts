/* M1 視覺 spike：一頁拉桿調參數，回答 H1（DESIGN「要驗證的假設」）。
 *
 * 這頁只是試作台，**不是編輯器**：沒有存檔格式、沒有流程，M3 會整頁換成 React 編輯器。
 * 但它畫面用的是正式的 core 與 player —— spike 裡看到的就是之後播放器會畫出來的樣子。
 */

import { adjust, COLS_MAX, COLS_MIN, layoutText, outlineChars, sampleImage, toDensity, toMessage, type Sample } from '../core/convert'
import { emptyGrid, type Grid } from '../core/grid'
import { buildInkTable, canvasInkMeasure } from '../core/ink'
import type { EffectKind, EffectSpec } from '../player/effects'
import { ScenePlayer } from '../player/scene-player'

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

interface Source {
  img: CanvasImageSource
  w: number
  h: number
}

/** 沒載圖時的範例：一顆帶漸層的心。程式畫的，repo 不必放圖檔。 */
function sampleHeart(): Source {
  const w = 480
  const h = 420
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const glow = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.6)
  glow.addColorStop(0, '#3a1420')
  glow.addColorStop(1, '#000')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)
  ctx.save()
  ctx.translate(w / 2, h * 0.3)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(-30, -80, -200, -60, -170, 60)
  ctx.bezierCurveTo(-150, 140, -40, 200, 0, 260)
  ctx.bezierCurveTo(40, 200, 150, 140, 170, 60)
  ctx.bezierCurveTo(200, -60, 30, -80, 0, 0)
  const fill = ctx.createLinearGradient(-170, -60, 170, 260)
  fill.addColorStop(0, '#ffd1dc')
  fill.addColorStop(0.5, '#ff5a7a')
  fill.addColorStop(1, '#9b1236')
  ctx.fillStyle = fill
  ctx.fill()
  ctx.restore()
  return { img: c, w, h }
}

let source: Source = sampleHeart()

async function loadFile(file: File) {
  if (!file.type.startsWith('image/')) return
  const bmp = await createImageBitmap(file)
  source = { img: bmp, w: bmp.width, h: bmp.height }
  sampleCache = null
  state.source = 'image'
  syncControls()
  rebuild(true)
}

/* ─────────── 轉換 ─────────── */

const measure = canvasInkMeasure()
let sampleCache: { key: string; sample: Sample } | null = null

function getSample(): Sample {
  const key = `${state.cols}`
  if (!sampleCache || sampleCache.key !== key) {
    sampleCache = { key, sample: sampleImage(source.img, source.w, source.h, state.cols) }
  }
  return sampleCache.sample
}

function buildGrid(): Grid {
  if (state.source === 'text') {
    const body = layoutText(state.text, state.cols)
    // 上下各留一列，字才不會貼著畫面邊緣。
    const grid = emptyGrid(body.cols, body.rows + 2)
    grid.cells.splice(body.cols, body.cells.length, ...body.cells)
    return grid
  }
  const s = getSample()
  const lum = adjust(s.lum, state)
  let grid: Grid
  if (state.mode === 'density') {
    const table = buildInkTable(state.charset, measure)
    const outline = state.outline ? outlineChars(lum, s.cols, s.rows, state.outlineThreshold) : undefined
    grid = toDensity(lum, s.cols, s.rows, table, { outline })
  } else {
    grid = toMessage(lum, s.cols, s.rows, state.message, state)
  }
  grid.colors = s.rgb
  return grid
}

function effects(): EffectSpec[] {
  return (Object.keys(state.fx) as EffectKind[])
    .filter((k) => state.fx[k].on)
    .map((k) => ({ kind: k, speed: state.fx[k].speed, intensity: state.fx[k].intensity }))
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

let current: Grid = emptyGrid(1, 1)
let pending = 0

/** 合併同一幀內的多次變更 —— 拖拉桿時一秒會觸發幾十次。 */
function rebuild(restart = false) {
  if (restart) player.replay()
  if (pending) return
  pending = requestAnimationFrame(() => {
    pending = 0
    current = buildGrid()
    player.show(current, effects(), { fg: state.fg, bg: state.bg, useColors: state.useColors }, false)
    showStatus()
    saveState()
  })
}

new ResizeObserver(() => player.resize()).observe(stage)

function showStatus() {
  const chars = current.cells.filter((c) => c.w > 0 && c.ch !== ' ').length
  statusEl.textContent = `${current.cols} × ${current.rows} 格 · ${chars} 字 · 每幀繪製 ${player.lastDrawMs.toFixed(1)} ms`
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

const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: true })
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

controls.append(
  el(
    'div',
    { className: 'buttons' },
    button('重播', () => player.replay(), true),
    button('存成圖片', () =>
      canvas.toBlob((blob) => {
        if (!blob) return
        const a = el('a', { href: URL.createObjectURL(blob), download: 'unsaid-spike.png' })
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      })
    ),
    button('重設參數', () => {
      Object.assign(state, structuredClone(DEFAULTS))
      syncControls()
      rebuild(true)
    })
  )
)

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
