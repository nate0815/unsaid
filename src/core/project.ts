/* 專案資料：一則訊息的全部內容。編輯器產生它、匯出檔內嵌它、播放器讀它。
 * 規格見 DESIGN「Node 種類」「Scene」「專案存檔」。
 *
 * 存檔格式（`ProjectFile`）與執行期格式（`Project`）分開：
 *   - 存檔格式要能 JSON 化、要小、要帶版本號 —— 字元格存成「每列一個字串」＋ base64
 *   - 執行期格式是 core 的 Grid／Clip，播放器直接拿來畫
 * 兩者只透過 `encodeProject`／`decodeProject` 轉換。 */

import { textGrid } from './convert'
import { CELL_ASPECT, emptyGrid, putChar, stillClip, type Clip, type Grid } from './grid'
import { charWidth, splitChars } from './width'

/* ─────────── 執行期格式 ─────────── */

export type EffectKind = 'typewriter' | 'decode' | 'wave' | 'glitch'

export interface EffectSpec {
  kind: EffectKind
  /** 0.1～3，1 為預設速度。 */
  speed: number
  /** 0～1。 */
  intensity: number
}

export interface SceneStyle {
  fg: string
  bg: string
  /** 用圖層的逐格顏色（沒有就退回 fg）。 */
  useColors: boolean
}

export type Advance = { mode: 'click' } | { mode: 'auto'; seconds: number }

/** 一個字元畫面。Scene 的本體；`Start`／`End` 也可以掛一個，規格相同（DESIGN「Node 種類」）。 */
export interface Screen {
  /** MVP 只有一層；格式先做成陣列，之後多層合成不必改格式（DESIGN「Scene」）。 */
  layers: Clip[]
  style: SceneStyle
  effects: EffectSpec[]
  /** 圖層是怎麼做出來的（原圖＋轉換參數），讓編輯器能隨時重調（DESIGN「專案存檔」）。
   *  **只存在專案檔，匯出 HTML 時拿掉** —— 對方手上的檔案不含原圖。從 HTML 取回的專案沒有它。 */
  source?: SceneSource
}

export interface StartNode {
  id: string
  type: 'start'
  next: string | null
  /** 起始畫面；沒有就只顯示「點一下開始」。 */
  screen?: Screen
}

export interface SceneNode extends Screen {
  id: string
  type: 'scene'
  advance: Advance
  next: string | null
}

/* ─────────── 圖層來源（編輯器用；匯出 HTML 不含） ─────────── */

export interface ConvertParams {
  mode: 'message' | 'density'
  /** 訊息填充模式要填的話。 */
  message: string
  /** 密度模式的字元組。 */
  charset: string
  cols: number
  brightness: number
  contrast: number
  invert: boolean
  outline: boolean
  outlineThreshold: number
  threshold: number
  minAlpha: number
}

export const DEFAULT_PARAMS: ConvertParams = {
  mode: 'message',
  message: '有些話我一直沒有說出口。謝謝你，一直都在。',
  charset: ' .:-=+*#%@',
  cols: 80,
  brightness: 0,
  contrast: 1.2,
  invert: false,
  outline: false,
  outlineThreshold: 0.25,
  threshold: 0.2,
  minAlpha: 0.35,
}

export type LayerSource =
  /** 縮小過的靜態圖（長邊 ≤ 800 px），data URL。 */
  | { kind: 'image'; image: string }
  /** GIF 原檔，base64。 */
  | { kind: 'gif'; gif: string }
  | { kind: 'text'; text: string }

export interface SceneSource {
  layer: LayerSource
  params: ConvertParams
}

export interface ChoiceOption {
  label: string
  next: string | null
}

export interface ChoiceNode {
  id: string
  type: 'choice'
  prompt: string
  options: ChoiceOption[]
}

export interface EndNode {
  id: string
  type: 'end'
  /** 結尾畫面；沒有就是空白背景。 */
  screen?: Screen
  replay: boolean
}

export type FlowNode = StartNode | SceneNode | ChoiceNode | EndNode

export interface Project {
  title: string
  nodes: FlowNode[]
  /** 流程圖上每個 node 的位置。編輯器用，匯出 HTML 時拿掉。 */
  layout?: Record<string, { x: number; y: number }>
}

