/* 讀 GIF 動圖：解碼每一格、依 GIF 規則疊合成完整畫面。
 *
 * 屬於編輯器那一側（可以用套件）—— 播放器拿到的是轉好的字元格，從來不碰 GIF。
 * 解碼是**逐格、用完即丟**：每次欄數改變都重解一遍，不把整部動圖的像素留在記憶體
 * （500×500、200 格的 GIF 全展開就是 200 MB）。 */

import { decompressFrame, parseGIF, type ParsedGif } from 'gifuct-js'

/** 一格 GIF 的原料：要貼的那一塊、貼在哪、貼完怎麼處理。 */
export interface GifPatch {
  dims: { left: number; top: number; width: number; height: number }
  /** RGBA，透明像素的 alpha 是 0。 */
  patch: Uint8ClampedArray
  /** 0/1 = 保留，2 = 清成透明，3 = 還原成貼這格之前的樣子。 */
  disposalType: number
}

/** 把一格一格的 patch 疊成完整畫面（純函式，不碰 canvas）。
 *  回傳的 buffer 每次呼叫都重用 —— 要留就自己複製。 */
export class GifComposer {
  readonly width: number
  readonly height: number
  private readonly buf: Uint8ClampedArray
  private saved: Uint8ClampedArray | null = null
  private pending: GifPatch | null = null

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.buf = new Uint8ClampedArray(width * height * 4)
  }

  add(f: GifPatch): Uint8ClampedArray {
    this.dispose()
    if (f.disposalType === 3) this.saved = this.buf.slice()
    const { left, top, width, height } = f.dims
    for (let y = 0; y < height; y++) {
      const dy = top + y
      if (dy < 0 || dy >= this.height) continue
      for (let x = 0; x < width; x++) {
        const dx = left + x
        if (dx < 0 || dx >= this.width) continue
        const s = (y * width + x) * 4
        if (f.patch[s + 3] === 0) continue
        const d = (dy * this.width + dx) * 4
        this.buf[d] = f.patch[s]
        this.buf[d + 1] = f.patch[s + 1]
        this.buf[d + 2] = f.patch[s + 2]
        this.buf[d + 3] = 255
      }
    }
    this.pending = f
    return this.buf
  }

  /** 上一格的 disposal 在「下一格貼上之前」才生效 —— 這是 GIF 規格，也是常見的出錯點。 */
  private dispose() {
    const p = this.pending
    if (!p) return
    if (p.disposalType === 2) {
      const { left, top, width, height } = p.dims
      for (let y = Math.max(0, top); y < Math.min(this.height, top + height); y++) {
        this.buf.fill(0, (y * this.width + Math.max(0, left)) * 4, (y * this.width + Math.min(this.width, left + width)) * 4)
      }
    } else if (p.disposalType === 3 && this.saved) {
      this.buf.set(this.saved)
    }
    this.pending = null
  }
}

/** 瀏覽器常見的做法：停留 ≤ 10 ms 的格子當成 100 ms，否則很多舊 GIF 會快到看不清。 */
export function normalizeDelay(ms: number): number {
  return ms <= 10 ? 100 : ms
}

/** 超過就只取前面這麼多格。動圖轉成字元格之後每格都要存，太多格會拖慢調參數。 */
export const GIF_MAX_FRAMES = 300

export class GifSource {
  readonly width: number
  readonly height: number
  readonly delays: number[]
  private readonly gif: ParsedGif
  private readonly frames: ParsedGif['frames']

  constructor(bytes: ArrayBuffer) {
    this.gif = parseGIF(bytes)
    this.width = this.gif.lsd.width
    this.height = this.gif.lsd.height
    this.frames = this.gif.frames.filter((f) => 'image' in f).slice(0, GIF_MAX_FRAMES)
    // 只為了拿 delay 先解一遍（不建 patch，很快）。
    this.delays = this.frames.map((f) =>
      normalizeDelay(decompressFrame(f as Parameters<typeof decompressFrame>[0], this.gif.gct, false).delay)
    )
  }

  get frameCount() {
    return this.frames.length
  }

  /** 依序把每一格疊好的完整畫面交給 cb。cb 拿到的 buffer 會被下一格覆寫。 */
  forEachFrame(cb: (rgba: Uint8ClampedArray, index: number) => void) {
    const composer = new GifComposer(this.width, this.height)
    this.frames.forEach((f, i) => {
      const d = decompressFrame(f as Parameters<typeof decompressFrame>[0], this.gif.gct, true)
      cb(composer.add(d), i)
    })
  }
}

/** 檔案是不是 GIF：看開頭的 "GIF8"，不信副檔名或 MIME。 */
export function isGif(bytes: ArrayBuffer): boolean {
  const b = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength))
  return b.length === 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38
}
