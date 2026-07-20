# Agent inbox

Directives from the human. Newest on top: `@tag   directive`.
Tags: `@all` · `@backend` · `@frontend` · branch name. Delete a line once handled.

---

@all 🎯 **v1.1 — Wire-up & hardening** (2026-06-12 audit). Baseline is plumbing-complete but not product-complete: much of the shipping renderer still runs on prototype stand-ins (`ui-stubs.ts`) even where the real backend exists, plus reliability + partial-encryption gaps. Workstreams W1–W9 in `docs/ROADMAP.md § v1.1`. **P1 first: W1 encrypt remaining content (chunks/excerpt/AI rows are plaintext at rest + over sync), W2 crash recovery + timeouts, W3 sync correctness, W4 wire fake UI to backend, W6 state refresh.**

@front 🔌 **Finish remaining prototype UI stubs** — #90 wired the main renderer seam to real `window.api` (`api.ts`; `mock.ts` only for browser preview). Remaining gaps: voice is still cosmetic, task chat/draft CTAs are scripted, Feed voice quick-add does not persist, static suggestions are decorative, and background mutations still need refresh signals. Full list + code pointers: `docs/agent-sync/UX-PUNCHLIST.md § Batch 2026-06-12`.

@back ⚠️ **Reliability + security** — worker crash has no recovery, no RPC/network timeouts, Turso token frozen at fork, login-after-boot doesn't enable sync, and **chunks/excerpt/AI rows are stored + synced in plaintext** (priority). Full list: `docs/agent-sync/APP-GAPS.md`.

@front 🐛 **UX / workflow punch list** — 5 items from a Today empty-state walkthrough (search button placement, the lingering "A fresh day / Plan today" page, what the **+** FAB should do, today-vs-backlog toggle on add-to-do, and a context-aware **+** default on the backlog screen). Full detail + code pointers + screenshot: `docs/agent-sync/UX-PUNCHLIST.md`.

@back ⚠️ test fixtures collide across suites: OCR/ASR (#5) work swapped `apps/desktop/test/fixtures/sample.png` (1×1 → 200×50) under the captureFile suite. Isolate per-suite fixtures + add deterministic OCR/ASR coverage. See `apps/desktop/test/NOTES.md`.
