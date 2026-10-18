---
name: doc-sync
description: 把這次的程式或規格變動回填到 doc/ 四份文件。當程式改完要收工、規格有調整、Stop hook 擋下說「文件還沒回填」、或使用者說「回填文件／同步文件／更新文件」時使用。包含實作與 DESIGN 規格的衝突偵測與升報。
---

# 文件回填（doc-sync）

⚠️ **本檔不是正本，不要照著它做事。**

內容正本在 [.agents/skills/doc-sync/SKILL.md](../../../.agents/skills/doc-sync/SKILL.md) ——
**先完整讀完那份再動作**。

為什麼要這一層轉接：Claude Code 只掃 `.claude/skills/`，Codex CLI 掃
`.agents/skills/`，而回填流程兩邊必須一模一樣。正本放在工具中立的 `.agents/` 下，
這裡只留一個指標，避免「同一件事寫在兩處」之後慢慢漂移。
