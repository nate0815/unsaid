# Unsaid — 技術實作參考（TECH）

> **定位**：**實際怎麼實作的** 的正本。**要改程式就看這份。**
> 跟著程式改 —— 程式動了、這份沒動，就是欠回填。
>
> | 文件 | 職責 | 維護方式 |
> |---|---|---|
> | [DESIGN.md](DESIGN.md) | **做什麼** | 現在式；**⭐ 唯一參照，改動需授權** |
> | [PLAN.md](PLAN.md) | **怎麼做（方向）** | 現在式，就地改成最新版 |
> | **TECH.md**（本檔） | **實際怎麼實作的** — 資料契約、模組介面、不變式、驗證方式 | 現在式，跟著程式改 |
> | [DEVLOG.md](DEVLOG.md) | **發生了什麼** | 過去式，只追加 |
>
> 與 DESIGN 牴觸時**以 DESIGN 為準**：如果是本檔寫錯，直接改本檔；
> **如果是程式偏離了規格，停下來回報，不要改 DESIGN 去遷就它。**

---

## 0. 檔案清單

- `src/core/`：`width.ts` 字寬表與 `splitChars`；`grid.ts` 字元格型別、`CELL_ASPECT`、`putChar`；`glyph.ts` 單字繪製與字型堆疊；`ink.ts` 墨量表；`convert.ts` 取樣、亮度調整、輪廓、密度模式、訊息填充模式、純文字排版
- `src/player/`：`effects.ts` 特效與 `SceneFrames`；`renderer.ts` Canvas 2D ＋ 字形圖集；`scene-player.ts` 單一畫面的 rAF 迴圈
- `src/spike/`：M1 試作頁（原生 DOM），`index.html` 目前就是這頁；M3 會換成 React 編輯器
- `start.bat`：Windows 一鍵啟動（缺 `node_modules` 先 `npm install`，再 `npm start`）。必須是 CRLF，由 `.gitattributes` 的 `*.bat` 例外保證
- `src/media/`：編輯器那一側的媒體讀寫，可以用套件。`gif-decode.ts`（`GifSource`、`GifComposer`、`isGif`）用 gifuct-js 解碼；`gif-export.ts`（`exportGif`、`suggestSeconds`）用 gifenc 編碼；`gifenc.d.ts` 補型別
- `src/player/clip-frames.ts`：`ClipFrames` = Clip 的每一格各一個 `SceneFrames`，依時間挑格
- `src/core/project.ts`：專案資料型別（`Project`、四種 node、`EffectSpec`）、`validateProject`、存檔格式（`ProjectFile`）與 `encode*`／`decode*`、`jsonForScript`、`extractProjectFile`。`EffectSpec` 的正本在這裡，`player/effects.ts` 轉出
- `src/player/flow.ts`（`Flow`：純邏輯的流程推進）、`src/player/app.ts`（`mountPlayer`：DOM、起始畫面、Choice 疊加、End、輸入）、`src/player/main.ts`（匯出檔的進入點）
- `src/media/export-html.ts`（`buildHtml`）、`src/media/virtual-player.d.ts`；`tools/player-bundle.ts`（`buildPlayer`、`playerBundlePlugin`、`PLAYER_BUDGET_KB`）；`src/spike/demo.ts`（示範訊息、`drawHeart`）
- `index.html` 是流程編輯器（`src/editor/main.tsx`）；`spike.html` 是 M1 的試作頁，改名「Scene 工作室（試作）」，M4 會併進編輯器。`vite.config.ts` 的 `build.rollupOptions.input` 列兩頁
- `src/editor/`：`App.tsx`（編輯器主體：狀態、自動存檔、重新轉換、驗證、工具列、預覽）、`graph.ts`（流程圖的純函式操作）、`nodes.tsx`（四種 node 的外觀）、`Inspector.tsx`（屬性面板）、`Thumb.tsx`（字元畫面縮圖）、`storage.ts`（IndexedDB 自動存檔）、`editor.css`
- `src/media/render-source.ts`：`renderSource`（來源＋參數 → Clip）、`gridsFromSamples`、`textGrid`、`gifSamples`、`sourceFromFile`。spike 與編輯器共用，不各寫一份
- `textGrid` 搬到 `core/convert.ts`（存檔遷移在 core 裡要用）；`media/render-source.ts` 轉出同名，既有 import 不必改
- `src/editor/SceneEditor.tsx`：Scene 編輯畫面。流程圖上雙擊 Scene 打開；左邊用 `ScenePlayer` 即時播放（含特效，點一下重播），右邊直接重用 `Inspector.tsx` 匯出的 `ScreenInspector`（傳 `hideThumb`），Scene 再加 `AdvanceFields`。Esc／點背景／「完成」關閉

