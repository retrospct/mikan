# Nimi roadmap

Shared punch list. **Baseline:** all 15 original items shipped. Lanes: **back** = `apps/desktop/src/main` + `packages/contract`; **front** = `apps/desktop/src/renderer`.

## Shipped

- **Monorepo migration (#0):** flat → `apps/desktop` + `packages/contract` (`@mikan/contract`), pnpm workspaces + turborepo. See [ADR 0006](adr/0006-repo-structure.md).
- On-device pipeline: capture → content-hash store → extract → chunk → embed → libSQL vector search.
- Real on-device embedder (transformers.js / MiniLM) behind a swappable seam.
- Daily focus todos: cap-5 + finish-the-list latch, plan/carry-over, per-todo context pool (surface / pin / dismiss).
- View-model IPC contract, `window.api.*`, projection layer (`apps/desktop/src/main/services/project.ts`).
- UI wired to `window.api` (#2): `api.ts` ports-and-adapters seam, `mock.ts` in-memory factory for browser preview, `data.ts` retired, all mutators + search + feed wired through real IPC.
- Electron security posture (sandbox / context-isolation / no-node, utilityProcess, nav lockdown) + tray-anchored frameless window.
- Scaffold: auth (Logto, inert until configured).
- AI drafting layer: `Drafter` seam + `CloudDrafter` (Anthropic BYO-key via `NEEME_ANTHROPIC_KEY`). All AI-gap fields (`brief`/`draft`/`note`/`noteKind`/`gathering→drafted`/`BacklogItem.conf`/per-context `whyMap`) backed; degrade to null without a key. Override model with `NEEME_DRAFTER_MODEL`.
- `captureFile` over IPC + capture UX (#4): `pipelineCaptureFile` channel, `Uint8Array` over structured-clone, content-hash dedup in the backend, feed maw drag-drop + hidden file picker, add-sheet paperclip/camera inputs, window-level nav guard, browser-preview mock parity (`capture-file.ts`).
- Feed view + uncovered-todos (#6): the Feed tab streams real captures (`pipeline.feed()`) and surfaces to-dos Nimi infers from the recent feed (`Drafter.uncover()` → `pipeline.uncoverTodos()`), cached in `meta`, "Add to backlog" wired. Degrades to no suggestions without a key.
- Image + audio extraction (OCR / ASR): async background extraction via `ocr`/`asr` seams; tesseract.js + Whisper (portable), Vision+Speech Swift helper (macOS fast path). `NEEME_EXTRACTOR=off` parks as pending.

## Punch list

> **#0 monorepo migration — ✅ DONE** (see Shipped). Paths: `apps/desktop/src/…`; contract = `packages/contract` (`@mikan/contract`). Everything below branches off the already-monorepo'd `main`.

| #   | Item                                                                                                     | Lane         | Unblocks                                         | Size | When       |
| --- | -------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------ | ---- | ---------- |
| 0   | ~~**Monorepo migration**~~ ✅ **done**                                                                    | back/struct  | a clean root everyone branches off; unblocks #14 | M    | ✅ shipped  |
| 1   | ~~Smoke-test integrated main (embedder + tray actually run)~~ ✅                                          | human        | confidence in the baseline                       | S    | ✅ shipped  |
| 2   | ~~**Wire UI → `window.api`** (retire mock `data.ts`; see `INTEGRATION.md`)~~ ✅                           | front        | the app runs on real data — the headline         | L    | ✅ shipped  |
| 3   | ~~AI drafting layer (LLM → `brief`/`draft`/`note`, `gathering→drafted`, backlog `conf`, the "why" strings)~~ ✅ | back         | every AI-gap field                               | L    | ✅ shipped  |
| 4   | ~~`captureFile` over IPC + capture UX (drag-drop / picker)~~ ✅                                          | back + front | capturing PDFs/files, not just typed notes       | M    | ✅ shipped  |
| 5   | ~~Image + audio extraction (OCR / transcription)~~ ✅                                                    | back         | screenshots & voice memos as memories            | M–L  | ✅ shipped  |
| 6   | ~~Feed view + uncovered-todos (Nimi proposes todos from the feed)~~ ✅ **done**                            | back + front | the `FedItem` / `UncoveredTodo` surfaces         | M    | ✅ shipped  |
| 7   | ~~**Worker-service tests (vitest)**~~ ✅ **done**                                                        | back         | guards pipeline/todo logic                       | M    | ✅ shipped  |
| 8   | ~~**Connectors / ingest (email, calendar, …)**~~ ✅ **done**                                             | back         | automatic capture vs manual                      | L    | ✅ shipped  |
| 9   | ~~Auth end-to-end (Logto **Native** app + PKCE, id_token JWKS-verified)~~ ✅ **done** (PR #35)            | back + front | real accounts                                    | M    | ✅ shipped  |
| 10  | ~~Sync / cloud offload (Turso), multi-user~~ ✅ **done** (PRs #46, #48, #49)                            | back         | multi-device                                     | L    | ✅ shipped  |
| 11  | ~~Vuln cleanup + CSP tighten~~ ✅                                                                        | back         | the dependabot alerts + hardening                | S    | ✅ shipped  |
| 12  | ~~Auto-updater (electron-updater) + main-merge CI release + Check for Updates UI~~ ✅                   | back/dist    | testers auto-get each pushed build               | M    | ✅ shipped  |
| 13  | ~~Package macOS (build + notarize) + Windows canary~~ ✅                                                 | back/dist    | shipping signed builds to testers                | M    | ✅ shipped  |
| 14  | ~~Start an RN + Expo app in-repo (`apps/mobile`, mobile companion)~~ ✅ **done** (PR #45)               | mobile       | the mobile surface                               | L    | ✅ shipped  |

## Post-v1 punch list

All 15 original items are shipped. The items below track work that emerged after the baseline.

| #  | Item                                                                                     | Lane         | Notes                                                      | Size | When       |
| -- | ---------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------- | ---- | ---------- |
| 15 | ~~Add-task context association (server-authoritative; `pinContext` upsert, `schedule` re-surfaces, UI kept-count)~~ ✅ (PR #63) | back + front | tasks get real context on add / schedule / pin             | M    | ✅ shipped  |
| 16 | Dependabot bump sweep (PRs #39, #41, #42, #43, #61, #62)                                | back         | keep deps current                                          | S    | pending    |

## v1.1 — Wire-up & hardening

> **All 15 baseline items are plumbing-complete, but the app is not yet
> product-complete.** A 2026-06-12 audit found that large parts of the shipping
> renderer still run on prototype stand-ins (`ui-stubs.ts`, used in the Electron
> build too) even where the real backend exists, plus reliability and partial-
> encryption gaps. The work below connects the existing UI to the existing
> backend and hardens it — **mostly wiring, not new features.** Full detail +
> code pointers: front lane → `agent-sync/UX-PUNCHLIST.md`; back lane →
> `agent-sync/APP-GAPS.md`.

| #  | Workstream                                                                                   | Lane         | Doc                        | Size | When        |
| -- | -------------------------------------------------------------------------------------------- | ------------ | -------------------------- | ---- | ----------- |
| W1 | **Encrypt remaining content** (chunks/excerpt/AI rows; plaintext at rest + over sync today)  | back         | APP-GAPS §1                | M    | **P1**      |
| W2 | **Crash recovery + RPC timeouts** (worker restart/backoff; unhandledRejection; net timeouts) | back         | APP-GAPS §2                | M    | **P1**      |
| W3 | **Sync correctness** (token refresh in worker; login-enables-sync; refetch after re-fork)    | back + front | APP-GAPS §3 / UX §C         | M    | **P1**      |
| W4 | **Wire fake UI to real backend** (voice→ASR, draft, uncoverTodos, feed persist, name, stats) | front        | UX-PUNCHLIST §A             | L    | P1          |
| W5 | **Fix dead-ends + misleading copy** (task-detail buttons, add→Today vs "backlog", plan gate) | front        | UX-PUNCHLIST §B             | M    | P2          |
| W6 | **State refresh** (archive/MemoryContext after capture + connector sync)                     | front        | UX-PUNCHLIST §C             | M    | P1          |
| W7 | **Original Today-walkthrough UX** (search slot, fresh-day hero, FAB spec, backlog screen)    | front        | UX-PUNCHLIST (2026-06-02)   | M    | P2          |
| W8 | **Missing mutators** (delete/edit/forget item, un-pin, edit todo title)                      | back + front | APP-GAPS §5                 | M    | P2          |
| W9 | **Data-model cleanup** (versioned migrations, drizzle≠DDL drift, drop orphan `memories`)     | back         | APP-GAPS §4                 | S–M  | P3          |
| 16 | Dependabot bump sweep (see post-v1 #16)                                                       | back         | —                          | S    | P3          |

## Decisions gating work

- **AI model (gates #3):** → [ADR 0004](adr/0004-ai-drafting-model.md) _(accepted: cloud BYO-key behind a `Drafter` seam)_
- **OCR / ASR (gates #5):** → [ADR 0005](adr/0005-image-audio-extraction.md) _(accepted + shipped: tesseract.js OCR / Whisper ASR portable path; macOS Vision+Speech fast path via `resources/mac/nimi-extract` Swift helper)_
- **Repo structure (gates #14):** → [ADR 0006](adr/0006-repo-structure.md) _(accepted: monorepo NOW — ✅ done)_
