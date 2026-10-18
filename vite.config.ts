import { defineConfig } from 'vitest/config'

export default defineConfig({
  // 相對路徑：GitHub Pages 掛在 /unsaid/ 子路徑下，絕對路徑會 404。
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
