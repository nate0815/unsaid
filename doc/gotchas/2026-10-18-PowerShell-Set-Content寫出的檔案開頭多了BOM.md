---
type: gotcha
date: 2026-10-18
scope: tooling
---

# PowerShell `Set-Content -Encoding utf8` 寫出的檔案開頭多了 BOM

**現象**
- 用 PowerShell 改 `tsconfig.json` 之後，檔案開頭多了三個位元組 `EF BB BF`。
  tsc 照樣能讀，所以沒有任何錯誤，但檔案編碼已經變了，`.gitattributes` 的 LF 規則也擋不住它。

**原因**
- Windows PowerShell 5.1 的 `-Encoding utf8` 指的是**帶 BOM 的** UTF-8。沒有「不帶 BOM」的選項（PowerShell 7 才有 `utf8NoBOM`）。

**解法**
- 改檔一律用編輯工具或 Python（`open(..., encoding='utf8', newline='\n')`），不要用 `Set-Content`／`Out-File`。
- 已經寫壞的檔：`sed -i '1s/^\xEF\xBB\xBF//' <檔名>`，再用 `head -c3 <檔名> | od -c` 確認開頭不是 `357 273 277`。
