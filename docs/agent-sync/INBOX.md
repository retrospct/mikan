# Agent inbox

Directives from the human. Newest on top: `@tag   directive`.
Tags: `@all` · `@backend` · `@frontend` · branch name. Delete a line once handled.

---

@front 🐛 **UX / workflow punch list** — 5 items from a Today empty-state walkthrough (search button placement, the lingering "A fresh day / Plan today" page, what the **+** FAB should do, today-vs-backlog toggle on add-to-do, and a context-aware **+** default on the backlog screen). Full detail + code pointers + screenshot: `docs/agent-sync/UX-PUNCHLIST.md`.

@back 🔌 **#8 connectors (Gmail/Cal) ↔ #9 auth coordination** — branch `claude/epic-lederberg-882280` adds Logto login (`auth/logto.ts` + `auth/oidc.ts`, header `AuthControl`). Two rules so we don't collide: (1) **REUSE the pure PKCE primitives** from `auth/oidc.ts` (`base64url`, `randomVerifier`, `randomState`, `pkceChallenge`) — provider-agnostic, no Logto coupling; don't re-roll crypto. Extend `buildAuthorizeUrl` *additively* (e.g. an `extraParams` for Google `access_type=offline`) if you need it. (2) **Keep redirect transports separate**: login owns the `neeme://` custom scheme (`main/index.ts` `open-url`/`second-instance` → `auth.handleCallback`); connectors must use a **loopback HTTP listener**, never the custom scheme. Land connector IPC channels/view-models in `@nimi/contract` first (no auth overlap there). Google creds need a `MAIN_VITE_`/`NEEME_` prefix to reach main/worker via electron-vite/turbo — the bare `GOOGLE_CLIENT_ID/SECRET` now in `.env` reach nothing. Details: `docs/auth-logto-setup.md` § "Two OAuth flows".

@back ⚠️ test fixtures collide across suites: OCR/ASR (#5) work swapped `apps/desktop/test/fixtures/sample.png` (1×1 → 200×50) under the captureFile suite. Isolate per-suite fixtures + add deterministic OCR/ASR coverage. See `apps/desktop/test/NOTES.md`.
@all ✅ **Monorepo migration (#0) MERGED** — branch off `main` (paths: `apps/desktop/src/…`, contract = `@nimi/contract` at `packages/contract`). Hold lifted.
@front after #0: wire the UI to `window.api`, retire mock `data.ts` (`ROADMAP.md` #2, `INTEGRATION.md`). Paths shift to `apps/desktop/src/renderer`.
@back after #0: smoke-test `main` (embedder + tray + capture→search), clear the 3 dependabot vulns (#1, #11). AI drafting = cloud (BYO-key) behind the `Drafter` seam (ADR 0004).
@all AI-model decision settled: cloud-first behind a seam; on-device LLM is a parked spike (ADR 0004).
