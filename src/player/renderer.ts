/* 把一幀畫到 canvas 上。Canvas 2D ＋ 字形圖集（PLAN「技術方向結論」）。
 *
 * 每幀三步：
 *   1. 把每格的字形從圖集貼到「字形層」（白色，帶各自的明顯程度）
 *   2. 字形層用 source-in 上色：單色就整片填前景色；原圖色就貼一張「每格一像素」的色圖
 *   3. 主畫布填背景色，疊上字形層
 * 上色一次完成，而不是每個字各自設 fillStyle —— 數千格逐一 fillText 會掉幀。
 */

import { CELL_ASPECT, type Grid } from '../core/grid'
import { drawGlyph } from '../core/glyph'
import type { FrameCell } from './effects'

export interface RenderStyle {
  fg: string
  bg: string
  /** 用 grid.colors 逐格上色（沒有 colors 時退回 fg）。 */
  useColors: boolean
}

/** 字形圖集：每個字一個固定大小的槽（2 格寬 × 1 格高），滿了就換一張更大的。 */
class Atlas {
  canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private slots = new Map<string, number>()
  private perRow = 32
  private slotW = 0
  private slotH = 0
  private cellPx = 0

  constructor() {
    this.canvas = document.createElement('canvas')
    this.ctx = this.canvas.getContext('2d')!
  }

  /** 格寬（裝置像素）變了就整張重畫 —— 圖集裡的字必須和畫面上的格子一樣大，否則會糊。 */
  reset(cellPx: number) {
    if (cellPx === this.cellPx) return
    this.cellPx = cellPx
    this.slotW = Math.ceil(cellPx * 2)
    this.slotH = Math.ceil(cellPx * CELL_ASPECT)
    this.slots.clear()
    this.grow(64)
  }

  private grow(capacity: number) {
    const old = this.slots.size > 0 ? this.canvas : null
    const next = document.createElement('canvas')
    next.width = this.slotW * this.perRow
    next.height = this.slotH * Math.ceil(capacity / this.perRow)
    const ctx = next.getContext('2d')!
    if (old) ctx.drawImage(old, 0, 0)
    this.canvas = next
    this.ctx = ctx
  }

  /** 取一個字的槽位，沒有就畫進去。回傳槽的左上角像素座標。 */
  get(ch: string, w: 1 | 2): [number, number] {
    let idx = this.slots.get(ch)
    if (idx === undefined) {
      idx = this.slots.size
      const capacity = (this.canvas.height / this.slotH) * this.perRow
      if (idx >= capacity) this.grow(capacity * 2)
      this.slots.set(ch, idx)
      const [x, y] = this.pos(idx)
      this.ctx.fillStyle = '#fff'
      drawGlyph(this.ctx, ch, x, y, w, this.cellPx)
    }
    return this.pos(idx)
  }

  private pos(idx: number): [number, number] {
    return [(idx % this.perRow) * this.slotW, Math.floor(idx / this.perRow) * this.slotH]
  }
}

export class Renderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly layer = document.createElement('canvas')
  private readonly layerCtx = this.layer.getContext('2d')!
  private readonly colorMap = document.createElement('canvas')
  private readonly atlas = new Atlas()
  private grid: Grid | null = null
  private style: RenderStyle = { fg: '#e8e6e3', bg: '#0b0b0d', useColors: false }
  /** 格寬，CSS 像素。 */
  cellW = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
  }

  setStyle(style: RenderStyle) {
    this.style = style
  }

  setGrid(grid: Grid) {
    this.grid = grid
    if (grid.colors) {
      this.colorMap.width = grid.cols
      this.colorMap.height = grid.rows
      const ctx = this.colorMap.getContext('2d')!
      const img = ctx.createImageData(grid.cols, grid.rows)
      for (let i = 0; i < grid.cols * grid.rows; i++) {
        img.data[i * 4] = grid.colors[i * 3]
        img.data[i * 4 + 1] = grid.colors[i * 3 + 1]
        img.data[i * 4 + 2] = grid.colors[i * 3 + 2]
        img.data[i * 4 + 3] = 255
      }
      ctx.putImageData(img, 0, 0)
    }
  }

  /** 把字元格縮放到塞得進 (maxW, maxH) 的 CSS 像素範圍（DESIGN「播放器呈現」：不出現橫向捲動）。 */
  fit(maxW: number, maxH: number) {
    const g = this.grid
    if (!g) return
    const cellW = Math.max(1, Math.min(maxW / g.cols, maxH / (g.rows * CELL_ASPECT)))
    const dpr = window.devicePixelRatio || 1
    const cssW = cellW * g.cols
    const cssH = cellW * CELL_ASPECT * g.rows
    this.cellW = cellW
    this.canvas.style.width = `${cssW}px`
    this.canvas.style.height = `${cssH}px`
    this.canvas.width = Math.round(cssW * dpr)
    this.canvas.height = Math.round(cssH * dpr)
    this.layer.width = this.canvas.width
    this.layer.height = this.canvas.height
    // 用實際畫布寬反推格寬（canvas 尺寸是整數，會有捨入），draw() 也是這樣算 —— 兩邊一致字才不會糊。
    this.atlas.reset(this.canvas.width / g.cols)
  }

  draw(frame: FrameCell[]) {
    const g = this.grid
    if (!g) return
    const { width, height } = this.canvas
    const px = width / g.cols
    const py = px * CELL_ASPECT
    const L = this.layerCtx
    L.globalCompositeOperation = 'source-over'
    L.clearRect(0, 0, width, height)
    for (let i = 0; i < frame.length; i++) {
      const f = frame[i]
      if (f.a <= 0 || f.w === 0 || f.ch === ' ' || f.ch === '') continue
      const [sx, sy] = this.atlas.get(f.ch, f.w)
      const sw = Math.ceil(px * f.w)
      const sh = Math.ceil(py)
      L.globalAlpha = f.a > 1 ? 1 : f.a
      L.drawImage(
        this.atlas.canvas,
        sx, sy, sw, sh,
        Math.round(((i % g.cols) + f.dx) * px),
        Math.round((Math.floor(i / g.cols) + f.dy) * py),
        sw, sh
      )
    }
    L.globalAlpha = 1
    L.globalCompositeOperation = 'source-in'
    if (this.style.useColors && g.colors) {
      L.imageSmoothingEnabled = false
      L.drawImage(this.colorMap, 0, 0, width, height)
    } else {
      L.fillStyle = this.style.fg
      L.fillRect(0, 0, width, height)
    }
    L.globalCompositeOperation = 'source-over'

    const C = this.ctx
    C.fillStyle = this.style.bg
    C.fillRect(0, 0, width, height)
    C.drawImage(this.layer, 0, 0)
  }
}
