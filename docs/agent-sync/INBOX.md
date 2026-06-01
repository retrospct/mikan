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

@front   **P0** — wire the UI to `window.api`, retire mock `data.ts`. Contract's ready: see `INTEGRATION.md` (swap map) + `ROADMAP.md` #2.
@back    smoke-test `main` (embedder loads + tray runs + capture→search), then clear the 3 dependabot vulns. `ROADMAP.md` #1, #11.
@back    AI drafting layer (`ROADMAP.md` #3) — **blocked**: settle the AI-model decision first (on-device vs cloud; ADR).
@all     baseline is `main` @ #12–#15; pull fresh before new work.
