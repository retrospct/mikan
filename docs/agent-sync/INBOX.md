# Agent inbox

Directives from the human. Newest on top: `@tag   directive`.
Tags: `@all` · `@backend` · `@frontend` · branch name. Delete a line once handled.

---

@back ⚠️ test fixtures collide across suites: OCR/ASR (#5) work swapped `apps/desktop/test/fixtures/sample.png` (1×1 → 200×50) under the captureFile suite. Isolate per-suite fixtures + add deterministic OCR/ASR coverage. See `apps/desktop/test/NOTES.md`.
@all ✅ **Monorepo migration (#0) MERGED** — branch off `main` (paths: `apps/desktop/src/…`, contract = `@nimi/contract` at `packages/contract`). Hold lifted.
@front after #0: wire the UI to `window.api`, retire mock `data.ts` (`ROADMAP.md` #2, `INTEGRATION.md`). Paths shift to `apps/desktop/src/renderer`.
@back after #0: smoke-test `main` (embedder + tray + capture→search), clear the 3 dependabot vulns (#1, #11). AI drafting = cloud (BYO-key) behind the `Drafter` seam (ADR 0004).
@all AI-model decision settled: cloud-first behind a seam; on-device LLM is a parked spike (ADR 0004).
