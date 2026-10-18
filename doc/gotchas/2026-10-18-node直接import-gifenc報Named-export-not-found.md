---
type: gotcha
date: 2026-10-18
scope: tooling
---

# node 直接 `import { GIFEncoder } from 'gifenc'` 報 Named export not found

**現象**
- 在專案外用純 node 跑的檢查腳本（`.mjs`）裡寫 `import { GIFEncoder, applyPalette } from 'gifenc'`，啟動就報
  `SyntaxError: Named export 'GIFEncoder' not found. The requested module 'gifenc' is a CommonJS module`。
- 同樣的 import 在專案裡（Vite、vitest）完全正常，所以很容易以為是套件壞了。

**原因**
- gifenc 的 `package.json` 用 `main` 指向 CommonJS 版、`module` 指向 ESM 版，但沒有 `exports` 欄位。
  Vite／vitest 會讀 `module`，純 node 只讀 `main`，於是拿到 CommonJS 版，具名匯出偵測不到。gifuct-js 同理。

**解法**
- 純 node 腳本改用預設匯入：`import gifenc from 'gifenc'; const { GIFEncoder, applyPalette } = gifenc`。
- 專案裡的程式碼（`src/`、`tests/`）照常用具名匯入，不用改。
