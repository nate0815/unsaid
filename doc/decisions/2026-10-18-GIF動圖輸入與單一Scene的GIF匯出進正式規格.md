---
type: decision
date: 2026-10-18
status: 生效
supersedes:
affects: [design, core, player, media, editor]
code: [src/core/grid.ts, src/player/clip-frames.ts, src/media/gif-decode.ts, src/media/gif-export.ts]
---

# GIF 動圖輸入與單一 Scene 的 GIF 匯出進正式規格

**誰決定**：Chiao（2026-10-18，試完 M1 spike 之後）。DESIGN v0.2。

**選了什麼**
- Scene 的圖層可以是 GIF 動圖：每格用同一組參數轉換、保留原本的停留時間、循環播放（DESIGN「GIF 動圖」）。
- 單一 Scene 可以匯出成 GIF（DESIGN「單一 Scene：GIF」）。整則訊息的交付仍然是單一 HTML。

**為什麼**
- Chiao 的回饋：效果動起來特別好，要保留會動的部分 —— 輸入要能用動圖，輸出也要能是會動的單張圖。

**沒選什麼、為什麼不選**
- **整則訊息（含 Choice）匯出成 GIF**：GIF 無法互動，選項分支在 GIF 裡沒有意義。AI 把 Chiao 說的「最終單圖片的 GIF 匯出」解讀成單一 Scene，寫入 DESIGN 時 Chiao 在確認框逐條同意。
- **繼續只放在 spike**：M2 的資料格式要先知道圖層會不會有多格，晚決定就要改格式。

**如果錯了會怎樣**
- 動圖讓 HTML 匯出檔變大：每一格的字元格都要存。M2 要量測，可能需要壓縮格式或降低格數上限（DESIGN 的 300 格是假值）。