/** node 帶的畫面：Scene 本身就是畫面；Start／End 是選配的 `screen`；Choice 沒有。 */
export function screenOf(n: FlowNode): Screen | undefined {
  if (n.type === 'scene') return n
  if (n.type === 'start' || n.type === 'end') return n.screen
  return undefined
}

/** 換掉 node 的畫面（不可變更新）。Choice 原樣回傳；Start／End 傳 undefined 就是拿掉畫面。 */
export function withScreen<T extends FlowNode>(n: T, screen: Screen | undefined): T {
  if (n.type === 'scene') return screen ? { ...n, ...screen } : n
  if (n.type === 'start' || n.type === 'end') {
    const { screen: _, ...rest } = n
    return (screen ? { ...rest, screen } : rest) as T
  }
  return n
}

/** 文字畫面的預設樣子：新的 Scene、Start／End 的畫面、舊版 End 的結尾文字都從這裡來。 */
export const TEXT_COLS = 36
export const TEXT_STYLE: SceneStyle = { fg: '#f1e7d8', bg: '#0b0b0d', useColors: false }

export function textScreen(text: string, effects: EffectSpec[], style: SceneStyle = TEXT_STYLE): Screen {
  const params = { ...DEFAULT_PARAMS, cols: TEXT_COLS }
  return { layers: [stillClip(textGrid(text, params.cols))], style: { ...style }, effects, source: { layer: { kind: 'text', text }, params } }
}

export const CHOICE_MIN = 2
export const CHOICE_MAX = 8

/* ─────────── 驗證（DESIGN：沒接好的地方要指出來，匯出前擋下） ─────────── */

export interface Problem {
  /** 出問題的 node；整個專案層級的問題是 null。 */
  node: string | null
  message: string
}

export function validateProject(p: Project): Problem[] {
  const problems: Problem[] = []
  const ids = new Set<string>()
  for (const n of p.nodes) {
    if (ids.has(n.id)) problems.push({ node: n.id, message: `node id 重複：${n.id}` })
    ids.add(n.id)
  }
  const starts = p.nodes.filter((n) => n.type === 'start')
  if (starts.length !== 1) problems.push({ node: null, message: `Start 必須恰好一個，目前有 ${starts.length} 個` })

  const link = (from: string, to: string | null, what: string) => {
    if (to === null) problems.push({ node: from, message: `${what}沒有接到任何東西` })
    else if (!ids.has(to)) problems.push({ node: from, message: `${what}接到不存在的 node：${to}` })
  }
  for (const n of p.nodes) {
    switch (n.type) {
      case 'start':
        link(n.id, n.next, '出口')
        break
      case 'scene':
        link(n.id, n.next, '出口')
        if (n.layers.length === 0) problems.push({ node: n.id, message: 'Scene 沒有圖層' })
        break
      case 'choice':
        if (n.options.length < CHOICE_MIN || n.options.length > CHOICE_MAX)
          problems.push({ node: n.id, message: `選項要 ${CHOICE_MIN}～${CHOICE_MAX} 個，目前 ${n.options.length} 個` })
        n.options.forEach((o, i) => link(n.id, o.next, `選項 ${i + 1}「${o.label}」`))
        break
      case 'end':
        break
    }
    const screen = n.type === 'scene' ? undefined : screenOf(n)
    if (screen && screen.layers.length === 0) problems.push({ node: n.id, message: '畫面沒有圖層' })
  }
  return problems
}

/* ─────────── 存檔格式 ─────────── */

export const FORMAT = 'unsaid'
/** 存檔格式版本。**改了格式就加一，並在 `MIGRATIONS` 補上從舊版升上來的函式**（DESIGN「專案存檔」：舊檔要打得開）。 */
export const FORMAT_VERSION = 3

/** 一格字元格的存檔形式。 */
export interface GridFile {
  /** 每列一個字串：全形字只寫一次（它佔的兩格由字寬表推回來），沒字的格子寫半形空格。 */
  text: string[]
  /** 每格明顯程度 0～255，base64。省略 = 有字的格子全是 255。 */
  alpha?: string
  /** 每格 r,g,b，base64。省略 = 單色。 */
  colors?: string
}

