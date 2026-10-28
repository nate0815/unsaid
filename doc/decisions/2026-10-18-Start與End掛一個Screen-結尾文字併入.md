---
type: decision
date: 2026-10-18
status: 生效
supersedes:
affects: [流程編輯器, 播放器, 專案資料格式]
code: [src/core/project.ts, src/player/app.ts, src/editor/Inspector.tsx, src/editor/SceneEditor.tsx]
---

# `Start`／`End` 掛一個與 Scene 相同的畫面（`Screen`）；`End` 的結尾文字併進去

**選了什麼**
- 抽出 `Screen = { layers, style, effects, source? }`。`SceneNode` 就是 `Screen` 加上推進方式與出口；
  `Start`／`End` 各有一個選配的 `screen`。編輯介面、背景重轉、匯出拿掉原圖全部走同一套。
- `EndNode.text` 拿掉，存檔格式升 v3：舊檔的結尾文字遷移成文字畫面＋打字機 1.5 倍速，看起來跟舊版播放器一樣。
- Chiao 在 2026-10-18 裁決（DESIGN v0.5）：要「掛一整個 Scene 畫面」，不是加幾個固定欄位。

**沒選什麼、為什麼不選**
- 給 `Start`／`End` 加固定欄位（文字、進場速度、要不要圖）：等於再做一套小型 Scene 編輯，
  每加一個 Scene 參數就要決定 Start／End 跟不跟 —— 兩套一定會分岔。
- 保留 `End.text`、另外加 `screen`：兩個欄位都能放結尾文字，播放器要決定誰優先，製作者也搞不清楚改哪個。
- `Start`／`End` 直接改成 Scene node：Scene 有推進方式與出口，`Start` 一定要點一下（瀏覽器的手勢限制）、`End` 沒有出口，硬套要到處加例外。

**如果錯了會怎樣**
- 若之後要讓 `Start`／`End` 也能自動推進或有多層，`Screen` 已經是共用型別，只要在 node 上加欄位，不必再改格式結構。