---

## 1. 30 秒驗證 ⭐

> 怎麼在半分鐘內確認它還活著。放最前面，因為這是接手的人第一件想做的事。
>
> ⚠️ **這一節寫的是「確認它還沒壞」，不是「第一次怎麼把它跑起來」** ——
> 後者在根目錄的 `README.md`，受眾是沒碰過這個專案的人。兩邊都要有，
> 但**不要把同一段指令與判準抄成兩份**：抄了就會分岔，而分岔不會有任何工具報錯。

```bash
npm test          # 單元測試＋模組邊界檢查
npm run build     # 型別檢查＋建置
```

兩行都沒有紅字（`Tests ... passed`、`✓ built`）就是正常。要看畫面：`npm run dev`，瀏覽器開它印出的網址，會看到流程編輯器（新訊息是「開始 → Scene → 結尾」）；`/spike.html` 是 Scene 工作室，預設會看到一顆由那句話填成的心。

---

## 2. 執行流程（啟動順序）

製作者端（編輯器）：

1. `index.html` → `src/editor/main.tsx` → `App` 先讀 IndexedDB 的自動存檔（`decodeProject`，含版本遷移），沒有就 `newProject()`
2. 編輯時只改 `Project`；Scene 的 `source` 一變 → `renderSource` 在背景轉成 `Clip` 寫回 `layers`；500 ms 後自動存檔
3. 預覽／匯出 → `buildHtml(project)` = 範本 ＋ `encodeProject(p, { forExport: true })` ＋ 打包好的播放器（`virtual:unsaid-player`）。預覽把這份 HTML 放進 iframe

觀看者端（匯出檔）：

1. 瀏覽器載入 HTML → `src/player/main.ts` 讀 `<script id="unsaid-data">` → `decodeProject` → `mountPlayer`
2. 「點一下開始」→ `Flow.begin()` → 依步驟顯示 Scene（`ScenePlayer` ＋ `ClipFrames` ＋ `Renderer`）、Choice（疊在上一個 Scene 上）、End
- 播放器起始：`mountPlayer` 結尾若 Start 有 `screen`，先 `showScreen` 在背後播；點一下才 `Flow.begin()`。重看從 `Flow.begin()` 開始，不再播起始畫面

---

## 3. 核心資料契約 ⭐

- `Grid = { cols, rows, cells: Cell[], colors?: Uint8ClampedArray }`，`cells` 逐列、長度恆為 cols×rows；`Cell = { ch, w: 0|1|2, a }`，`a` 是明顯程度 0～1；`colors` 每格 r,g,b
- `Clip = { frames: Grid[], delays: number[] }`，`delays` 毫秒、播完循環；靜態圖用 `stillClip(grid)`（`delays: [Infinity]`）。`ScenePlayer.show` 收的是 Clip
- `ProjectFile = { format: 'unsaid', version: 1, cellAspect, title, nodes }`。Scene 的 `layers` 存成 `ClipFile = { cols, rows, frames: GridFile[], delays? }`；`GridFile = { text: string[]（每列一字串，全形字只寫一次、空格 = 沒字）, alpha?（base64，每格 0～255，全不透明時省略）, colors?（base64 rgb） }`
- node 之間用 `next`（Start、Scene）與 `options[].next`（Choice）連；`null` = 沒接。Scene 的 `advance` 是 `{ mode: 'click' }` 或 `{ mode: 'auto', seconds }`
- 存檔格式 v2：Scene 多了選填的 `source = { layer, params }`（`layer` 是 `{ kind: 'image', image: dataURL }`／`{ kind: 'gif', gif: base64 原檔 }`／`{ kind: 'text', text }`；`params` 是 `ConvertParams`），專案多了選填的 `layout = { [nodeId]: { x, y } }`。v1 → v2 的遷移是原樣升版（兩個欄位都可省略）
- `encodeProject(p, { forExport: true })` 拿掉 `source` 與 `layout` —— 匯出 HTML 只走這條（`buildHtml`）
- `Screen = { layers, style, effects, source? }`：一個字元畫面。`SceneNode extends Screen`（多 `advance`、`next`）；`StartNode.screen?`、`EndNode.screen?` 選配。`EndNode` 不再有 `text`。`screenOf(n)` 取 node 的畫面、`withScreen(n, s)` 換畫面（Start／End 傳 `undefined` 是拿掉）
- 存檔格式 v3（`FORMAT_VERSION = 3`）：`ScreenFile`、`StartNodeFile`、`EndNodeFile`。v2 → v3 遷移：End 的 `text` 有字就變成文字畫面（`textScreen(text, 打字機 1.5 倍速)`，保留舊播放器的樣子），空字串就是沒有畫面

