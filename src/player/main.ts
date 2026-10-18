/* 匯出檔的進入點：讀出內嵌的專案資料，掛上播放器。
 * 這支會被打包成單一 JS（見 tools/player-bundle.ts），整份塞進匯出的 HTML。 */

import { DATA_ELEMENT_ID, decodeProject, ProjectFormatError } from '../core/project'
import { mountPlayer, showError } from './app'

function boot() {
  const el = document.getElementById(DATA_ELEMENT_ID)
  try {
    if (!el?.textContent) throw new ProjectFormatError('這個檔案裡沒有訊息資料')
    mountPlayer(document.body, decodeProject(JSON.parse(el.textContent)))
  } catch (e) {
    showError(document.body, e instanceof ProjectFormatError ? e.message : '這則訊息打不開：資料壞掉了')
    console.error(e)
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
else boot()
