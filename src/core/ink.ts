/* 墨量：一個字在格子裡塗黑了多少面積。密度模式靠它自動排出亮→暗順序
 * （DESIGN「圖片轉字元」：製作者不必手動排順序）。 */

import { charWidth, splitChars } from './width'
import { CELL_ASPECT } from './grid'
import { drawGlyph } from './glyph'

export interface InkEntry {
  ch: string
  w: 1 | 2
  /** 正規化後的墨量 0～1：這組字元裡最淡的是 0、最濃的是 1。 */
  ink: number
}

/** 量測函式：回傳「每格平均」的原始墨量（全形字除以 2 格，才能和半形字比）。 */
export type InkMeasure = (ch: string, w: 1 | 2) => number

/** 把製作者給的字元組排成墨量由淡到濃的表。重複的字只留一個。
 *  所有字墨量都一樣（例如只給一個字）時，ink 一律為 1。 */
export function buildInkTable(charset: string, measure: InkMeasure): InkEntry[] {
  const seen = new Set<string>()
  const raw: { ch: string; w: 1 | 2; v: number }[] = []
  for (const ch of splitChars(charset)) {
    if (seen.has(ch)) continue
    seen.add(ch)
    const w = charWidth(ch) as 1 | 2
    raw.push({ ch, w, v: measure(ch, w) })
  }
  if (raw.length === 0) return []
  let lo = Infinity
  let hi = -Infinity
  for (const r of raw) {
    lo = Math.min(lo, r.v)
    hi = Math.max(hi, r.v)
  }
  const span = hi - lo
  return raw
    .map((r) => ({ ch: r.ch, w: r.w, ink: span > 0 ? (r.v - lo) / span : 1 }))
    .sort((a, b) => a.ink - b.ink)
}

/** 在表裡挑墨量最接近 target 的字。`narrowOnly` 時只挑半形字（全形字放不下的時候）。 */
export function pickByInk(table: InkEntry[], target: number, narrowOnly = false): InkEntry | null {
  let best: InkEntry | null = null
  let bestD = Infinity
  for (const e of table) {
    if (narrowOnly && e.w === 2) continue
    const d = Math.abs(e.ink - target)
    if (d < bestD) {
      bestD = d
      best = e
    }
  }
  return best
}

/** 瀏覽器端的量測：畫進一個小 canvas，數 alpha。結果快取 —— 同一個字只量一次。 */
export function canvasInkMeasure(): InkMeasure {
  const cellW = 24
  const cellH = cellW * CELL_ASPECT
  const canvas = document.createElement('canvas')
  canvas.width = cellW * 2
  canvas.height = cellH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const cache = new Map<string, number>()
  return (ch, w) => {
    const hit = cache.get(ch)
    if (hit !== undefined) return hit
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#fff'
    drawGlyph(ctx, ch, 0, 0, w, cellW)
    const data = ctx.getImageData(0, 0, cellW * w, cellH).data
    let sum = 0
    for (let i = 3; i < data.length; i += 4) sum += data[i]
    const v = sum / 255 / (cellW * cellH * w)
    cache.set(ch, v)
    return v
  }
}
