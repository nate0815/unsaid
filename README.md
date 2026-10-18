# Unsaid

**把說不出口的話，做成一段 ASCII 字元演出，匯出成一個 HTML 檔交給對方。**

製作者用流程圖把一個個字元畫面串起來 —— 上傳圖片轉成字元、換成自己的字句、加上特效、讓對方做選擇 ——
最後一鍵匯出單一 HTML，對方雙擊就能看，不需要網路。純前端，你的圖片與文字不會離開你的瀏覽器。

---

## 怎麼跑起來

需要 Node.js 22 以上。

```bash
npm install
npm run dev
```

用瀏覽器打開它印出的網址（通常是 `http://localhost:5173/`），看到一顆由「有些話我一直沒有說出口……」這句話填成的心，就是跑起來了。
把自己的圖拖進畫面，或用左邊的拉桿調參數。

推到 `main` 會自動測試、建置並部署到 GitHub Pages（`.github/workflows/pages.yml`）。

---

## 文件在哪

| 你想知道 | 去哪 |
|---|---|
| **規格：做什麼** ⭐ 唯一參照，改動需授權 | [doc/DESIGN.md](doc/DESIGN.md) |
| 為什麼選這條路（技術選型、已排除的路線） | [doc/PLAN.md](doc/PLAN.md) |
| 實際怎麼實作的（資料契約、模組介面、**不變式**） | [doc/TECH.md](doc/TECH.md) |
| 什麼時候發生了什麼（進度、決策、踩坑） | [doc/DEVLOG.md](doc/DEVLOG.md) ＋ `doc/devlog/` `doc/decisions/` `doc/gotchas/` |
| AI 在這個專案要遵守什麼 | [AGENTS.md](AGENTS.md) |

---

## 現在到哪了

- **狀態**：實驗型 prototype，2026-10 起。M1 視覺 spike 可以玩：圖片轉字元（密度模式、訊息填充模式、中文全形）、純文字、四種特效。
- **還不能做什麼**：流程（多個畫面串起來）、選項分支、匯出 HTML、存專案檔 —— 那是 M2 之後。
- **正在驗證**：字元畫面加特效，能不能讓看的人感受到想傳達的東西（[doc/DESIGN.md](doc/DESIGN.md)「要驗證的假設」H1）。
