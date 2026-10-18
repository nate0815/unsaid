---
type: decision
date: 2026-10-18
status: 生效
supersedes:
affects: [media, spike, player]
code: [src/media/gif-decode.ts, src/media/gif-export.ts, src/player/clip-frames.ts, src/core/grid.ts]
---

# GIF 讀寫用 gifuct-js 與 gifenc，放在 `src/media/`

**背景**
- Chiao 試完 M1 spike 的回饋：效果動起來特別好，要能讀 GIF 動圖、也要能輸出成 GIF，保留會動的部分。

**選了什麼**
- 解碼用 gifuct-js 2.1.2，編碼用 gifenc 1.0.3（都是 MIT、純 JS、無相依）。
- 放在新模組 `src/media/`：屬於編輯器那一側，可以用套件；`core`／`player` 不得 import 它（`tests/boundaries.test.ts` 把關）。
  播放器拿到的永遠是轉好的字元格，不碰 GIF。
- GIF 的疊合規則（disposal）自己寫成純函式 `GifComposer`，不靠 canvas，才能在 node 裡測。
- 動圖在 core 裡是 `Clip`（一串同尺寸的 Grid ＋ 每格停留時間），靜態圖是只有一格的 Clip —— 播放器只有一條路。
- 匯出 GIF 用同一個 `Renderer` 在畫面外逐格推進時間，全片共用一組調色盤。

**沒選什麼、為什麼不選**
- **瀏覽器內建 `ImageDecoder`**：不是每個目標瀏覽器都支援（DESIGN 要支援近兩年的 Safari、Firefox）。要加後備就變成兩條解碼路，兩條路的 disposal 行為可能不同，而且不會報錯。
- **自己寫 LZW 與調色盤量化**：都有現成且被大量使用過的實作，自己寫只多出錯機會；兩個套件加起來只讓建置多約 20 kB。
- **錄螢幕（MediaRecorder／逐幀截圖）**：會掉格、受視窗大小影響，匯出就和預覽不一致。
- **每格各自的調色盤**：原圖色模式下相鄰格的顏色會跳，看起來像閃爍。

**如果錯了會怎樣**
- gifenc 最後發佈是 2022 年。若之後要支援透明背景或更好的抖色，可能得換成別的編碼器 —— 換的範圍只在 `gif-export.ts`。
- 這些功能目前**只在 spike 上**。要成為正式功能得先改 DESIGN（DEVLOG「待決問題」#5）。