---

## 4. 模組契約 ⭐

> 一模組一節。每節寫三件事：**對外介面**、**誰能呼叫**、**不能做什麼**。
> 「不能做什麼」最容易漏，也最容易被後人違反。

- 轉換分兩段：`sampleImage`（碰瀏覽器，縮成每格一像素）→ 其餘皆純函式（`adjust`、`toDensity`、`toMessage`、`outlineChars`、`layoutText`），可在 node 測
- 亮度慣例是「深色背景、亮字」：亮處墨量多／字明顯，要反過來用 `invert`
- `toMessage`：亮度低於門檻的格子留空且不消耗字；全形字落在列尾放不下就留空、字留給下一格；話用完從頭循環；空白收成一個半形空格
- `SceneFrames.frame(t)` 回傳的陣列每幀重用，呼叫端不能留著；特效疊加規則：`a` 相乘、`dx/dy` 相加、`ch` 後者覆蓋
- `Renderer` 每幀：圖集貼白字到字形層 → `source-in` 一次上色（單色填色／原圖色貼每格一像素的色圖）→ 主畫布填背景再疊上
- 兩條時間軸：圖層動畫依 `clipIndexAt` 循環；進場特效從畫面開始算，**不會因為圖層換格而重播**
- GIF 讀取逐格解碼、用完即丟：欄數改變才重解一遍，只留每格的 `Sample`。最多取前 `GIF_MAX_FRAMES`（300）格；停留 ≤ 10 ms 當 100 ms（`normalizeDelay`，和瀏覽器一致）；用檔頭 `GIF8` 判斷，不信副檔名；只有一格或解析失敗就退回 `createImageBitmap` 當靜態圖
- `GifComposer`：上一格的 disposal 在下一格貼上**之前**才生效（2 = 清成透明、3 = 還原）；透明像素不覆蓋
- `exportGif`：畫面外的 `Renderer`（`readback: true`、dpr 1）依 `frameDelayMs(fps)`（對齊 1/100 秒）推進時間；全片共用一組 256 色調色盤，從最多 8 個時間點每 5 像素取樣；每 3 格讓出主執行緒一次
- `Renderer`：`setGrid` 只換內容不重排版；色圖依 Grid 用 WeakMap 快取；`fit(maxW, maxH, dpr)` 可指定 dpr
- `Flow`：`begin()`／`advance()`／`choose(i)` 回傳下一步；`lastScene` 給 Choice 疊加用；壞連結一律走到一個空的 End，不拋錯；Start 被接回來就從頭
- `mountPlayer`：點擊／空白鍵／Enter —— 進場特效沒播完先跳到播完，播完才推進；`auto` 的 Scene 等 `max(seconds, 進場長度)` 自動推進、不吃點擊推進；Choice 時 `ScenePlayer.pause()` 凍結、`.choosing` 變暗；數字鍵選、方向鍵移 focus；End 播自己的 `screen`（沒有就是空白、背景沿用最後一個 Scene），`replay` 才有「重看」；Start 有 `screen` 時在「點一下開始」背後播，提示移到下方（`.u-start.has-screen`）
- 匯出 HTML：`<script type="application/json" id="unsaid-data">` ＋ 打包好的播放器（`virtual:unsaid-player`，由 `playerBundlePlugin` 在建置／開發時即時打包）。分頁標題用訊息自己的標題（預設「一則訊息」），不放工具名
- `ScenePlayer` 加了 `elapsed()`、`seek(t)`、`pause()`、`enterDuration()`
- 編輯器只有一份狀態 `Project`；畫布的 nodes／edges、屬性面板、預覽、匯出都從它推出。Scene 的 `source` 物件一換（不可變更新），背景就重新 `renderSource`、把結果寫回 `layers`；回來時 `source` 已經又變了就丟掉結果
- `graph.ts`：連線 = 改 `next`／`options[i].next`，一個出口一條線、新的取代舊的；`canConnect` 擋「結尾往外接、接回 Start、接自己」；`removeNodes` 一併把指向被刪 node 的連線清成 `null`，Start 刪不掉；Choice 選項 2～8 個，刪中間的選項後面往前遞補；`freeSpot` 從指定位置往下找不重疊的空位；`ensureLayout` 給沒有位置的 node 排一列
- 自動存檔：專案變動後 500 ms 存一次 `encodeProject(project)`（含原圖）到 IndexedDB `unsaid`／`projects`／`autosave`。讀不回來就先把原始資料另存成 `broken-<時間>` 再開新專案
- `sourceFromFile`：GIF 動圖（多於一格）保留原檔；其他圖縮到長邊 `SOURCE_MAX_SIDE`，PNG 維持 PNG、其餘存 JPEG 0.9
- 新增 node：有選取的 node 就放在它右邊 280，沒有就放畫面中央；再經 `freeSpot` 避開既有的 node
- `textScreen(text, effects, style?)`（`core/project.ts`）：文字畫面的預設樣子，`TEXT_COLS = 36`、`TEXT_STYLE`。新 Scene、Start／End 的預設畫面、v3 遷移都用它
- `graph.ts` 的 `newStartScreen`（文字＋解碼）、`newEndScreen`（文字＋打字機）。新專案的 Start 沒有畫面、End 有；新加的 End 也有
- `Inspector.tsx`：`ScreenInspector<T extends Screen>` 是畫面參數（Scene 與 Start／End 共用），`AdvanceFields` 是 Scene 才有的推進方式，`SceneInspector` = 兩者相加。Start／End 用 `OptionalScreen`：「＋ 加上畫面」／「拿掉畫面」
- `SceneEditor` 收任何帶畫面的 node（`screenOf(node)` 不為空）；雙擊 Start／End 時若還沒有畫面，先加預設的再打開。Choice 雙擊沒反應
- `App.tsx` 的背景重轉掃所有 node 的 `screenOf(n).source`，結果用 `withScreen` 寫回；`markRendered` 標記載入時已經轉好的
- 特效清單一變，Scene 編輯畫面的預覽從頭播；只改轉換參數或顏色時沿用時間（`ScenePlayer.show(..., restart=false)`），跟 spike 拉拉桿的行為一致
- `FlowData.onAddOption`：Choice node 上的「＋」呼叫它，由 `App.tsx` 接成 `updateNode(p, id, addOption)`。按鈕帶 `nodrag`，並擋掉 click／dblclick 冒泡
- `ChoiceView` 在選項數變動時呼叫 `useUpdateNodeInternals` —— 出口 handle 增減後要重量位置，新出口才接得到線
- React Flow 關掉 `zoomOnDoubleClick`，雙擊只用來開 Scene 編輯畫面

