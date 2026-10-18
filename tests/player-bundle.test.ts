/* 播放器打包檢查（PLAN「風險與應對」：播放器不小心長出相依）。
 * 打包一次，看大小、看有沒有混進不該有的東西。每次 npm test 都跑。 */
import { beforeAll, describe, expect, it } from 'vitest'
import { buildPlayer, PLAYER_BUDGET_KB } from '../tools/player-bundle'

describe('播放器打包', () => {
  let code = ''
  let files: string[] = []
  beforeAll(async () => {
    ;({ code, files } = await buildPlayer())
  }, 60_000)

  it(`打包後 ≤ ${PLAYER_BUDGET_KB} KB`, () => {
    const kb = new TextEncoder().encode(code).length / 1024
    console.log(`player bundle: ${kb.toFixed(1)} KB`)
    expect(kb).toBeLessThanOrEqual(PLAYER_BUDGET_KB)
  })

  it('只包含 src/core 與 src/player 的檔案（沒有套件、沒有編輯器端的程式）', () => {
    expect(files.length).toBeGreaterThan(0)
    const bad = files.filter((f) => !/[\\/]src[\\/](core|player)[\\/]/.test(f))
    expect(bad).toEqual([])
  })

  it('程式碼裡沒有會讓 HTML 斷掉的 </script', () => {
    expect(/<\/script/i.test(code)).toBe(false)
  })
})
