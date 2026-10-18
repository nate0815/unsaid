// gifenc 1.0.3 沒附型別。只宣告本專案用到的部分。
declare module 'gifenc' {
  export type Palette = number[][]
  type Format = 'rgb565' | 'rgb444' | 'rgba4444'

  export interface Encoder {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: {
        palette?: Palette
        /** 毫秒，寫入時四捨五入成 1/100 秒。 */
        delay?: number
        /** -1 = 播一次，0 = 無限循環。只有第一格會寫入。 */
        repeat?: number
        transparent?: boolean
        transparentIndex?: number
        dispose?: number
      }
    ): void
    finish(): void
    bytes(): Uint8Array
  }

  export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): Encoder
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: { format?: Format }): Palette
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: Format): Uint8Array
}
