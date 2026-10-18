---
type: gotcha
date: 2026-10-18
scope: build
---

# tsc 報 TS2590「Expression produces a union type that is too complex to represent」

**現象**
- `src/spike/main.ts` 的 DOM 小工具 `el(tag, props, ...kids)` 一被呼叫就報 TS2590，呼叫處有好幾個，全部紅字。

**原因**
- 原本寫成 `Object.assign(document.createElement(tag), props)`，`tag` 是泛型 `K extends keyof HTMLElementTagNameMap`。
  回傳型別變成「所有 HTML 元素型別 × props」的交集聯集，超過 TypeScript 能展開的上限。

**解法**
- 把 `props` 放寬成 `Record<string, unknown>`，回傳型別明寫成 `HTMLElementTagNameMap[K]`，
  `Object.assign(e, props)` 單獨一行、不用它的回傳值。
