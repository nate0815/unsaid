/* 特效：把靜態的字元格，依時間 t 變成「這一幀每格長什麼樣」。
 * 規格見 DESIGN「特效（第一批）」。M1 先做打字機、解碼（進場）與波浪、故障（持續）。
 *
 * 每個特效只做三件事之一：改字（ch）、乘明顯程度（a）、加位移（dx/dy，單位是格）。
 * 疊加時依清單順序套用：a 相乘、dx/dy 相加、ch 後者覆蓋前者。
 */

import type { Grid } from '../core/grid'

export type EffectKind = 'typewriter' | 'decode' | 'wave' | 'glitch'

export interface EffectSpec {
  kind: EffectKind
  /** 0.1～3，1 為預設速度。 */
  speed: number
  /** 0～1。 */
  intensity: number
}

/** 這一幀的一格。dx/dy 以「格」為單位，由 renderer 換成像素。 */
export interface FrameCell {
  ch: string
  w: 0 | 1 | 2
  a: number
  dx: number
  dy: number
}

/** 亂碼字元。全形格要換成全形亂碼，**格子寬度不能被特效改變**。 */
export const NOISE_NARROW = '!#$%&*+-/<=>?@[]^_{|}~01'
export const NOISE_WIDE = '口回田目囗日曰甲由申'
const NOISE_N = Array.from(NOISE_NARROW)
const NOISE_W = Array.from(NOISE_WIDE)

/** 由整數穩定地得到 [0,1) 的亂數：同一格、同一時段永遠得到同一個值，畫面才不會每幀亂跳。 */
export function hash(a: number, b = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  h = Math.imul(h, 0x297a2d39)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

export function noiseChar(w: 1 | 2, seed: number): string {
  const set = w === 2 ? NOISE_W : NOISE_N
  return set[Math.floor(seed * set.length) % set.length]
}

/** 一個準備好播放的畫面：預先算好每格的閱讀順序，之後每幀只做查表。 */
export class SceneFrames {
  readonly grid: Grid
  readonly effects: EffectSpec[]
  /** 每格在「有字的格子」裡的閱讀順序；沒字的格子是 -1。 */
  private readonly order: Int32Array
  private readonly count: number
  private readonly out: FrameCell[]

  constructor(grid: Grid, effects: EffectSpec[]) {
    this.grid = grid
    this.effects = effects
    this.order = new Int32Array(grid.cells.length).fill(-1)
    let n = 0
    grid.cells.forEach((c, i) => {
      if (c.w > 0 && c.ch !== ' ' && c.a > 0) this.order[i] = n++
    })
    this.count = n
    this.out = grid.cells.map((c) => ({ ch: c.ch, w: c.w, a: c.a, dx: 0, dy: 0 }))
  }

  /** 進場特效全部播完的時間（秒）。沒有進場特效就是 0。 */
  enterDuration(): number {
    let d = 0
    for (const e of this.effects) {
      if (e.kind === 'typewriter') d = Math.max(d, typewriterDur(e) + e.intensity * 0.5)
      if (e.kind === 'decode') d = Math.max(d, decodeDur(e))
    }
    return d
  }

  /** 算出時間 t（秒，從畫面開始算）的樣子。回傳的陣列會被下一次呼叫重用，不要留著。 */
  frame(t: number): FrameCell[] {
    const { cells, cols } = this.grid
    const out = this.out
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]
      const o = out[i]
      o.ch = c.ch
      o.w = c.w
      o.a = c.a
      o.dx = 0
      o.dy = 0
    }
    for (const e of this.effects) {
      switch (e.kind) {
        case 'typewriter':
          this.typewriter(e, t)
          break
        case 'decode':
          this.decode(e, t)
          break
        case 'wave':
          wave(out, cols, e, t)
          break
        case 'glitch':
          glitch(out, cols, this.grid.rows, e, t)
          break
      }
    }
    return out
  }

  /** 打字機：依閱讀順序逐一出現。intensity = 每個字淡入的柔和程度。 */
  private typewriter(e: EffectSpec, t: number) {
    const dur = typewriterDur(e)
    const fade = e.intensity * 0.5
    const head = (t / dur) * this.count
    const perChar = this.count > 0 ? dur / this.count : 0
    for (let i = 0; i < this.out.length; i++) {
      const k = this.order[i]
      if (k < 0) continue
      const o = this.out[i]
      if (k >= head) {
        o.a = 0
      } else if (fade > 0) {
        const since = (head - k) * perChar
        o.a *= Math.min(1, since / fade)
      }
    }
  }

  /** 解碼：先是亂碼，逐格穩定成正確的字。intensity = 穩定時間的隨機程度（0 = 同時穩定）。 */
  private decode(e: EffectSpec, t: number) {
    const dur = decodeDur(e)
    const tick = Math.floor(t * 16 * e.speed)
    for (let i = 0; i < this.out.length; i++) {
      if (this.order[i] < 0) continue
      const settle = dur * (1 - e.intensity + e.intensity * hash(i, 7))
      if (t >= settle) continue
      const o = this.out[i]
      if (o.w === 1 || o.w === 2) o.ch = noiseChar(o.w, hash(i, tick))
    }
  }
}

function typewriterDur(e: EffectSpec) {
  return 3 / e.speed
}
function decodeDur(e: EffectSpec) {
  return 2.5 / e.speed
}

/** 波浪：上下起伏。intensity 1 = 振幅 0.6 格。全形字的右半格跟著左半格動，字才不會裂開。 */
function wave(out: FrameCell[], cols: number, e: EffectSpec, t: number) {
  const amp = e.intensity * 0.6
  const phase = t * Math.PI * e.speed
  for (let i = 0; i < out.length; i++) {
    const col = i % cols
    const lead = out[i].w === 0 && col > 0 ? col - 1 : col
    out[i].dy += amp * Math.sin(phase - lead * 0.25)
  }
}

/** 故障：偶爾整列錯位、閃爍、換成亂碼。以「時段」為單位決定，同一時段內畫面穩定。 */
function glitch(out: FrameCell[], cols: number, rows: number, e: EffectSpec, t: number) {
  const slot = Math.floor(t * 12 * e.speed)
  const p = e.intensity * 0.12
  for (let r = 0; r < rows; r++) {
    // 錯位以「一段連續的列」為單位，比單列抖動更像訊號干擾。
    const band = Math.floor(r / 3)
    if (hash(band * 131 + 17, slot) >= p) continue
    const shift = Math.round((hash(band, slot + 1) - 0.5) * 6 * e.intensity)
    const flicker = 0.4 + 0.6 * hash(band + 3, slot)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const o = out[i]
      o.dx += shift
      o.a *= flicker
      if ((o.w === 1 || o.w === 2) && o.ch !== ' ' && hash(i, slot) < 0.3) {
        o.ch = noiseChar(o.w, hash(i, slot + 2))
      }
    }
  }
}
