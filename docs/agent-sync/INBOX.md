# Agent inbox — human → agent directives

The other half of the loop: `SYNC-BRIEF.md` reports status *to* the human (auto-generated);
this file carries directives *from* the human. Every agent reads it at the top of a run
(see `CLAUDE.md`). **Tracked on purpose** — it has to reach agents in other worktrees.

**Convention**
- Newest on top. One line each: `@tag   directive`.
- Tags: `@all` · `@backend` (`src/main`, `src/shared`, pipeline/worker) ·
  `@frontend` (`src/renderer`, UI) · or a branch name (`@tray`, `@embedder`) for one PR.
- **Delete a line once it's handled.** Keep this a whiteboard, not a log.

---

@all   #14 (contract) is in `main` — pull `main` fresh before starting new work.
@embedder   #12 rebased on #14 + green; awaiting human force-push & live smoke test.
@tray   rebase #13 on #14: re-add `UiApi`/`ui` + `traySetBadge` onto the new `ipc.ts`/`preload` (clean append).
