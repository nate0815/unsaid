import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import { playerBundlePlugin } from './tools/player-bundle'

export default defineConfig({
  // 相對路徑：GitHub Pages 掛在 /unsaid/ 子路徑下，絕對路徑會 404。
  base: './',
  plugins: [react(), playerBundlePlugin()],
  build: {
    rollupOptions: {
      // 兩個頁面：流程編輯器（首頁）與 Scene 工作室（M1 的 spike，M4 會併進編輯器）。
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        spike: resolve(import.meta.dirname, 'spike.html'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