---

## 5. 不變式 ⭐⭐ 破壞這些會壞掉，而且不一定馬上看得出來

> **判準**：如果一條約束被違反後會立刻爆錯，**不用寫**（錯誤訊息會告訴你）。
> 要寫的是**違反後還能跑，但已經壞了**的那種。
>
> 這一節是全份文件裡最值錢的一節。接手的人（尤其是 AI）動程式前必讀。

| # | 不變式 | 保護哪個檔／符號 | 破壞後的症狀 |
|---|---|---|---|
| 1 | **字元格高寬比是常數 `CELL_ASPECT`（= 2），不得改由字型量測** | `src/core/grid.ts` `CELL_ASPECT`；用到它的 `rowsFor`、`outlineChars`、`drawGlyph`、`Renderer.fit` | 換一台字型不同的裝置，圖就被壓扁或拉長；本機看起來完全正常 |
| 2 | **每個字畫進自己的格子（`drawGlyph`），絕不把一整列當字串 `fillText`** | `src/core/glyph.ts` `drawGlyph`、`src/player/renderer.ts` `Renderer.draw` | 對方字型的中文寬度不是半形的整兩倍時，整列逐漸錯位，訊息填充模式的句子讀不出來 |
| 3 | **全形字恆為 `w:2` 左半 ＋ 緊接一格 `w:0` 右半，且不跨列**。只透過 `putChar` 寫格子 | `src/core/grid.ts` `putChar`、`findBrokenWide` | 半個字被畫出、右半格被當空格塞進別的字，畫面疊字；不會報錯 |
| 4 | **特效不得改變字寬類別**：亂碼要用同寬的字（`noiseChar(w)`）；`w:0` 右半格的位移要跟左半格一致 | `src/player/effects.ts` `noiseChar`、`wave`、`glitch` | 解碼／故障期間字疊在一起或裂成兩半，特效結束後又恢復，很難重現 |
| 5 | **墨量量測與字形圖集共用同一支 `drawGlyph`** | `src/core/ink.ts` `canvasInkMeasure`、`src/player/renderer.ts` `Atlas.get` | 密度模式排出來的亮暗順序和畫面上看到的不一樣，圖變「髒」，看不出原因 |
| 6 | **圖集的格寬必須等於 `draw()` 用的格寬**（都從 `canvas.width / cols` 算） | `src/player/renderer.ts` `fit`、`Atlas.reset` | 字微微被裁切或糊掉，在某些視窗大小才出現 |
| 7 | **`core/` 只 import `core/`；`player/` 只 import `core/`、`player/`；兩者都不准有套件相依**（`media/` 可以用套件，但 `core`／`player` 不得 import 它） | `src/core/**`、`src/player/**`；由 `tests/boundaries.test.ts` 把關 | 播放器整份內嵌進匯出檔時跟著帶進相依，匯出檔變肥、預覽與成品開始不一致 |
| 8 | **同一個 `Clip` 的每一格 `cols × rows` 必須相同** | `src/core/grid.ts` `Clip`；`src/player/scene-player.ts` `tick`（換格只 `setGrid`、不重新 `fit`） | 尺寸不同的格子被畫進舊的畫布尺寸：字被裁掉或擠在角落，只在動圖播到那一格時出現 |
| 9 | **GIF 匯出用同一個 `Renderer` 在畫面外逐格推進時間，不錄螢幕** | `src/media/gif-export.ts` `exportGif` | 改成錄螢幕會掉格、受視窗大小影響，匯出的 GIF 就和預覽不一致 |
| 10 | **編輯器的整則訊息預覽 = 把匯出的 HTML 本身放進 iframe**，不是另外呼叫播放器模組 | `src/spike/main.ts` `openPreview`；之後的編輯器同理 | 預覽與對方看到的開始分岔（例如打包設定、內嵌資料的解碼），而且看起來都正常 |
| 11 | **專案資料放進 `<script>` 一律經過 `jsonForScript`**（跳脫 `<`、U+2028、U+2029） | `src/core/project.ts` `jsonForScript`、`src/media/export-html.ts` `buildHtml` | 訊息裡有 `</script>` 時，匯出檔從那裡斷掉，對方打開只看到半頁或一片黑 |
| 12 | **存檔格式一改就加 `FORMAT_VERSION`，並在 `MIGRATIONS` 補上從舊版升上來的函式** | `src/core/project.ts` `FORMAT_VERSION`、`MIGRATIONS` | 舊的專案檔／匯出檔打不開，或更糟：打得開但內容被讀錯（DESIGN「專案存檔」要求舊檔能開） |
| 13 | **播放器的 CSS 必須保留 `.u-root [hidden]{display:none!important}`** | `src/player/app.ts` `CSS` | 有設 `display` 的元素（`.u-start` 等）`hidden` 會失效：「點一下開始」一直疊在畫面上，但 `hidden` 屬性看起來是對的 |
| 14 | **畫面（Scene 本身、Start／End 的 `screen`）的 `source` 只能整個換新物件（不可變更新），不能就地改它的欄位**；換畫面一律經過 `withScreen` | `src/editor/App.tsx` 的 `rendered`（`WeakSet<SceneSource>`）、`src/editor/Inspector.tsx` 的 `patch`、`src/core/project.ts` `withScreen` | 就地改參數不會觸發重新轉換：面板上的數字變了，畫面卻停在舊的，而且重新整理後才「突然好了」 |
| 15 | **原圖（`source`，含 Start／End 的 `screen.source`）與版面（`layout`）不得進匯出的 HTML**：匯出一律 `encodeProject(p, { forExport: true })`，畫面一律經過 `encodeScreen` | `src/media/export-html.ts` `buildHtml`、`src/core/project.ts` `encodeProject`、`encodeScreen`；`tests/graph.test.ts` 把關 | 對方手上的檔案帶著製作者的原始照片（DESIGN「匯出」明定不含），檔案也大上好幾倍；畫面看起來完全正常 |
| 16 | **刪 node 一律經過 `removeNodes`**（它會把指向被刪 node 的連線清成「沒接」） | `src/editor/graph.ts` `removeNodes`、`src/editor/App.tsx` `onNodesChange` | 留下指向不存在 node 的連線：驗證會報、但若繞過驗證匯出，播放器走到那裡會直接跳到空白結尾 |
| 17 | **餵給 React Flow 的 node 物件必須帶上 `measured`**（從 `onNodesChange` 的 `dimensions` 變更記下來）。專案是唯一狀態，每次重繪都重建 node 物件，少了這欄 React Flow 就當成沒量過 | `src/editor/App.tsx` 的 `measured`、`rfNodes`、`onNodesChange` | 拖曳 node 時整張圖一直閃（每一格都先隱藏、重量、再顯示），操作照樣能用，所以容易被當成「效能不好」 |

