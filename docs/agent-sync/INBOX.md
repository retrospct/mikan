# Agent inbox

Directives from the human. Newest on top: `@tag   directive`.
Tags: `@all` · `@backend` · `@frontend` · branch name. Delete a line once handled.

---

@all 🧹 **Mikan single-brand collapse** (branch `refactor/single-brand-mikan`). Removed the now-dead multi-brand machinery: `@nimi/brand` is `export const brand = mikan` — dropped `resolveBrandId`/the `brands` registry/`BRAND_ID`/the `__BRAND__` define/`BRAND` env, the turbo `globalEnv` `BRAND` entry, and electron-builder brand-keying (now static `identity.mikan`). Docs pruned of the dropped second brand. **Touches no mobile files** → conflict-free with `claude/desktop-beta-react-native-strategy-vg5qb9` (ADR 0009). @back heads-up: **PR #84 reconciles `apps/mobile/package.json` to Expo SDK 56** (drops `react-native-web`, adds `@expo/metro-runtime`, TS 6, `platforms: [ios,android]`) and lands after the RN-strategy branch — expect a small mobile-deps reconcile there.

@all 🎯 **v1.1 — Wire-up & hardening** (2026-06-12 audit). Baseline is plumbing-complete but not product-complete: much of the shipping renderer still runs on prototype stand-ins (`ui-stubs.ts`) even where the real backend exists, plus reliability + partial-encryption gaps. Workstreams W1–W9 in `docs/ROADMAP.md § v1.1`. **P1 first: W1 encrypt remaining content (chunks/excerpt/AI rows are plaintext at rest + over sync), W2 crash recovery + timeouts, W3 sync correctness, W4 wire fake UI to backend, W6 state refresh.**

@front 🔌 **Finish remaining prototype UI stubs** — #90 wired the main renderer seam to real `window.api` (`api.ts`; `mock.ts` only for browser preview). Remaining gaps: voice is still cosmetic, task chat/draft CTAs are scripted, Feed voice quick-add does not persist, static suggestions are decorative, and background mutations still need refresh signals. Full list + code pointers: `docs/agent-sync/UX-PUNCHLIST.md § Batch 2026-06-12`.

@back ⚠️ **Reliability + security** — worker crash has no recovery, no RPC/network timeouts, Turso token frozen at fork, login-after-boot doesn't enable sync, and **chunks/excerpt/AI rows are stored + synced in plaintext** (priority). Full list: `docs/agent-sync/APP-GAPS.md`.

@front 🐛 **UX / workflow punch list** — 5 items from a Today empty-state walkthrough (search button placement, the lingering "A fresh day / Plan today" page, what the **+** FAB should do, today-vs-backlog toggle on add-to-do, and a context-aware **+** default on the backlog screen). Full detail + code pointers + screenshot: `docs/agent-sync/UX-PUNCHLIST.md`.

@back 🔌 **#8 connectors (Gmail/Cal) ↔ #9 auth coordination** — Logto login lives in `auth/logto.ts` + `auth/oidc.ts` and gates the app via `auth-gate.tsx`; connector login lives in `connectors/google-auth.ts`. Two rules so we don't collide: (1) **REUSE the pure PKCE primitives** from `auth/oidc.ts` (`base64url`, `randomVerifier`, `randomState`, `pkceChallenge`) — provider-agnostic, no Logto coupling; don't re-roll crypto. Extend `buildAuthorizeUrl` _additively_ (e.g. an `extraParams` for Google `access_type=offline`) if you need it. (2) **Keep redirect transports separate**: login owns the `mikan://` custom scheme (`main/index.ts` `open-url`/`second-instance` → `auth.handleCallback`); connectors must use a **loopback HTTP listener**, never the custom scheme. Land connector IPC channels/view-models in `@nimi/contract` first (no auth overlap there). Google creds need a `MAIN_VITE_`/`NEEME_` prefix to reach main/worker via electron-vite/turbo — bare `GOOGLE_CLIENT_ID/SECRET` reaches nothing. Details: `docs/auth/auth-logto-setup.md` § "Two OAuth flows".

@back ⚠️ test fixtures collide across suites: OCR/ASR (#5) work swapped `apps/desktop/test/fixtures/sample.png` (1×1 → 200×50) under the captureFile suite. Isolate per-suite fixtures + add deterministic OCR/ASR coverage. See `apps/desktop/test/NOTES.md`.
@all ✅ **Monorepo migration (#0) MERGED** — branch off `main` (paths: `apps/desktop/src/…`, contract = `@nimi/contract` at `packages/contract`). Hold lifted.
@front after #0: UI wiring to `window.api` shipped in #90 (`api.ts` seam, `mock.ts` browser fallback, `data.ts` retired). Remaining renderer work is tracked in `UX-PUNCHLIST.md`.
@back after #0: smoke-test `main` (embedder + tray + capture→search), clear the 3 dependabot vulns (#1, #11). AI drafting = cloud (BYO-key) behind the `Drafter` seam (ADR 0004).
@all AI-model decision settled: cloud-first behind a seam; on-device LLM is a parked spike (ADR 0004).
