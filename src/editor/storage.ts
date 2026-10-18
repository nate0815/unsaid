/* 自動存檔：把專案存在這台瀏覽器的 IndexedDB（DESIGN「專案存檔」：重新整理或關掉分頁不會掉進度）。
 *
 * 存的是存檔格式（ProjectFile），和下載的 .json 一模一樣 —— 讀回來走同一條 decodeProject，
 * 舊版的自動存檔也會經過版本遷移。用 IndexedDB 而不是 localStorage：原圖動輒數百 KB，localStorage 只有約 5 MB。 */

import type { ProjectFile } from '../core/project'

const DB = 'unsaid'
const STORE = 'projects'
const KEY = 'autosave'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        tx.oncomplete = () => {
          db.close()
          resolve(req.result)
        }
        tx.onerror = tx.onabort = () => {
          db.close()
          reject(tx.error ?? req.error)
        }
      })
  )
}

export function saveAutosave(file: ProjectFile): Promise<unknown> {
  return run('readwrite', (s) => s.put(file, KEY))
}

/** 沒有存檔、或這個瀏覽器不給用 IndexedDB（例如某些私密視窗）都回傳 null。 */
export async function loadAutosave(): Promise<unknown | null> {
  try {
    return (await run('readonly', (s) => s.get(KEY))) ?? null
  } catch {
    return null
  }
}

/** 讀不回來的自動存檔先另存一份再開新專案 —— 否則幾百毫秒後新專案的自動存檔就把它蓋掉了。 */
export function backupBroken(raw: unknown): Promise<unknown> {
  return run('readwrite', (s) => s.put(raw, `broken-${new Date().toISOString()}`)).catch(() => null)
}
