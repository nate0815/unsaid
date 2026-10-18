/* 字元格：一個圖層的資料本體。轉換器產生它、播放器畫它。 */

import { charWidth } from './width'

/** 字元格的高寬比（高 ÷ 寬）。**固定常數，不由字型量測。**
 *
 * 為什麼固定：圖片轉字元時的長寬比校正依賴它（DESIGN「圖片轉字元」）。
 * 若改由各裝置的字型量測，觀看者的字型一不同，圖就會被壓扁或拉長。
 * 取 2 的理由：全形字佔兩格 → 2 格寬 × 1 格高 剛好是正方形，正好裝下方塊字。
 */
export const CELL_ASPECT = 2

/** 一格。
 * - `w: 1`：半形字，或空格（`ch === ' '`）
 * - `w: 2`：全形字的**左半**，右邊那格必定是 `w: 0`
 * - `w: 0`：全形字的**右半**（佔位，不畫東西）
 */
export interface Cell {
  ch: string
  w: 0 | 1 | 2
  /** 明顯程度 0～1。訊息填充模式用它表現亮度；密度模式恆為 1。 */
  a: number
}

export interface Grid {
  cols: number
  rows: number
  /** 逐列排列，長度恆為 cols × rows。 */
  cells: Cell[]
  /** 逐格顏色（每格 r,g,b 三個值）。沒有就用單色。 */
  colors?: Uint8ClampedArray
}

/** 會動的圖層：一串同尺寸的字元格，各自停留 delays[i] 毫秒，播完從頭循環。
 *  靜態圖就是只有一格的 Clip。 */
export interface Clip {
  frames: Grid[]
  delays: number[]
}

export function stillClip(grid: Grid): Clip {
  return { frames: [grid], delays: [Infinity] }
}

/** 一輪的總長（毫秒）。靜態圖是 Infinity。 */
export function clipDuration(clip: Clip): number {
  return clip.delays.reduce((s, d) => s + d, 0)
}

/** 時間 t（毫秒）時該顯示第幾格。 */
export function clipIndexAt(clip: Clip, t: number): number {
  const total = clipDuration(clip)
  if (clip.frames.length <= 1 || !isFinite(total) || total <= 0) return 0
  let r = ((t % total) + total) % total
  for (let i = 0; i < clip.delays.length; i++) {
    if (r < clip.delays[i]) return i
    r -= clip.delays[i]
  }
  return clip.delays.length - 1
}

export const BLANK: Readonly<Cell> = Object.freeze({ ch: ' ', w: 1, a: 0 })

export function emptyGrid(cols: number, rows: number): Grid {
  const cells: Cell[] = new Array(cols * rows)
  for (let i = 0; i < cells.length; i++) cells[i] = { ...BLANK }
  return { cols, rows, cells }
}

/** 在 (col,row) 放一個字。全形字會一併寫右半格。
 *  放不下（全形字落在最後一欄）就回傳 false、什麼都不寫 —— **絕不把全形字切成半個**。 */
export function putChar(grid: Grid, col: number, row: number, ch: string, a = 1): boolean {
  const w = charWidth(ch)
  if (w === 0 || col < 0 || row < 0 || row >= grid.rows || col + w > grid.cols) return false
  const i = row * grid.cols + col
  grid.cells[i] = { ch, w, a }
  if (w === 2) grid.cells[i + 1] = { ch: '', w: 0, a }
  return true
}

/** 檢查全形字的左右半格是否成對 —— 測試與除錯用。回傳第一個壞掉的格子索引，沒問題回傳 -1。 */
export function findBrokenWide(grid: Grid): number {
  const { cols, cells } = grid
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    const col = i % cols
    if (c.w === 2 && (col === cols - 1 || cells[i + 1].w !== 0)) return i
    if (c.w === 0 && (col === 0 || cells[i - 1].w !== 2)) return i
  }
  return -1
}
