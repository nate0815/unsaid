/* 圖片 → 字元格。規格見 DESIGN「圖片轉字元」。
 *
 * 分兩段：`sampleImage` 碰瀏覽器（把圖縮成每格一個像素），其餘都是純函式，可以在 node 裡測。
 * 慣例：**深色背景、亮字**。亮的地方墨量多／字明顯；要反過來用 `invert`。
 */

import { CELL_ASPECT, emptyGrid, putChar, type Grid } from './grid'
import { pickByInk, type InkEntry } from './ink'
import { charWidth, splitChars } from './width'

/** 圖縮到字元格解析度之後的樣子：每格一組 rgb 與一個亮度。 */
export interface Sample {
  cols: number
  rows: number
  /** 每格 r,g,b。 */
  rgb: Uint8ClampedArray
  /** 每格亮度 0～1。 */
  lum: Float32Array
}

export interface Adjust {
  /** -1～1，加在亮度上。 */
  brightness: number
  /** 0～3，以 0.5 為中心拉伸。1 = 不變。 */
  contrast: number
  invert: boolean
}

export const COLS_MIN = 20
export const COLS_MAX = 200

/** 依原圖比例與字元格高寬比算列數 —— 圖不能被壓扁或拉長。 */
export function rowsFor(srcW: number, srcH: number, cols: number): number {
  return Math.max(1, Math.round(((srcH / srcW) * cols) / CELL_ASPECT))
}

/** 瀏覽器端：把圖縮成 cols × rows 像素，取每格的平均色。 */
export function sampleImage(
  img: CanvasImageSource,
  srcW: number,
  srcH: number,
  cols: number
): Sample {
  cols = Math.max(COLS_MIN, Math.min(COLS_MAX, Math.round(cols)))
  const rows = rowsFor(srcW, srcH, cols)
  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, cols, rows)
  return fromRGBA(ctx.getImageData(0, 0, cols, rows).data, cols, rows)
}

/** RGBA 像素陣列 → Sample。透明處當成黑色（= 沒有字）。 */
export function fromRGBA(rgba: ArrayLike<number>, cols: number, rows: number): Sample {
  const n = cols * rows
  const rgb = new Uint8ClampedArray(n * 3)
  const lum = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3] / 255
    const r = rgba[i * 4] * a
    const g = rgba[i * 4 + 1] * a
    const b = rgba[i * 4 + 2] * a
    rgb[i * 3] = r
    rgb[i * 3 + 1] = g
    rgb[i * 3 + 2] = b
    lum[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  }
  return { cols, rows, rgb, lum }
}

export function adjust(lum: Float32Array, p: Adjust): Float32Array {
  const out = new Float32Array(lum.length)
  for (let i = 0; i < lum.length; i++) {
    let v = p.invert ? 1 - lum[i] : lum[i]
    v = (v - 0.5) * p.contrast + 0.5 + p.brightness
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v
  }
  return out
}

/* ─────────── 輪廓 ─────────── */

/** 輪廓強度與方向（Sobel）。回傳每格的邊緣字元，沒有邊緣的格子是 null。
 *  `threshold` 0～1：越低描得越多。 */
export function outlineChars(
  lum: Float32Array,
  cols: number,
  rows: number,
  threshold: number
): (string | null)[] {
  const at = (c: number, r: number) =>
    lum[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))]
  const out: (string | null)[] = new Array(cols * rows).fill(null)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gx =
        at(c + 1, r - 1) + 2 * at(c + 1, r) + at(c + 1, r + 1) -
        at(c - 1, r - 1) - 2 * at(c - 1, r) - at(c - 1, r + 1)
      // 一格的高是寬的 CELL_ASPECT 倍：換成實際距離的梯度，角度才不會偏。
      const gy =
        (at(c - 1, r + 1) + 2 * at(c, r + 1) + at(c + 1, r + 1) -
          at(c - 1, r - 1) - 2 * at(c, r - 1) - at(c + 1, r - 1)) /
        CELL_ASPECT
      const mag = Math.hypot(gx, gy) / 4
      if (mag < threshold) continue
      out[r * cols + c] = edgeChar(Math.atan2(gy, gx) + Math.PI / 2)
    }
  }
  return out
}

/** 邊緣走向（弧度，螢幕座標 y 向下）→ 描邊字元。 */
export function edgeChar(angle: number): string {
  let deg = ((angle * 180) / Math.PI) % 180
  if (deg < 0) deg += 180
  if (deg < 22.5 || deg >= 157.5) return '-'
  if (deg < 67.5) return '\\'
  if (deg < 112.5) return '|'
  return '/'
}

