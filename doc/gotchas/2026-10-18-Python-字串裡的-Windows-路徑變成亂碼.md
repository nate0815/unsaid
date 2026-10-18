---
type: gotcha
date: 2026-10-18
scope: tooling
---

# Python 字串裡的 Windows 路徑變成亂碼

**現象**
- 用 Python 腳本把 `D:\2026_Practice\...` 寫進 Markdown，檔案裡變成 `D:` ＋ 一個看不見的控制字元 ＋ `6_Practice\...`。

**原因**
- 一般 Python 字串裡，`\202` 被解讀成八進位跳脫字元（U+0082），不是反斜線加 `202`。
  `\d`、`\g` 之類沒有意義的跳脫只會出警告、原樣保留，所以只有部分路徑壞掉，很容易漏看。

**解法**
- 寫路徑用 raw string（`r'D:\2026_Practice'`）或正斜線；或直接用編輯工具寫檔，不經 Python 字串。
- 寫完用 `grep -n "2026_Practice"` 檢查一次 —— 壞掉的那幾行會搜不到。
