/* 專案資料：一則訊息的全部內容。編輯器產生它、匯出檔內嵌它、播放器讀它。
 * 規格見 DESIGN「Node 種類」「Scene」「專案存檔」。
 *
 * 存檔格式（`ProjectFile`）與執行期格式（`Project`）分開：
 *   - 存檔格式要能 JSON 化、要小、要帶版本號 —— 字元格存成「每列一個字串」＋ base64
 *   - 執行期格式是 core 的 Grid／Clip，播放器直接拿來畫
 * 兩者只透過 `encodeProject`／`decodeProject` 轉換。 */

import { CELL_ASPECT, emptyGrid, putChar, type Clip, type Grid } from './grid'
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

export interface StartNode {
  id: string
  type: 'start'
  next: string | null
}

export interface SceneNode {
  id: string
  type: 'scene'
  /** MVP 只有一層；格式先做成陣列，之後多層合成不必改格式（DESIGN「Scene」）。 */
  layers: Clip[]
  style: SceneStyle
  effects: EffectSpec[]
  advance: Advance
  next: string | null
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
  text: string
  replay: boolean
}

export type FlowNode = StartNode | SceneNode | ChoiceNode | EndNode

export interface Project {
  title: string
  nodes: FlowNode[]
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
  }
  return problems
}

/* ─────────── 存檔格式 ─────────── */

export const FORMAT = 'unsaid'
/** 存檔格式版本。**改了格式就加一，並在 `MIGRATIONS` 補上從舊版升上來的函式**（DESIGN「專案存檔」：舊檔要打得開）。 */
export const FORMAT_VERSION = 1

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

export type SceneNodeFile = Omit<SceneNode, 'layers'> & { layers: ClipFile[] }
export type FlowNodeFile = Exclude<FlowNode, SceneNode> | SceneNodeFile

export interface ProjectFile {
  format: typeof FORMAT
  version: number
  /** 字元格高寬比（core 的 CELL_ASPECT）。記下來，將來改了常數才認得出舊檔。 */
  cellAspect: number
  title: string
  nodes: FlowNodeFile[]
}

/** 舊版 → 新版。key 是「從哪一版升上來」。v1 是第一版，目前沒有。 */
const MIGRATIONS: Record<number, (f: any) => any> = {}

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

export function encodeProject(p: Project): ProjectFile {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    cellAspect: CELL_ASPECT,
    title: p.title,
    nodes: p.nodes.map((n) => (n.type === 'scene' ? { ...n, layers: n.layers.map(encodeClip) } : n)),
  }
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
  return {
    title: f.title ?? '',
    nodes: f.nodes.map((n) => (n.type === 'scene' ? { ...n, layers: n.layers.map(decodeClip) } : n)) as FlowNode[],
  }
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