/* ─────────── 兩種字元模式 ─────────── */

export interface DensityOptions {
  /** 每格的輪廓字元（`outlineChars` 的結果）；不描邊就不給。 */
  outline?: (string | null)[]
}

/** 密度模式：依亮度挑墨量最接近的字。 */
export function toDensity(
  lum: Float32Array,
  cols: number,
  rows: number,
  table: InkEntry[],
  opts: DensityOptions = {}
): Grid {
  const grid = emptyGrid(cols, rows)
  if (table.length === 0) return grid
  for (let r = 0; r < rows; r++) {
    let c = 0
    while (c < cols) {
      const i = r * cols + c
      const edge = opts.outline?.[i]
      if (edge) {
        putChar(grid, c, r, edge)
        c++
        continue
      }
      let pick = pickByInk(table, lum[i])
      if (pick && pick.w === 2 && c + 1 >= cols) pick = pickByInk(table, lum[i], true)
      if (pick && pick.ch !== ' ' && putChar(grid, c, r, pick.ch)) {
        c += pick.w
      } else {
        c++
      }
    }
  }
  return grid
}

export interface MessageOptions {
  /** 0～1：亮度低於它的格子不放字。 */
  threshold: number
  /** 0～1：剛過門檻的字有多明顯。越高 → 整句越好讀、圖越不明顯。 */
  minAlpha: number
}

/** 把一段話整理成要填的字：空白（含換行）收成一個半形空格，頭尾去掉。 */
export function messageChars(message: string): string[] {
  return splitChars(message.replace(/\s+/g, ' ').trim())
}

/** ⭐ 訊息填充模式：亮度只決定「這格有沒有字、字多明顯」，字依序取自那段話。
 *
 * 全形字需要連續兩格：落在一列最後一欄放不下時，那格留空，**那個字留給下一格**，
 * 不跳過也不切半 —— 句子才不會因為字寬而錯位或掉字（DESIGN「中文與全形字」）。
 * 話用完了就從頭再來。
 */
export function toMessage(
  lum: Float32Array,
  cols: number,
  rows: number,
  message: string,
  opts: MessageOptions
): Grid {
  const grid = emptyGrid(cols, rows)
  const chars = messageChars(message)
  if (chars.length === 0) return grid
  const { threshold, minAlpha } = opts
  const span = Math.max(1e-6, 1 - threshold)
  let k = 0
  for (let r = 0; r < rows; r++) {
    let c = 0
    while (c < cols) {
      const i = r * cols + c
      if (lum[i] < threshold) {
        c++
        continue
      }
      const ch = chars[k % chars.length]
      const w = charWidth(ch)
      if (c + w > cols) {
        c++
        continue
      }
      const l = w === 2 ? (lum[i] + lum[i + 1]) / 2 : lum[i]
      const a = minAlpha + (1 - minAlpha) * Math.min(1, Math.max(0, (l - threshold) / span))
      putChar(grid, c, r, ch, a)
      k++
      c += w
    }
  }
  return grid
}

/* ─────────── 純文字圖層 ─────────── */

/** 純文字 → 字元格：自動換行，全形字不會被拆到兩列，每列置中。 */
export function layoutText(text: string, cols: number): Grid {
  const lines: string[][] = []
  for (const para of text.split(/\r?\n/)) {
    let line: string[] = []
    let used = 0
    for (const ch of splitChars(para)) {
      const w = charWidth(ch)
      if (used + w > cols) {
        lines.push(line)
        line = []
        used = 0
      }
      line.push(ch)
      used += w
    }
    lines.push(line)
  }
  const grid = emptyGrid(cols, Math.max(1, lines.length))
  lines.forEach((line, r) => {
    const width = line.reduce((s, ch) => s + charWidth(ch), 0)
    let c = Math.floor((cols - width) / 2)
    for (const ch of line) {
      if (ch !== ' ') putChar(grid, c, r, ch)
      c += charWidth(ch)
    }
  })
  return grid
}

/** 純文字圖層：上下各留一列，字才不會貼著畫面邊緣。 */
export function textGrid(text: string, cols: number): Grid {
  const body = layoutText(text, cols)
  const grid = emptyGrid(body.cols, body.rows + 2)
  grid.cells.splice(body.cols, body.cells.length, ...body.cells)
  return grid
}
