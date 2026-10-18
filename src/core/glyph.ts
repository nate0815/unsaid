/* 單一字形怎麼畫進一個格子。墨量量測與播放器的字形圖集**共用這一支**，
 * 量到的墨量才會等於畫出來的樣子。 */

import { CELL_ASPECT } from './grid'

/** 字型堆疊。字型未內嵌前（DESIGN 待決 #3）各裝置會取到不同字型，
 *  但格子位置不受影響 —— 每個字都被放進自己的格子裡，不靠字型排版。 */
export const FONT_FAMILY =
  '"Sarasa Mono TC", "Noto Sans Mono CJK TC", ui-monospace, Menlo, Consolas, "Microsoft JhengHei", "PingFang TC", monospace'

/** 字級佔格高的比例。半形字約 0.6em 寬，0.82 × 格高 ≈ 0.98 × 格寬，剛好塞得進。 */
const FONT_SCALE = 0.82

/** 在 (x,y) 為左上角、寬 w 格、格寬 cellW 的方框裡置中畫一個字。
 *  字形比方框寬（某些字型的全形標點、emoji）就水平壓縮，**絕不溢出到鄰格**。 */
export function drawGlyph(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ch: string,
  x: number,
  y: number,
  w: 1 | 2,
  cellW: number
): void {
  const cellH = cellW * CELL_ASPECT
  const boxW = cellW * w
  ctx.font = `${Math.max(1, Math.round(cellH * FONT_SCALE))}px ${FONT_FAMILY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const measured = ctx.measureText(ch).width
  const cx = x + boxW / 2
  const cy = y + cellH / 2
  if (measured > boxW * 0.98) {
    const sx = (boxW * 0.98) / measured
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(sx, 1)
    ctx.fillText(ch, 0, 0)
    ctx.restore()
  } else {
    ctx.fillText(ch, cx, cy)
  }
}