> **「保護哪個檔／符號」這一欄不要留白。** AI 犯「架構與既有慣例不一致」的錯，
> 是在**讀程式碼**的時候犯的，不是在讀這一節的時候。填了這欄，它動那個檔之前
> grep 得到；沒填，就只能指望它記得先回頭讀本節。

---

## 6. 怎麼加一個新的特效

> 把「照抄就能加」的步驟寫下來，省下每次重新推導。

1. `src/core/project.ts` 的 `EffectKind` 加上名字（它是存檔格式的一部分 —— 只加不改名，否則舊檔讀不回來）
2. `src/player/effects.ts`：在 `SceneFrames.frame` 的 `switch` 加一支，只改 `ch`／`a`／`dx`／`dy`；**亂碼要用同寬的字、`w:0` 右半格跟著左半格動**（「不變式」#4）。進場類要在 `enterDuration` 回報長度
3. 持續類若要讓 GIF 匯出錄久一點，`src/media/gif-export.ts` 的 `suggestSeconds` 把它算進 `sustain`
4. 面板：`src/editor/Inspector.tsx` 的 `FX`／`FX_DEFAULT`、`src/spike/main.ts` 的 `FX` 與 `DEFAULTS.fx`
5. `tests/effects.test.ts` 補：結束後回到原字、字寬不變、全形字不裂開
6. `npm test` 的播放器打包檢查會確認它沒有把大小撐破

