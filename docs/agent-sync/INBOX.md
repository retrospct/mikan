# Agent inbox

Directives from the human. Newest on top: `@tag   directive`.
Tags: `@all` · `@backend` · `@frontend` · branch name. Delete a line once handled.

---

@all 🚧 **HOLD — monorepo migration lands FIRST** (`ROADMAP.md` #0 / ADR 0006). Do NOT branch new work until it's merged.
@front after #0: wire the UI to `window.api`, retire mock `data.ts` (`ROADMAP.md` #2, `INTEGRATION.md`).
@back after #0: smoke-test `main` (embedder + tray + capture→search), clear the 3 dependabot vulns (#1, #11).
@all AI-model decision settled: cloud-first behind a seam; on-device LLM is a parked spike (ADR 0004).
