/* 圖層來源（原圖＋轉換參數）→ 字元畫面（Clip）。編輯器與 spike 頁共用這一支，
 * 「同樣的參數轉出同樣的畫面」才成立。 */

import { adjust, outlineChars, sampleImage, textGrid, toDensity, toMessage, type Sample } from '../core/convert'
import { stillClip, type Clip, type Grid } from '../core/grid'
import { buildInkTable, type InkMeasure } from '../core/ink'
import { fromBase64, toBase64, type ConvertParams, type LayerSource, type SceneSource } from '../core/project'
import { GifSource } from './gif-decode'

/** 專案檔裡靜態圖的長邊上限（DESIGN「專案存檔」）。 */
export const SOURCE_MAX_SIDE = 800

/** 一組樣本（每格動畫一份）依參數轉成字元格。 */
export function gridsFromSamples(samples: Sample[], p: ConvertParams, measure: InkMeasure): Grid[] {
  const table = p.mode === 'density' ? buildInkTable(p.charset, measure) : []
  return samples.map((s) => {
    const lum = adjust(s.lum, p)
    let grid: Grid
    if (p.mode === 'density') {
      const outline = p.outline ? outlineChars(lum, s.cols, s.rows, p.outlineThreshold) : undefined
      grid = toDensity(lum, s.cols, s.rows, table, { outline })
    } else {
      grid = toMessage(lum, s.cols, s.rows, p.message, p)
    }
    grid.colors = s.rgb
    return grid
  })
}

/** 純文字圖層的排版搬到 core（存檔格式升級時也要用），這裡轉出，既有的 import 不必改。 */
export { textGrid }

/** GIF 的每一格各取一份樣本。逐格解碼、用完即丟（見 gif-decode）。 */
export function gifSamples(gif: GifSource, cols: number): Sample[] {
  const frame = document.createElement('canvas')
  frame.width = gif.width
  frame.height = gif.height
  const ctx = frame.getContext('2d')!
  const samples: Sample[] = []
  gif.forEachFrame((rgba) => {
    ctx.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, gif.width, gif.height), 0, 0)
    samples.push(sampleImage(frame, gif.width, gif.height, cols))
  })
  return samples
}

export async function loadImage(dataUrl: string): Promise<ImageBitmap> {
  const blob = await (await fetch(dataUrl)).blob()
  return createImageBitmap(blob)
}

export function gifFromBase64(b64: string): GifSource {
  const bytes = fromBase64(b64)
  return new GifSource(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
}

export async function renderSource(src: SceneSource, measure: InkMeasure): Promise<Clip> {
  const { layer, params } = src
  if (layer.kind === 'text') return stillClip(textGrid(layer.text, params.cols))
  if (layer.kind === 'gif') {
    const gif = gifFromBase64(layer.gif)
    return { frames: gridsFromSamples(gifSamples(gif, params.cols), params, measure), delays: gif.delays.slice() }
  }
  const img = await loadImage(layer.image)
  return stillClip(gridsFromSamples([sampleImage(img, img.width, img.height, params.cols)], params, measure)[0])
}

/** 使用者選的圖檔 → 要存進專案的圖層來源。GIF 動圖保留原檔；其他圖縮到長邊 800 px。 */
export async function sourceFromFile(file: Blob): Promise<LayerSource> {
  const bytes = await file.arrayBuffer()
  const head = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength))
  const isGif = head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38
  if (isGif) {
    try {
      if (new GifSource(bytes).frameCount > 1) return { kind: 'gif', gif: toBase64(new Uint8Array(bytes)) }
    } catch {
      /* 解析失敗就當靜態圖 */
    }
  }
  const bmp = await createImageBitmap(new Blob([bytes], { type: file.type }))
  const scale = Math.min(1, SOURCE_MAX_SIDE / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * scale))
  c.height = Math.max(1, Math.round(bmp.height * scale))
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  // 照片用 JPEG 小很多；PNG 原圖可能有透明，維持 PNG。
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  return { kind: 'image', image: c.toDataURL(type, 0.9) }
}
