# Neeme roadmap

The shared punch list. Both lanes pull from this — keep it current as items move.
**Baseline:** `main` @ all of #12–#15 merged (pipeline + embedder + contract + tray + docs).

Lanes (see `CLAUDE.md`): **back** = `src/main` + `src/shared`; **front** = `src/renderer`.

## Shipped

- On-device pipeline: capture (text + file) → content-hash store → extract (text/PDF) →
  chunk → embed → libSQL vector search.
- Real on-device embedder (transformers.js / MiniLM) behind a swappable seam.
- Daily focus todos: cap-5 + finish-the-list latch, plan/carry-over, per-todo context
  pool (surface / pin / dismiss).
- View-model IPC contract (`Memory`/`Task`/`FedItem`/`BacklogItem`/`MatchHit`),
  `window.api.*`, projection layer (`src/main/services/project.ts`).
- Electron security posture (sandbox / context-isolation / no-node, utilityProcess,
  nav lockdown) + tray-anchored frameless window.
- Scaffold: auth (Logto, inert until configured); coordination docs.

## Punch list

| # | Item | Lane | Unblocks | Size | When |
|---|------|------|----------|------|------|
| 1 | Smoke-test integrated main (embedder + tray actually run) | human | confidence in the baseline | S | now |
| 2 | **Wire UI → `window.api`** (retire mock `data.ts`; see `INTEGRATION.md`) | front | the app runs on real data — the headline | L | **P0** |
| 3 | AI drafting layer (LLM → `brief`/`draft`/`note`, `gathering→drafted`, backlog `conf`, the "why" strings) | back | every AI-gap field | L | P1 ⚠️ |
| 4 | `captureFile` over IPC + capture UX (drag-drop / picker) | back + front | capturing PDFs/files, not just typed notes | M | P1 |
| 5 | Image + audio extraction (OCR / transcription) | back | screenshots & voice memos as memories | M–L | P1 ⚠️ |
| 6 | Feed view + uncovered-todos (Neeme proposes todos from the feed) | back + front | the `FedItem` / `UncoveredTodo` surfaces | M | P2 |
| 7 | Worker-service tests (vitest) | back | guards pipeline/todo logic | M | P1 |
| 8 | Connectors / ingest (email, calendar, …) | back | automatic capture vs manual | L | P2 |
| 9 | Auth wired end-to-end (Logto configured, login tested) | back + front | real accounts | M | P2 |
| 10 | Sync / cloud offload (Turso), multi-user | back | multi-device | L | P3 |
| 11 | Vuln cleanup + CSP tighten | back | the dependabot alerts + hardening | S | P1 (quick) |

## Suggested split

- **Front:** #2 (wire UI — the priority) → #4 capture UX → #6 feed → #9 auth UI.
- **Back:** #1 + #11 (cheap, today) → #3 AI drafting → #5 image/audio + #4's IPC half →
  #7 tests → #8 connectors.

The tracks meet at the contract (`src/shared`) and run mostly parallel: #2 needs nothing
new from the backend; #3/#5 fill in the `null`s the UI already degrades around.

## Critical path

smoke-test main → **front wires the UI** (app comes alive on real data) → **back lands the
AI layer** once a model is chosen. Everything else parallelizes around that.

## ⚠️ Decisions that gate the backend track

Both are the on-device-first ↔ capability trade-off. They block real work — resolve before
starting #3 / #5 (ADR-worthy).

1. **AI model (gates #3):** on-device LLM (llama.cpp / small local model) vs cloud API vs hybrid.
2. **OCR / ASR (gates #5):** on-device (tesseract / whisper.cpp) vs cloud.
