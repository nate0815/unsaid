/* 匯出整則訊息成單一 HTML（DESIGN「整則訊息：單一 HTML」）。
 *
 * 檔案 = 空白頁 ＋ 專案資料（JSON）＋ 打包好的播放器。雙擊就能開、不需要網路。
 * 專案資料原封不動放在 `<script id="unsaid-data">` 裡：拖回編輯器就能取回（`extractProjectFile`）。 */

import playerSource from 'virtual:unsaid-player'
import { DATA_ELEMENT_ID, encodeProject, jsonForScript, type Project } from '../core/project'

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** 分頁標題用訊息自己的標題 —— 不放工具名稱（DESIGN「匯出」：不加工具標記）。 */
export const DEFAULT_TITLE = '一則訊息'

export function buildHtml(project: Project): string {
  const title = escapeHtml(project.title.trim() || DEFAULT_TITLE)
  // 播放器程式碼裡若出現 `</script`，HTML 會從那裡斷掉。換成等價的 `<\/script`。
  const js = playerSource.replace(/<\/script/gi, '<\\/script')
  return [
    '<!doctype html>',
    '<html lang="zh-Hant">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<title>${title}</title>`,
    '<style>html,body{margin:0;height:100%;background:#0b0b0d}</style>',
    '</head>',
    '<body>',
    `<script type="application/json" id="${DATA_ELEMENT_ID}">${jsonForScript(encodeProject(project))}</script>`,
    `<script>${js}</script>`,
    '</body>',
    '</html>',
  ].join('\n')
}

export function htmlBlob(project: Project): Blob {
  return new Blob([buildHtml(project)], { type: 'text/html;charset=utf-8' })
}
