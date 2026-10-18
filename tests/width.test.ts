import { describe, expect, it } from 'vitest'
import { charWidth, splitChars } from '../src/core/width'

/** 看不見的字元一律用碼位寫：直接貼進原始碼的話，讀的人看不出那裡有字。 */
const cp = (n: number) => String.fromCodePoint(n)

describe('charWidth', () => {
  it('半形字佔 1 格', () => {
    for (const ch of ['a', 'Z', '0', ' ', '@', '~', '-']) expect(charWidth(ch)).toBe(1)
  })
  it('中文、全形標點、假名、韓文佔 2 格', () => {
    for (const ch of ['我', '說', '。', '，', '「', '！', '？', 'あ', 'ア', '한', '　']) expect(charWidth(ch)).toBe(2)
  })
  it('擴展 B 的漢字（代理對）與 emoji 佔 2 格', () => {
    expect(charWidth('𠀋')).toBe(2)
    expect(charWidth('😀')).toBe(2)
  })
  it('控制字元與組合符號不佔格', () => {
    for (const ch of [cp(10), cp(9), cp(0x301), cp(0x200b), cp(0xfe0f)]) expect(charWidth(ch)).toBe(0)
  })
})

describe('splitChars', () => {
  it('以碼位切開，代理對不會被切半', () => {
    expect(splitChars('a𠀋b')).toEqual(['a', '𠀋', 'b'])
  })
  it('丟掉零寬字元', () => {
    expect(splitChars('你' + cp(0x200b) + '好' + cp(10))).toEqual(['你', '好'])
  })
})
