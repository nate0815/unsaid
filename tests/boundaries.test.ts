/* 模組邊界（PLAN「架構」、AGENTS.md「這個專案的性質」）：
 *   core   只能 import core
 *   player 只能 import core、player
 * 而且兩者都不准有任何套件相依。播放器會被整份內嵌進匯出檔 ——
 * 相依一進來，匯出檔就變肥、預覽與成品開始不一致，而且不會報錯。 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(__dirname, '../src')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}

/** 抓出所有 import／export from／動態 import 的目標字串。 */
function imports(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  const re = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]/g
  return [...src.matchAll(re)].map((m) => m[1] ?? m[2] ?? m[3])
}

const allowed: Record<string, string[]> = {
  core: ['core'],
  player: ['core', 'player'],
}

describe('模組邊界', () => {
  it('偵測得到 import（防止正規式失效而測試空轉）', () => {
    expect(imports(join(SRC, 'player/renderer.ts')).length).toBeGreaterThan(0)
  })

  for (const [mod, ok] of Object.entries(allowed)) {
    it(`${mod}/ 只 import ${ok.join('、')}，而且沒有任何套件相依`, () => {
      for (const f of files(join(SRC, mod))) {
        for (const spec of imports(f)) {
          const where = `${relative(SRC, f)} → ${spec}`
          expect(spec.startsWith('.'), `不准 import 套件：${where}`).toBe(true)
          const target = relative(SRC, resolve(dirname(f), spec)).split(/[\\/]/)[0]
          expect(ok, `越界 import：${where}`).toContain(target)
        }
      }
    })
  }
})