export interface ClipFile {
  cols: number
  rows: number
  frames: GridFile[]
  /** 每格停留毫秒。只有一格時省略。 */
  delays?: number[]
}

export type ScreenFile = Omit<Screen, 'layers'> & { layers: ClipFile[] }
export type SceneNodeFile = Omit<SceneNode, 'layers'> & { layers: ClipFile[] }
export type StartNodeFile = Omit<StartNode, 'screen'> & { screen?: ScreenFile }
export type EndNodeFile = Omit<EndNode, 'screen'> & { screen?: ScreenFile }
export type FlowNodeFile = StartNodeFile | SceneNodeFile | ChoiceNode | EndNodeFile

export interface ProjectFile {
  format: typeof FORMAT
  version: number
  /** 字元格高寬比（core 的 CELL_ASPECT）。記下來，將來改了常數才認得出舊檔。 */
  cellAspect: number
  title: string
  nodes: FlowNodeFile[]
  layout?: Project['layout']
}

/** 舊版 → 新版。key 是「從哪一版升上來」。 */
const MIGRATIONS: Record<number, (f: any) => any> = {
  // v1 → v2：加了 Scene 的 `source` 與專案的 `layout`，兩者都可省略 —— v1 的檔案原樣就是合法的 v2。
  1: (f) => ({ ...f, version: 2 }),
  // v2 → v3：Start／End 可以掛畫面（DESIGN v0.5）。End 的 `text` 併進結尾畫面：
  // 有字就變成文字畫面，保留舊版播放器的樣子（打字機 1.5 倍速）；空字串就是不設畫面。
  2: (f) => ({
    ...f,
    version: 3,
    nodes: f.nodes.map((n: any) => {
      if (n.type !== 'end') return n
      const { text, ...rest } = n
      if (typeof text !== 'string' || !text.trim()) return rest
      const s = textScreen(text, [{ kind: 'typewriter', speed: 1.5, intensity: 0.4 }])
      return { ...rest, screen: { ...s, layers: s.layers.map(encodeClip) } }
    }),
  }),
}

export class ProjectFormatError extends Error {}

/* ─── base64（瀏覽器與 node 都有 btoa／atob，不必相依） ─── */

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/* ─── Grid ⇄ GridFile ─── */

export function encodeGrid(g: Grid): GridFile {
  const text: string[] = []
  const alpha = new Uint8Array(g.cols * g.rows)
  let allOpaque = true
  for (let r = 0; r < g.rows; r++) {
    let line = ''
    for (let c = 0; c < g.cols; c++) {
      const i = r * g.cols + c
      const cell = g.cells[i]
      if (cell.w === 0) continue
      const blank = cell.ch === ' ' || cell.ch === '' || cell.a <= 0
      line += blank ? ' ' : cell.ch
      const a = blank ? 0 : Math.round(Math.min(1, cell.a) * 255)
      alpha[i] = a
      if (cell.w === 2) alpha[i + 1] = a
      if (!blank && a !== 255) allOpaque = false
    }
    text.push(line)
  }
  const file: GridFile = { text }
  if (!allOpaque) file.alpha = toBase64(alpha)
  if (g.colors) file.colors = toBase64(new Uint8Array(g.colors.buffer, g.colors.byteOffset, g.colors.byteLength))
  return file
}

export function decodeGrid(f: GridFile, cols: number, rows: number): Grid {
  const g = emptyGrid(cols, rows)
  const alpha = f.alpha ? fromBase64(f.alpha) : null
  for (let r = 0; r < Math.min(rows, f.text.length); r++) {
    let c = 0
    for (const ch of splitChars(f.text[r])) {
      if (c >= cols) break
      if (ch !== ' ') {
        const i = r * cols + c
        putChar(g, c, r, ch, alpha ? alpha[i] / 255 : 1)
      }
      c += charWidth(ch)
    }
  }
  if (f.colors) g.colors = new Uint8ClampedArray(fromBase64(f.colors))
  return g
}

/* ─── Clip ⇄ ClipFile ─── */

export function encodeClip(clip: Clip): ClipFile {
  const { cols, rows } = clip.frames[0]
  const file: ClipFile = { cols, rows, frames: clip.frames.map(encodeGrid) }
  if (clip.frames.length > 1) file.delays = clip.delays.slice()
  return file
}

