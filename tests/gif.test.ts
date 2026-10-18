import { applyPalette, GIFEncoder } from 'gifenc'
import { describe, expect, it } from 'vitest'
import { toMessage } from '../src/core/convert'
import { clipDuration, clipIndexAt, stillClip, type Clip } from '../src/core/grid'
import { GifComposer, GifSource, isGif, normalizeDelay, type GifPatch } from '../src/media/gif-decode'
import { frameDelayMs, GIF_MAX_SECONDS, suggestSeconds } from '../src/media/gif-export'
import { ClipFrames } from '../src/player/clip-frames'

const RED = [255, 0, 0, 255]
const BLUE = [0, 0, 255, 255]
const CLEAR = [0, 0, 0, 0]

function solid(w: number, h: number, c: number[]) {
  const a = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) a.set(c, i * 4)
  return a
}
function px(buf: Uint8ClampedArray, w: number, x: number, y: number) {
  return Array.from(buf.slice((y * w + x) * 4, (y * w + x) * 4 + 4))
}
const patch = (left: number, top: number, w: number, h: number, c: number[], disposalType = 1): GifPatch => ({
  dims: { left, top, width: w, height: h },
  patch: solid(w, h, c),
  disposalType,
})

describe('GifComposer：GIF 的疊合規則', () => {
  it('disposal 1：保留，下一格疊在上面', () => {
    const c = new GifComposer(4, 4)
    c.add(patch(0, 0, 4, 4, RED))
    const b = c.add(patch(1, 1, 2, 2, BLUE))
    expect(px(b, 4, 0, 0)).toEqual(RED)
    expect(px(b, 4, 1, 1)).toEqual(BLUE)
  })

  it('disposal 2：下一格貼上前，把那一塊清成透明', () => {
    const c = new GifComposer(4, 4)
    c.add(patch(0, 0, 4, 4, RED, 2))
    const b = c.add(patch(0, 0, 1, 1, BLUE))
    expect(px(b, 4, 0, 0)).toEqual(BLUE)
    expect(px(b, 4, 3, 3)).toEqual(CLEAR)
  })

  it('disposal 3：下一格貼上前，還原成這格貼上之前的樣子', () => {
    const c = new GifComposer(4, 4)
    c.add(patch(0, 0, 4, 4, RED))
    c.add(patch(0, 0, 2, 2, BLUE, 3))
    const b = c.add(patch(3, 3, 1, 1, BLUE))
    expect(px(b, 4, 0, 0)).toEqual(RED) // 藍色那塊被還原掉了
    expect(px(b, 4, 3, 3)).toEqual(BLUE)
  })

  it('透明像素不覆蓋底下；超出畫布的部分裁掉', () => {
    const c = new GifComposer(4, 4)
    c.add(patch(0, 0, 4, 4, RED))
    const b = c.add({ dims: { left: 2, top: 2, width: 4, height: 4 }, patch: solid(4, 4, CLEAR), disposalType: 1 })
    expect(px(b, 4, 3, 3)).toEqual(RED)
    expect(() => c.add(patch(3, 3, 4, 4, BLUE))).not.toThrow()
  })
})

describe('GifSource：用 gifenc 編、再解回來', () => {
  function encode(frames: number[][], w: number, h: number, delays: number[]) {
    const palette = [[255, 0, 0], [0, 0, 255], [0, 255, 0], [0, 0, 0]]
    const enc = GIFEncoder()
    frames.forEach((c, i) => {
      enc.writeFrame(applyPalette(solid(w, h, c), palette), w, h, { palette: i === 0 ? palette : undefined, delay: delays[i] })
    })
    enc.finish()
    const bytes = enc.bytes()
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  }

  it('格數、尺寸、每格顏色與停留時間都對得上', () => {
    const buf = encode([RED, BLUE, [0, 255, 0, 255]], 6, 3, [100, 250, 40])
    expect(isGif(buf)).toBe(true)
    const gif = new GifSource(buf)
    expect([gif.width, gif.height, gif.frameCount]).toEqual([6, 3, 3])
    expect(gif.delays).toEqual([100, 250, 40])
    const colors: number[][] = []
    gif.forEachFrame((rgba) => colors.push(px(rgba, 6, 5, 2)))
    expect(colors).toEqual([RED, BLUE, [0, 255, 0, 255]])
  })

  it('不是 GIF 的檔案認得出來', () => {
    expect(isGif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBe(false)
    expect(isGif(new ArrayBuffer(2))).toBe(false)
  })

  it('停留 ≤ 10 ms 的格子當成 100 ms（和瀏覽器一致）', () => {
    expect(normalizeDelay(0)).toBe(100)
    expect(normalizeDelay(10)).toBe(100)
    expect(normalizeDelay(20)).toBe(20)
  })
})

describe('Clip：會動的圖層', () => {
  const g = (ch: string) => toMessage(new Float32Array(4).fill(1), 4, 1, ch, { threshold: 0.1, minAlpha: 1 })
  const clip: Clip = { frames: [g('a'), g('b'), g('c')], delays: [100, 200, 300] }

  it('依時間挑格，播完從頭循環', () => {
    expect(clipDuration(clip)).toBe(600)
    expect([0, 99, 100, 299, 300, 599, 600, 700].map((t) => clipIndexAt(clip, t))).toEqual([0, 0, 1, 1, 2, 2, 0, 1])
  })

  it('靜態圖永遠是第 0 格', () => {
    const s = stillClip(g('a'))
    expect(clipIndexAt(s, 0)).toBe(0)
    expect(clipIndexAt(s, 1e9)).toBe(0)
  })

  it('ClipFrames 換格時換成那一格的內容', () => {
    const f = new ClipFrames(clip, [])
    expect(f.frame(0.05).cells[0].ch).toBe('a')
    expect(f.frame(0.15).cells[0].ch).toBe('b')
    expect(f.frame(0.45).grid).toBe(clip.frames[2])
    expect(f.loopDuration()).toBeCloseTo(0.6)
  })
})

describe('GIF 匯出的時間設定', () => {
  const still = stillClip(toMessage(new Float32Array(4).fill(1), 4, 1, 'a', { threshold: 0.1, minAlpha: 1 }))

  it('每格停留時間對齊 1/100 秒', () => {
    expect(frameDelayMs(15)).toBe(70)
    expect(frameDelayMs(10)).toBe(100)
    expect(frameDelayMs(20)).toBe(50)
  })

  it('建議長度：靜態無特效 = 0；進場特效 + 停留；持續特效至少 3 秒；動圖至少一輪；上限 15 秒', () => {
    expect(suggestSeconds(still, [])).toBe(0)
    expect(suggestSeconds(still, [{ kind: 'decode', speed: 1, intensity: 1 }])).toBeCloseTo(2.5 + 1.5)
    expect(suggestSeconds(still, [{ kind: 'wave', speed: 1, intensity: 1 }])).toBe(3)
    const anim: Clip = { frames: [still.frames[0], still.frames[0]], delays: [2500, 2500] }
    expect(suggestSeconds(anim, [])).toBe(5)
    const long: Clip = { frames: [still.frames[0]], delays: [60000] }
    expect(suggestSeconds({ frames: [...long.frames, ...long.frames], delays: [60000, 60000] }, [])).toBe(GIF_MAX_SECONDS)
  })
})
