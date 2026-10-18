/* 會動的圖層（Clip）加上特效：時間 t → 這一幀要畫哪一格、每格長什麼樣。
 *
 * 兩條時間軸疊在一起：圖層自己的動畫（GIF 的每一格，循環）與特效（進場從 t=0 算起）。
 * 進場特效不會因為圖層換格而重播 —— 它跟著畫面的時間走，不跟著圖層。 */

import { clipDuration, clipIndexAt, type Clip, type Grid } from '../core/grid'
import { SceneFrames, type EffectSpec, type FrameCell } from './effects'

export interface ClipFrame {
  grid: Grid
  cells: FrameCell[]
}

export class ClipFrames {
  readonly clip: Clip
  private readonly scenes: SceneFrames[]

  constructor(clip: Clip, effects: EffectSpec[]) {
    this.clip = clip
    this.scenes = clip.frames.map((g) => new SceneFrames(g, effects))
  }

  /** 進場特效播完的時間（秒）。 */
  enterDuration(): number {
    return Math.max(0, ...this.scenes.map((s) => s.enterDuration()))
  }

  /** 圖層動畫一輪多長（秒）。靜態圖是 0。 */
  loopDuration(): number {
    const d = clipDuration(this.clip)
    return isFinite(d) ? d / 1000 : 0
  }

  /** 時間 t（秒）。回傳的 cells 會被下一次呼叫重用，不要留著。 */
  frame(t: number): ClipFrame {
    const i = clipIndexAt(this.clip, t * 1000)
    return { grid: this.clip.frames[i], cells: this.scenes[i].frame(t) }
  }
}
