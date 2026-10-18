---
type: decision
date: 2026-10-18
status: 生效
supersedes:
affects: [editor, media, core]
code: [src/editor/App.tsx, src/editor/graph.ts, src/editor/storage.ts, src/media/render-source.ts, src/core/project.ts]
---

# 編輯器只有一份 `Project` 狀態；Scene 來源變了就在背景重轉

**選了什麼**
- 編輯器的狀態只有一份 `Project`（執行期格式，圖層是轉好的 `Clip`）。React Flow 的 nodes／edges、屬性面板、預覽、匯出都從它推出來，不另存一份。
- 流程圖的操作（連線、刪除、選項增減、找空位）寫成 `editor/graph.ts` 的純函式，可以在 node 裡測。
- Scene 存 `source`（原圖＋轉換參數）。`source` 一換成新物件，背景就 `renderSource` 重轉、寫回 `layers`；用物件身分（`WeakSet`）判斷有沒有轉過。
- 自動存檔用 IndexedDB，存的就是存檔格式（和下載的 `.json` 一樣），讀回來走同一條 `decodeProject` 與版本遷移。
- spike 與編輯器共用 `media/render-source.ts` 的轉換流程。

**沒選什麼、為什麼不選**
- **讓 React Flow 自己管 nodes／edges，再同步回專案**：兩份狀態一定會在某個邊角不同步（例如刪 node 時連線沒清），而且不會報錯。
- **用 JSON 字串比對 `source` 有沒有變**：原圖是幾百 KB 的 data URL，每次輸入都整串比對會卡。
- **localStorage**：約 5 MB 上限，幾張原圖就滿了。
- **編輯器另寫一份轉換程式**：spike 調出來的畫面和編輯器轉出來的會不一樣。

**如果錯了會怎樣**
- `source` 若被就地修改，不會觸發重轉（TECH「不變式」#14）。之後要加功能改 `source` 時，一律用展開運算子換新物件。
- 專案很大（很多 GIF）時，每次存檔都整份重新編碼。真的慢了再改成只存有變的 node。
