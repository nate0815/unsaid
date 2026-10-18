---
type: gotcha
date: 2026-10-18
scope: env
---

# 開著的 dev server 報 Failed to resolve import "virtual:unsaid-player"

**現象**
- 在 `vite.config.ts` 加上 `playerBundlePlugin()` 之後，`npm run build` 與 `npm test` 都正常，
  但早就開著的 `npm run dev`（或 `start.bat`）頁面一片空白，終端機印出
  `Internal server error: Failed to resolve import "virtual:unsaid-player" from "src/media/export-html.ts"`。

**原因**
- 那個 dev server 是在外掛加進來**之前**啟動的，沒有重新載入設定，所以不認得這個虛擬模組。
  （設定檔 import 了新檔案 `tools/player-bundle.ts`，這次的 Vite 沒有因此自動重啟。）

**解法**
- 關掉 dev server 重開（關掉 `start.bat` 的黑色視窗再雙擊一次）。
- 之後只要改了 `vite.config.ts` 或 `tools/` 底下的檔，都先重開 dev server 再判斷是不是程式壞了。
