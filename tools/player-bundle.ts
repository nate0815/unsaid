/* 把播放器（src/player/main.ts）打包成一支自給自足的 JS，給匯出 HTML 內嵌用。
 *
 * 編輯器端透過虛擬模組 `virtual:unsaid-player` 拿到這段程式碼字串（見 vite.config.ts）。
 * 匯出檔與預覽因此跑的是**同一份打包結果**，不是另一套程式（PLAN「核心判斷」）。 */

import { resolve } from 'node:path'
import { build, type Plugin } from 'vite'

export const PLAYER_ENTRY = resolve(import.meta.dirname, '../src/player/main.ts')
export const PLAYER_VIRTUAL_ID = 'virtual:unsaid-player'
/** 播放器打包後的大小上限（KB，未壓縮）。超過就是長出了不該有的東西 —— 測試會擋。 */
export const PLAYER_BUDGET_KB = 40

export async function buildPlayer(): Promise<{ code: string; files: string[] }> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: true,
      emptyOutDir: false,
      lib: { entry: PLAYER_ENTRY, formats: ['iife'], name: 'UnsaidPlayer', fileName: () => 'player.js' },
    },
  })
  const outputs = Array.isArray(result) ? result : [result]
  for (const out of outputs) {
    if (!('output' in out)) continue
    const chunk = out.output.find((o) => o.type === 'chunk')
    if (chunk && chunk.type === 'chunk') return { code: chunk.code, files: Object.keys(chunk.modules) }
  }
  throw new Error('播放器打包沒有產出程式碼')
}

/** Vite 外掛：`import playerSource from 'virtual:unsaid-player'` 得到打包好的播放器程式碼字串。 */
export function playerBundlePlugin(): Plugin {
  const resolved = '\0' + PLAYER_VIRTUAL_ID
  return {
    name: 'unsaid-player-bundle',
    resolveId(id) {
      if (id === PLAYER_VIRTUAL_ID) return resolved
    },
    async load(id) {
      if (id !== resolved) return
      const { code, files } = await buildPlayer()
      // 開發時改了播放器的任何一個檔，這個虛擬模組就失效、重新打包。
      for (const f of files) if (!f.startsWith('\0')) this.addWatchFile(f)
      return `export default ${JSON.stringify(code)}`
    },
  }
}