export function decodeClip(f: ClipFile): Clip {
  const frames = f.frames.map((g) => decodeGrid(g, f.cols, f.rows))
  const delays = frames.length > 1 && f.delays ? f.delays.slice(0, frames.length) : [Infinity]
  return { frames, delays }
}

/* ─── Project ⇄ ProjectFile ─── */

/** 畫面的圖層轉成存檔格式；匯出 HTML 時拿掉原圖（TECH「不變式」#15）。Scene node 本身也走這支（多的欄位原樣帶過去）。 */
function encodeScreen<T extends Screen>(s: T, opts: { forExport?: boolean }): Omit<T, 'layers'> & { layers: ClipFile[] } {
  const { source, ...rest } = s
  const out = { ...rest, layers: s.layers.map(encodeClip) } as unknown as Omit<T, 'layers'> & { layers: ClipFile[] }
  if (source && !opts.forExport) out.source = source
  return out
}

function decodeScreen<T extends ScreenFile>(s: T): Omit<T, 'layers'> & { layers: Clip[] } {
  return { ...s, layers: s.layers.map(decodeClip) }
}

/** `forExport`：要放進匯出 HTML —— 拿掉原圖（`source`）與編輯器的版面（`layout`）。 */
export function encodeProject(p: Project, opts: { forExport?: boolean } = {}): ProjectFile {
  const file: ProjectFile = {
    format: FORMAT,
    version: FORMAT_VERSION,
    cellAspect: CELL_ASPECT,
    title: p.title,
    nodes: p.nodes.map((n): FlowNodeFile => {
      if (n.type === 'scene') return encodeScreen(n, opts) as SceneNodeFile
      if ((n.type === 'start' || n.type === 'end') && n.screen) return { ...n, screen: encodeScreen(n.screen, opts) }
      return n as FlowNodeFile
    }),
  }
  if (p.layout && !opts.forExport) file.layout = p.layout
  return file
}

export function decodeProject(raw: unknown): Project {
  let f = raw as ProjectFile
  if (!f || typeof f !== 'object' || f.format !== FORMAT) throw new ProjectFormatError('這不是 Unsaid 的專案檔')
  if (typeof f.version !== 'number' || f.version > FORMAT_VERSION)
    throw new ProjectFormatError(`這個專案檔是較新的版本（v${f.version}），請用新版的 Unsaid 打開`)
  while (f.version < FORMAT_VERSION) {
    const up = MIGRATIONS[f.version]
    if (!up) throw new ProjectFormatError(`不認得 v${f.version} 的專案檔`)
    f = up(f)
  }
  const project: Project = {
    title: f.title ?? '',
    nodes: f.nodes.map((n) => {
      if (n.type === 'scene') return decodeScreen(n)
      if ((n.type === 'start' || n.type === 'end') && n.screen) return { ...n, screen: decodeScreen(n.screen) }
      return n
    }) as FlowNode[],
  }
  if (f.layout) project.layout = f.layout
  return project
}

/* ─── 匯出 HTML 裡的專案資料 ─── */

/** 匯出檔裡放專案資料的 `<script>` 的 id。播放器與「拖回編輯器」都靠它找資料。 */
export const DATA_ELEMENT_ID = 'unsaid-data'

/** U+2028／U+2029：JSON 允許、舊 JS 引擎當成換行。用 fromCharCode 產生 —— 直接寫進原始碼的跳脫序列容易被工具轉成真字元，那會讓正規式斷掉。 */
const LINE_SEP = String.fromCharCode(0x2028)
const PARA_SEP = String.fromCharCode(0x2029)

/** JSON 放進 `<script>` 裡要跳脫 `<`：訊息裡若有 `</script>`，檔案會從那裡斷掉。 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').split(LINE_SEP).join('\\u2028').split(PARA_SEP).join('\\u2029')
}

/** 從匯出的 HTML 取回專案資料（DESIGN：把匯出檔拖回編輯器可以繼續編輯）。找不到回傳 null。 */
export function extractProjectFile(html: string): unknown | null {
  const re = new RegExp(`<script[^>]*id=["']${DATA_ELEMENT_ID}["'][^>]*>([\\s\\S]*?)</script>`, 'i')
  const m = html.match(re)
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}
