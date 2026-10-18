/* 播放一個畫面：requestAnimationFrame 迴圈，把時間交給特效、把結果交給 renderer。
 * M2 的流程推進（Scene → Choice → End）會建在這之上。 */

import type { Grid } from '../core/grid'
import { SceneFrames, type EffectSpec } from './effects'
import { Renderer, type RenderStyle } from './renderer'

export class ScenePlayer {
  readonly renderer: Renderer
  private frames: SceneFrames | null = null
  private start = 0
  private raf = 0
  /** 最近一幀的繪製耗時（毫秒），給 spike 頁顯示效能用。 */
  lastDrawMs = 0

  constructor(
    canvas: HTMLCanvasElement,
    private readonly viewport: () => { width: number; height: number }
  ) {
    this.renderer = new Renderer(canvas)
  }

  /** 換畫面。`restart` 為 false 時沿用目前的時間 —— 拉拉桿時進場特效不會一直重播。 */
  show(grid: Grid, effects: EffectSpec[], style: RenderStyle, restart = true) {
    this.frames = new SceneFrames(grid, effects)
    this.renderer.setGrid(grid)
    this.renderer.setStyle(style)
    this.resize()
    if (restart) this.start = performance.now()
    if (!this.raf) this.raf = requestAnimationFrame(this.tick)
  }

  replay() {
    this.start = performance.now()
  }

  resize() {
    const { width, height } = this.viewport()
    this.renderer.fit(width, height)
  }

  stop() {
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick)
    if (!this.frames) return
    const t0 = performance.now()
    this.renderer.draw(this.frames.frame((now - this.start) / 1000))
    this.lastDrawMs = performance.now() - t0
  }
}
