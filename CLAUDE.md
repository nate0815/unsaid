@AGENTS.md

<!-- 守則正本是 AGENTS.md，兩種工具共用。這份只放 Claude Code 專屬的部分，
     不要在這裡重複 AGENTS.md 的內容 —— 那違反「同一件事不寫在兩處」。 -->

## Claude Code 專屬

- 回填用 `/doc-sync`。
- `doc/DESIGN.md` 的寫入會跳確認框（`permissions.ask`，任何權限模式都繞不過）。
  **那一框就是 Chiao 的裁決點** —— 不要自己想辦法繞過去，也不要改用 shell 寫入。
- Codex CLI 在同一個專案裡走 `doc/.design-unlock` 解鎖檔那條路（見 AGENTS.md §1）。
  你不需要那個檔，**看到它也不要當成「可以改 DESIGN」的訊號**。
