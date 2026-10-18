/* 播放一個畫面：requestAnimationFrame 迴圈，把時間交給特效、把結果交給 renderer。
 * M2 的流程推進（Scene → Choice → End）會建在這之上。 */

import type { Clip } from '../core/grid'
import { ClipFrames } from './clip-frames'
import type { EffectSpec } from './effects'
import { Renderer, type RenderStyle } from './renderer'

export class ScenePlayer {
  readonly renderer: Renderer
  private frames: ClipFrames | null = null
  private start = 0
  /** 暫停時停在的時間（秒）；null = 正在播。 */
  private pausedAt: number | null = null
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
  show(clip: Clip, effects: EffectSpec[], style: RenderStyle, restart = true) {
    this.frames = new ClipFrames(clip, effects)
    this.renderer.setGrid(clip.frames[0])
    this.renderer.setStyle(style)
    this.resize()
    if (restart) {
      this.start = performance.now()
      this.pausedAt = null
    }
    if (!this.raf) this.raf = requestAnimationFrame(this.tick)
  }

  /** 進場特效要播多久（秒）。 */
  enterDuration(): number {
    return this.frames?.enterDuration() ?? 0
  }

  /** 從畫面開始到現在幾秒（暫停時是暫停那一刻）。 */
  elapsed(): number {
    return this.pausedAt ?? (performance.now() - this.start) / 1000
  }

  /** 跳到第 t 秒 —— 點擊跳過進場特效用。 */
  seek(t: number) {
    this.start = performance.now() - t * 1000
    if (this.pausedAt !== null) this.pausedAt = t
  }

  /** 停在當下這一格（Choice 疊上來時）。畫面照畫，只是時間不走。 */
  pause() {
    if (this.pausedAt === null) this.pausedAt = this.elapsed()
  }

  replay() {
    this.start = performance.now()
    this.pausedAt = null
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
    const f = this.frames.frame(this.pausedAt ?? (now - this.start) / 1000)
    // 同一個 Clip 的每一格尺寸相同，換格只換內容，不重新排版。
    this.renderer.setGrid(f.grid)
    this.renderer.draw(f.cells)
    this.lastDrawMs = performance.now() - t0
  }
}
