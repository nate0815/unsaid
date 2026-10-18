import { describe, expect, it } from 'vitest'
import { toMessage } from '../src/core/convert'
import { charWidth } from '../src/core/width'
import { hash, SceneFrames, type EffectSpec, type FrameCell } from '../src/player/effects'

const grid = () => toMessage(new Float32Array(40).fill(1), 10, 4, '我想a說', { threshold: 0.1, minAlpha: 1 })
const visible = (f: FrameCell[]) => f.filter((c) => c.w > 0 && c.a > 0).length

describe('hash', () => {
  it('同樣的輸入永遠同樣的輸出，落在 [0,1)', () => {
    expect(hash(5, 3)).toBe(hash(5, 3))
    for (let i = 0; i < 1000; i++) {
      const v = hash(i, i * 3)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('SceneFrames', () => {
  it('沒有特效時就是原本的格子', () => {
    const g = grid()
    const f = new SceneFrames(g, []).frame(1)
    expect(f.map((c) => c.ch)).toEqual(g.cells.map((c) => c.ch))
  })

  it('打字機：一開始全隱藏，結束時全出現，中途單調遞增', () => {
    const fx: EffectSpec[] = [{ kind: 'typewriter', speed: 1, intensity: 0 }]
    const s = new SceneFrames(grid(), fx)
    const total = visible(new SceneFrames(grid(), []).frame(0))
    expect(visible(s.frame(0))).toBe(0)
    let prev = 0
    for (let t = 0; t <= s.enterDuration(); t += 0.25) {
      const n = visible(s.frame(t))
      expect(n).toBeGreaterThanOrEqual(prev)
      prev = n
    }
    expect(visible(s.frame(s.enterDuration()))).toBe(total)
  })

  it('解碼：結束後回到正確的字；亂碼期間字寬不變', () => {
    const g = grid()
    const s = new SceneFrames(g, [{ kind: 'decode', speed: 1, intensity: 1 }])
    for (const t of [0, 0.3, 1, 2]) {
      s.frame(t).forEach((c, i) => {
        if (c.w > 0 && c.ch !== ' ') expect(charWidth(c.ch)).toBe(g.cells[i].w)
      })
    }
    expect(s.frame(s.enterDuration() + 0.01).map((c) => c.ch)).toEqual(g.cells.map((c) => c.ch))
  })

  it('波浪：全形字的右半格跟左半格同步位移，字不會裂開', () => {
    const f = new SceneFrames(grid(), [{ kind: 'wave', speed: 1, intensity: 1 }]).frame(0.7)
    f.forEach((c, i) => {
      if (c.w === 0) expect(c.dy).toBe(f[i - 1].dy)
    })
  })

  it('故障：亂碼保持原字寬，全形字左右半格位移一致', () => {
    const g = grid()
    const s = new SceneFrames(g, [{ kind: 'glitch', speed: 1, intensity: 1 }])
    for (let t = 0; t < 5; t += 0.09) {
      const f = s.frame(t)
      f.forEach((c, i) => {
        if (c.w > 0 && c.ch !== ' ') expect(charWidth(c.ch)).toBe(g.cells[i].w)
        if (c.w === 0) expect(c.dx).toBe(f[i - 1].dx)
      })
    }
  })
})
