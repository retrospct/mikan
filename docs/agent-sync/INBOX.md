# Agent inbox — human → agent directives

The other half of the loop: `SYNC-BRIEF.md` reports status _to_ the human (auto-generated);
this file carries directives _from_ the human. Every agent reads it at the top of a run
(see `CLAUDE.md`). **Tracked on purpose** — it has to reach agents in other worktrees.

**Convention**

- Newest on top. One line each: `@tag   directive`.
- Tags: `@all` · `@backend` (`apps/desktop/src/main`, `packages/contract`, pipeline/worker) ·
  `@frontend` (`apps/desktop/src/renderer`, UI) · or a branch name (`@tray`, `@embedder`) for one PR.
- **Delete a line once it's handled.** Keep this a whiteboard, not a log.

---

@all ✅ **Monorepo migration (#0) is DONE** on its branch (pnpm + turborepo: `apps/desktop` + `packages/contract`/`@nimi/contract`; typecheck/build/lint green). 🚧 **HOLD still in effect until it MERGES** — don't branch new work onto the flat `main` or you'll conflict with the path moves. Once merged, branch off the monorepo'd `main` (paths: `apps/desktop/src/…`, contract = `packages/contract`).
@front after #0: wire the UI to `window.api`, retire mock `data.ts` (`ROADMAP.md` #2, `INTEGRATION.md`). Paths shift to `apps/desktop/src/renderer`.
@back after #0: smoke-test `main` (embedder + tray + capture→search), clear the 3 dependabot vulns (`ROADMAP.md` #1, #11). AI drafting = cloud (BYO-key) behind the `Drafter` seam (ADR 0004).
@all AI-model decision settled: cloud-first behind a seam; on-device LLM is a parked spike (ADR 0004).
