/* 把畫面（含動圖與特效）錄成 GIF。
 *
 * 用的是**同一個 Renderer**，只是畫在不顯示的 canvas 上、時間由這裡一格一格推進 ——
 * 不是去錄螢幕，所以不會掉格，輸出也和預覽一致。
 * 全片共用一組 256 色調色盤（從幾個時間點取樣），避免每格調色盤不同造成閃爍。 */

import { applyPalette, GIFEncoder, quantize } from 'gifenc'
import type { Clip } from '../core/grid'
import { ClipFrames } from '../player/clip-frames'
import type { EffectSpec } from '../player/effects'
import { Renderer, type RenderStyle } from '../player/renderer'

export interface GifExportOptions {
  /** 輸出寬度（像素）。高度依字元格比例決定。 */
  width: number
  fps: number
  /** 錄幾秒。0 = 只輸出一格（靜態）。 */
  seconds: number
  loop: boolean
}

export const GIF_MAX_SECONDS = 15

/** 有持續型特效時至少錄這麼久，才看得出它在動。 */
const SUSTAIN_MIN_SECONDS = 3
/** 進場特效播完後再停留多久，讓人看清楚定格的畫面。 */
const HOLD_SECONDS = 1.5

/** 建議錄多久：涵蓋進場特效＋停留、圖層動畫一整輪、持續特效至少幾秒。都沒有就是 0（靜態）。 */
export function suggestSeconds(clip: Clip, effects: EffectSpec[]): number {
  const f = new ClipFrames(clip, effects)
  const enter = f.enterDuration()
  const sustain = effects.some((e) => e.kind === 'wave' || e.kind === 'glitch')
  let s = Math.max(enter > 0 ? enter + HOLD_SECONDS : 0, f.loopDuration())
  if (sustain) s = Math.max(s, SUSTAIN_MIN_SECONDS)
  return Math.min(GIF_MAX_SECONDS, Math.round(s * 10) / 10)
}

/** GIF 的停留時間以 1/100 秒為單位：先對齊，取樣時間才會和實際播放對得上。 */
export function frameDelayMs(fps: number): number {
  return Math.max(20, Math.round(100 / fps) * 10)
}

export async function exportGif(
  clip: Clip,
  effects: EffectSpec[],
  style: RenderStyle,
  opts: GifExportOptions,
  onProgress?: (done: number, total: number) => void
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  const renderer = new Renderer(canvas, { readback: true })
  renderer.setGrid(clip.frames[0])
  renderer.setStyle(style)
  renderer.fit(opts.width, Number.MAX_SAFE_INTEGER, 1)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const { width, height } = canvas

  const frames = new ClipFrames(clip, effects)
  const delay = frameDelayMs(opts.fps)
  const seconds = Math.min(GIF_MAX_SECONDS, opts.seconds)
  const total = seconds > 0 ? Math.max(1, Math.round((seconds * 1000) / delay)) : 1

  const render = (i: number) => {
    const f = frames.frame((i * delay) / 1000)
    renderer.setGrid(f.grid)
    renderer.draw(f.cells)
    return ctx.getImageData(0, 0, width, height).data
  }

  // 調色盤：從最多 8 個平均分布的時間點取樣像素。
  const picks = Math.min(8, total)
  const stride = 5
  const perPick = Math.ceil((width * height) / stride)
  const sample = new Uint8ClampedArray(picks * perPick * 4)
  let o = 0
  for (let k = 0; k < picks; k++) {
    const data = render(Math.floor((k * total) / picks))
    for (let p = 0; p < width * height; p += stride) {
      sample[o++] = data[p * 4]
      sample[o++] = data[p * 4 + 1]
      sample[o++] = data[p * 4 + 2]
      sample[o++] = 255
    }
  }
  const palette = quantize(sample.subarray(0, o), 256)

  const enc = GIFEncoder()
  for (let i = 0; i < total; i++) {
    const index = applyPalette(render(i), palette)
    enc.writeFrame(index, width, height, {
      palette: i === 0 ? palette : undefined,
      delay,
      repeat: opts.loop ? 0 : -1,
    })
    onProgress?.(i + 1, total)
    // 每幾格讓出主執行緒一次，進度才畫得出來、頁面不會整個卡住。
    if (i % 3 === 2) await new Promise((r) => setTimeout(r, 0))
  }
  enc.finish()
  return new Blob([enc.bytes() as BlobPart], { type: 'image/gif' })
}
