/* PreToolUse hook（Codex CLI 專用）：擋住對規格正本的寫入。
 *
 * 為什麼只有 Codex 需要這支：Claude Code 有原生的 `permissions.ask`，
 * 會跳確認框讓人當場裁決。Codex 的 PreToolUse **只支援 allow / deny** ——
 * 官方文件把 `"ask"` 標成 "parsed but not supported yet"，
 * 也就是你寫了 ask 它會安靜地不生效（這比擋錯更危險，見 gotchas）。
 *
 * 所以 Codex 這邊改用「硬擋 ＋ 解鎖檔」：
 *   要授權就由人建 doc/.design-unlock（空檔即可），改完刪掉。
 *   「人點頭」因此變成一個看得見、留得下痕跡的動作。
 *
 * ⚠️ 解鎖檔是**協作慣例與防呆，不是安全邊界**。
 *   本檔會擋掉「用工具建立解鎖檔」這條最直接的路（見下方 UNLOCK 那段），
 *   但有 shell 與寫入權限的 agent 理論上仍有別的辦法繞過去。
 *   要真正強制人類授權，得靠 Codex 的人工 approval 流程，
 *   或驗證一個來自工作區之外、agent 產不出來的憑證。
 *   **不要把這支當成擋得住惡意的東西** —— 它擋的是「忘記」與「順手」。
 *
 * ⚠️ 已知限制，不要以為它滴水不漏：
 *   - 對 patch／edit 類工具可靠（目標路徑就在 tool_input 裡）。
 *   - 對 shell 工具只能比對指令字串裡有沒有 DESIGN.md ＋ 寫入跡象，
 *     `sed -i`、heredoc、python 改檔都擋得到常見寫法，但**擋不全**。
 *   - Codex 對同一事件的多個 hook 是併發執行的，彼此擋不到對方。
 *     這支只負責 doc/DESIGN.md 這一件事。
 *   真正的保障仍然是 AGENTS.md §1 那條規則本身；這支是讓「忘記」有代價。
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

/* ══════════ 移植到別的專案時，只需要改這一段 ══════════ */

/** 規格正本的路徑（相對專案根）。要換成別的檔就改這裡。 */
const SPEC = 'doc/DESIGN.md'

/** 解鎖檔：存在就放行。**必須 gitignore** —— 它是一次性手勢，不是設定。 */
const UNLOCK = 'doc/.design-unlock'

/** 哪些工具名視為「可能寫檔」。故意寫寬 —— 比對不到就放行，不會誤擋。
 *  ⚠️ 實測（Codex 0.154.0-alpha.6.2）的命令工具名是 `exec_command`，不是 `shell`。
 *  工具名會跨版本改，所以 `.codex/config.toml` 的 matcher 用 `.*` 全收，
 *  由這支自己快速放行 —— **不要把過濾責任放回 matcher**，
 *  那樣一改名就會安靜地漏擋（2026-09-12 就是這樣被 Codex 抓到的）。 */
const WRITE_TOOLS = /patch|edit|write|apply|create|shell|bash|exec|command/i

/** shell 類工具額外要求的「寫入跡象」—— 否則 `grep doc/DESIGN.md` 也會被擋。 */
const SHELL_WRITE =
  /(>>?\s*\S*DESIGN\.md)|sed\s+-i|tee\b|\bcp\b|\bmv\b|\btouch\b|install\b|truncate|dd\b|python|perl|awk\s+.*-i/i

/* ══════════════════ 以下不必改 ══════════════════ */

/** 檢查工具壞掉不該卡住工作 —— 任何意外都靜默放行。 */
function allow() {
  process.exit(0)
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    })
  )
  process.exit(0)
}

let input
try {
  input = JSON.parse(readFileSync(0, 'utf8'))
} catch {
  allow()
}

const toolName = String(input.tool_name || '')
if (!WRITE_TOOLS.test(toolName)) allow()

// tool_input 的形狀各版本不同，整串序列化後比對路徑，比猜欄位名穩。
let payload
try {
  payload = JSON.stringify(input.tool_input ?? '')
} catch {
  allow()
}

// 同時認 POSIX 與 Windows 分隔符，且允許前面帶任意絕對路徑前綴。
// 分隔符後面要 `+`：JSON.stringify 會把 Windows 路徑的 \ 轉義成 \\，只吃一個會漏掉。
// 點號要跳脫，否則 `DESIGN.md` 的 `.` 會變成萬用字元，比對得太鬆。
const specPattern = new RegExp(
  SPEC.replace(/[.*+?^${}()|[\]]/g, '\\$&').replace(/\//g, '[/\\\\]+'),
  'i'
)
const unlockPattern = new RegExp(
  UNLOCK.replace(/[.*+?^${}()|[\]]/g, '\\$&').replace(/\//g, '[/\\\\]+'),
  'i'
)

if (!specPattern.test(payload) && !unlockPattern.test(payload)) allow()

// ⚠️ 解鎖檔的檢查必須**排在 shell 快速放行之前**。
// 那個快速放行只認「針對 DESIGN.md 的寫入跡象」，`touch doc/.design-unlock`
// 或 `echo x > doc/.design-unlock` 都不會命中，於是會被當成讀取放掉。
// 而讀解鎖檔沒有任何正當理由 —— 提到它就是想建它，所以不做 shell 細分。
if (unlockPattern.test(payload)) {
  deny(
    [
      `${UNLOCK} 必須由人建立，不能由你建立 —— 那等於自己授權自己。`,
      '',
      '如果你正想改規格正本：請停下來升報，把「規格怎麼寫／實作變成怎樣／出處」',
      '那張表給人看，由人決定要不要授權。',
    ].join('\n')
  )
}

// shell 類：沒有寫入跡象就當成讀取，放行。
if (/shell|bash|exec|command/i.test(toolName) && !SHELL_WRITE.test(payload)) allow()

const root = input.cwd || process.cwd()
if (existsSync(resolve(join(root, UNLOCK)))) allow()

deny(
  [
    `${SPEC} 是規格正本，不得自行改寫來遷就實作。`,
    '',
    '實作與規格牴觸時的正確動作是**停下來升報**：',
    '列出「規格怎麼寫／實作變成怎樣／出處（帶行號）」那張表，等人裁決。',
    '格式見 doc-sync skill 的「升報格式」一節。',
    '',
    `若這次修改**已經人點頭**：請由人建立 ${UNLOCK}（空檔即可）後重試，改完刪除。`,
    '你不可以自己建這個檔 —— 那等於自己授權自己。',
  ].join('\n')
)
