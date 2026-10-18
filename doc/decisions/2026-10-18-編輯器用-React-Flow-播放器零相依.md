---
type: decision
date: 2026-10-18
status: 生效
supersedes:
affects: [編輯器, 播放器]
code: []
---

# 編輯器用 React ＋ React Flow，播放器原生 TS 零相依

**選了什麼**
- 編輯器：React ＋ React Flow（xyflow）。Chiao 在 2026-10-18 的討論中選定。
- 播放器：原生 TypeScript、零相依，可單獨建成一支 JS；編輯器預覽與匯出檔用同一份。

**沒選什麼、為什麼不選**
- Svelte ＋ Svelte Flow：同一家出的套件、程式較精簡，但生態與範例較少。
- 自己刻流程圖：拖拉、連線、縮放是最大的時間黑洞，沒有驗證價值。
- 播放器也用 React：匯出檔變肥；預覽若是另一套程式，遲早與成品分岔，而且不會報錯（見 [PLAN.md](../PLAN.md)「核心判斷」）。

**如果錯了會怎樣**
- 播放器若被拉進框架相依，匯出路線要重做。所以這條同時寫進 [AGENTS.md](../../AGENTS.md)「這個專案的性質」，
  有程式之後再寫進 TECH「不變式」。
