import { defineConfig } from 'vitest/config'
import { playerBundlePlugin } from './tools/player-bundle'

export default defineConfig({
  // 相對路徑：GitHub Pages 掛在 /unsaid/ 子路徑下，絕對路徑會 404。
  base: './',
  plugins: [playerBundlePlugin()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
