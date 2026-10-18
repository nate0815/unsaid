import { describe, expect, it } from 'vitest'
import { adjust, edgeChar, fromRGBA, layoutText, messageChars, outlineChars, rowsFor, toDensity, toMessage } from '../src/core/convert'
import { CELL_ASPECT, findBrokenWide, type Grid } from '../src/core/grid'
import { buildInkTable, pickByInk } from '../src/core/ink'

/** 把一列讀回字串：全形右半格略過，空格保留。 */
function readRow(g: Grid, r: number) {
  return g.cells
    .slice(r * g.cols, (r + 1) * g.cols)
    .filter((c) => c.w > 0)
    .map((c) => c.ch)
    .join('')
}
/** 按閱讀順序讀出所有填進去的字。 */
function readAll(g: Grid) {
  return g.cells
    .filter((c) => c.w > 0 && c.ch !== ' ' && c.a > 0)
    .map((c) => c.ch)
    .join('')
}
const full = (n: number, v = 1) => new Float32Array(n).fill(v)

describe('長寬比校正', () => {
  it('列數依格子高寬比縮，圖不變形', () => {
    // 正方形的圖、80 欄 → 每格高是寬的 2 倍，所以 40 列
    expect(rowsFor(500, 500, 80)).toBe(80 / CELL_ASPECT)
    expect(rowsFor(1000, 500, 80)).toBe(20)
  })
})

describe('adjust', () => {
  it('反相、亮度、對比，並夾在 0～1', () => {
    const l = new Float32Array([0, 0.5, 1])
    expect(Array.from(adjust(l, { brightness: 0, contrast: 1, invert: true }))).toEqual([1, 0.5, 0])
    expect(Array.from(adjust(l, { brightness: 0.25, contrast: 1, invert: false }))).toEqual([0.25, 0.75, 1])
    expect(Array.from(adjust(l, { brightness: 0, contrast: 0, invert: false }))).toEqual([0.5, 0.5, 0.5])
  })
})

describe('fromRGBA', () => {
  it('透明像素當作黑色', () => {
    const s = fromRGBA([255, 255, 255, 0, 255, 255, 255, 255], 2, 1)
    expect(s.lum[0]).toBe(0)
    expect(s.lum[1]).toBeCloseTo(1)
  })
})

describe('訊息填充模式', () => {
  it('亮的格子依序填入那段話，話用完從頭再來', () => {
    const g = toMessage(full(10), 10, 1, 'abc', { threshold: 0.2, minAlpha: 0.3 })
    expect(readRow(g, 0)).toBe('abcabcabca')
  })

  it('暗的格子留空，而且不吃掉字', () => {
    const lum = new Float32Array([1, 0, 1, 0, 1])
    const g = toMessage(lum, 5, 1, 'xyz', { threshold: 0.5, minAlpha: 0 })
    expect(readAll(g)).toBe('xyz')
  })

  it('全形字落在最後一欄放不下時，留空並把那個字留給下一列 —— 句子不掉字', () => {
    // 5 欄：「有些」佔 4 格，第 5 格放不下「話」→ 留空，「話」從下一列開頭接上
    const g = toMessage(full(10), 5, 2, '有些話我', { threshold: 0.1, minAlpha: 0 })
    expect(findBrokenWide(g)).toBe(-1)
    expect(readRow(g, 0)).toBe('有些 ')
    expect(readRow(g, 1)).toBe('話我 ')
    expect(readAll(g)).toBe('有些話我')
  })

  it('中英混排、任何欄數，全形字左右半格都成對、讀出來是原句的循環', () => {
    const msg = '我想說 hello，你好嗎？OK'
    const expected = messageChars(msg).join('').replace(/ /g, '')
    for (let cols = 20; cols <= 37; cols++) {
      const lum = Float32Array.from({ length: cols * 6 }, (_, i) => ((i * 7919) % 13) / 12)
      const g = toMessage(lum, cols, 6, msg, { threshold: 0.3, minAlpha: 0.2 })
      expect(findBrokenWide(g)).toBe(-1)
      const got = readAll(g)
      expect(expected.repeat(Math.ceil(got.length / expected.length) + 1).startsWith(got)).toBe(true)
    }
  })

  it('越亮越明顯；剛過門檻的是 minAlpha', () => {
    const g = toMessage(new Float32Array([0.5, 1]), 2, 1, 'ab', { threshold: 0.5, minAlpha: 0.3 })
    expect(g.cells[0].a).toBeCloseTo(0.3)
    expect(g.cells[1].a).toBeCloseTo(1)
  })

  it('空白與換行收成一個空格', () => {
    expect(messageChars('  你\n\n好  嗎 ').join('')).toBe('你 好 嗎')
  })
})

describe('密度模式', () => {
  // 假的量測：故意打亂輸入順序，看它會不會自己排好
  const INK: Record<string, number> = { ' ': 0, '.': 0.1, '+': 0.5, '#': 0.9, 墨: 1 }
  const table = buildInkTable('#. +墨', (ch) => INK[ch] ?? 0.3)

  it('自動依墨量排出淡→濃，製作者不必自己排', () => {
    expect(table.map((e) => e.ch).join('')).toBe(' .+#墨')
    expect(table[0].ink).toBe(0)
    expect(table[table.length - 1].ink).toBe(1)
  })

  it('重複的字只留一個；只有一個字時墨量為 1', () => {
    expect(buildInkTable('aaa', () => 0.4)).toEqual([{ ch: 'a', w: 1, ink: 1 }])
  })

  it('依亮度挑墨量最接近的字', () => {
    expect(pickByInk(table, 0.52)!.ch).toBe('+')
    expect(pickByInk(table, 1, true)!.ch).toBe('#')
  })

  it('全形字放不下就改挑半形字，左右半格都成對', () => {
    const g = toDensity(full(15), 5, 3, table)
    expect(findBrokenWide(g)).toBe(-1)
    expect(readRow(g, 0)).toBe('墨墨#')
  })

  it('最淡的字是空格時，暗處留白', () => {
    const g = toDensity(full(4, 0), 4, 1, table)
    expect(readAll(g)).toBe('')
  })
})

describe('輪廓', () => {
  it('邊緣走向對到描邊字元（螢幕座標 y 向下）', () => {
    expect(edgeChar(0)).toBe('-')
    expect(edgeChar(Math.PI / 2)).toBe('|')
    expect(edgeChar(Math.PI / 4)).toBe('\\')
    expect(edgeChar((3 * Math.PI) / 4)).toBe('/')
    expect(edgeChar(-Math.PI / 4)).toBe('/')
  })

  it('左暗右亮的垂直邊描成 |，平坦處不描', () => {
    const cols = 6
    const rows = 4
    const lum = Float32Array.from({ length: cols * rows }, (_, i) => (i % cols >= 3 ? 1 : 0))
    const out = outlineChars(lum, cols, rows, 0.2)
    expect(out[1 * cols + 2]).toBe('|')
    expect(out[1 * cols + 0]).toBeNull()
  })
})

describe('純文字圖層', () => {
  it('換行、置中，全形字不會被拆到兩列', () => {
    const g = layoutText('有些話\n我一直沒有說出口', 9)
    expect(findBrokenWide(g)).toBe(-1)
    expect(g.rows).toBe(3) // 「我一直沒」佔 8 格，「有說出口」換到第三列
    expect(readRow(g, 0).trim()).toBe('有些話')
    expect(readRow(g, 1).trim()).toBe('我一直沒')
    expect(readRow(g, 2).trim()).toBe('有說出口')
  })
})