---

## 7. 數值一覽

> 所有可調數值的**唯一宣告處**在哪個檔。這裡只列對照表，不重複寫值。

- 可調值的宣告處：`COLS_MIN/MAX`（`convert.ts`）、`FONT_SCALE`（`glyph.ts`）、特效時長與振幅（`effects.ts` 的 `typewriterDur`、`decodeDur`、`wave`、`glitch`）、spike 預設值（`spike/main.ts` `DEFAULTS`）
- `GIF_MAX_FRAMES`（`gif-decode.ts`）；`GIF_MAX_SECONDS`、`SUSTAIN_MIN_SECONDS`、`HOLD_SECONDS`（`gif-export.ts`）
- `PLAYER_BUDGET_KB`（`tools/player-bundle.ts`，目前 40）；`CHOICE_MIN/MAX`、`FORMAT_VERSION`（`core/project.ts`）；`POLL_MS`（`player/app.ts`）
- `AUTOSAVE_MS`、`RERENDER_MS`（`editor/App.tsx`）；`SOURCE_MAX_SIDE`（`media/render-source.ts`，DESIGN 的假值 800）；`NODE_W`／`NODE_H`（`editor/graph.ts`，只用來找空位）

---

## 8. 驗證與回歸

- `npm test`：字寬、轉換、特效、模組邊界共 32 項；部署 workflow（`.github/workflows/pages.yml`）測試沒過就不部署。瀏覽器端（繪製、拖放、手機版面）目前沒有自動化，靠人工或臨時腳本
- `npm start` = `vite --open`；`npm run phone` = `vite --host --open`，讓同網路的手機連進來
- `tests/gif.test.ts`：GIF 疊合規則、gifenc 編→解來回一致、Clip 時間軸、匯出時間設定。瀏覽器端的「上傳動圖 → 播放會動 → 匯出 GIF → 解回來檢查」目前靠臨時腳本
- `.github/workflows/pages.yml`：PR 跑 `npm test` ＋ `npm run build`（不部署）；推到 `main` 再多做上傳與部署。`concurrency` 依分支分組，PR 的檢查不會取消 `main` 的部署
- `tests/project.test.ts`（字元格與專案的存讀來回、驗證、`</script>` 跳脫、Flow）；`tests/player-bundle.test.ts`（打包 ≤ 40 KB、只含 core／player、沒有 `</script`）。目前打包 14.8 KB
- 瀏覽器端的整條流程（spike 預覽走分支一、匯出檔斷網開啟用鍵盤走分支二、手機尺寸）目前靠臨時腳本；**真手機實測要人做**
- `tests/graph.test.ts`：連線、斷線、刪除清連線、Start 不能刪、選項上下限、空位、v2 存讀、v1 舊檔可開、**匯出 HTML 不含原圖與版面**。瀏覽器端（拖曳連線、換 GIF、預覽走完、重新整理後自動存檔還在、匯出不含原圖、刪除後擋匯出）目前靠臨時腳本

> ⚠️ 這套驗證證明的是「**沒有壞掉**」，不是「好不好」。

---

## 9. 刻意沒做的事

> 防止後人「好心」補上你故意省掉的東西。每條都要寫**為什麼不做**。

- GIF 匯出在主執行緒跑，不用 Web Worker —— 720 px、數十格約一秒內完成；要做長片或大尺寸再搬
- 訊息填充模式的動圖：每一格都從句子開頭填起，字會隨亮處移動而流動，不追蹤「同一個字在哪」
- 匯出檔的專案資料沒有壓縮 —— 實測 gzip 可縮到約 1/9，但播放器要改成非同步啟動，等 Chiao 看過數字再決定
- 原圖色模式下，波浪／故障的位移不帶著顏色走（色圖固定在格子上）—— 位移不到一格，相鄰色相近，看不出來；要修得逐格上色，200 欄會掉幀
- 輪廓只在密度模式生效 —— 描邊字元插進句子會破壞訊息填充模式的可讀性
- M3 的 Scene 屬性面板只放常用的參數（欄數、亮度、對比、門檻、反相、顏色、特效開關、推進方式）；輪廓、特效的速度與強度、逐格手修留給 M4 的 Scene 編輯面板 —— 現在做，M4 整合 spike 時要再拆一次
- 編輯器沒有為手機排版優化（窄螢幕只是把屬性面板疊到下方）—— 製作者主要在電腦上做；播放器才需要手機

---

## 10. 本輪變更收件匣 ⭐ 回填先進這裡

> **這一節是暫存區，不是正式章節。永遠放在本檔最後一節。**
>
> 回填程式碼變動時，**只寫這裡一個落點**，不必當下決定它該歸到
> §0 檔案清單／§3 資料契約／§4 模組契約／§7 數值／§8 驗證 的哪一節。
>
> **為什麼要有它**：那個「該歸到哪一節」的判斷是回填最貴的部分 ——
> 文件長到十幾節之後，光是定位就要把整份結構重新載進腦子，而且一次改動
> 常常要判斷五、六次，做錯了還要重來。把判斷延後到「這塊實作已經穩定」
> 的時候一次做，會準得多、也快得多。
>
> **放最後一節也是刻意的**：新增章節不會讓任何既有章號位移。

### 10.1 規矩

| 規則 | 說明 |
|---|---|
| **內容是現在式** | 收件匣寫的是**現在的實作**，與其他章節同等有效、同樣是正本。差別只在「還沒歸位」，不是「還沒生效」 |
| **一條一行，附落點提示** | 格式：`- （→ §4 模組契約）xxx`。想不出落點就寫 `（→ ?）`，整併時再決定 —— **不准為了填那個箭頭而卡住** |
| **整併時機** | 三者任一：收件匣超過 **10 條**／該塊實作穩定下來／要交付或發 PR 之前 |
| **整併＝搬，不是重寫** | 整段搬進目標章節，**不重新措辭**。搬完從收件匣刪掉 —— 這一節**不是**只追加的，它是本檔唯一可以清空的地方 |
| ⚠️ **不變式例外** | **新的不變式不進收件匣，直接寫 §5** —— 那一節是每次動程式前必讀的，晚一天歸位就可能被違反。這是唯一的例外，沒有商量餘地 |

### 10.2 目前收件匣

（空 —— 2026-10-18 Start／End 畫面發 PR 前整併）
