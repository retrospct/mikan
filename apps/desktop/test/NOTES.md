# Test notes — follow-ups to circle back on

Known gaps in the `captureFile` test setup (`smoke/` + `e2e/`). Pick these up when
extending coverage.

## 1. Shared fixtures collide across suites

`test/fixtures/sample.png` was silently swapped by the OCR/ASR (#5) workstream — a
**1×1 RGBA** placeholder became a **200×50 grayscale** image with rendered text (so its
`ocr-live.ts` has something to read). The captureFile smoke still passes (it only asserts
the image→`pending` contract, dimension-agnostic), but a shared mutable fixture changing
underneath another suite is fragile.

**To do:** give each suite its own fixtures (e.g. `fixtures/smoke/`, `fixtures/ocr/`), or
have each test assert the fixture properties it depends on so a swap fails loudly instead
of silently changing what's exercised.

## 2. No deterministic OCR/ASR coverage

The captureFile tests run with `NEEME_EXTRACTOR=off` on purpose — they cover the
**synchronous** capture contract (image/audio stored as `pending`), not the background
OCR/ASR that flips `pending → extracted`. That path (#5) currently has only `ocr-live.ts`
(a live/manual probe), not a deterministic, CI-safe test.

**To do:** add a Tier-1-style smoke that captures an image/audio fixture with the extractor
**on** and asserts `pending → extracted` + a known text snippet (pin the OCR/ASR model for
determinism), and an E2E that waits for the feed row to flip from `Reading…` to `Filed`.

## 3. (context) Why the E2E reads the DB through `window.api`, not directly

A separate `@libsql/client` reader against the app's `neeme.db` hit WAL-visibility races
(rows appeared, then read as empty). Ground truth is read via `window.api.pipeline.archive()`
— the app's own connection. Don't "simplify" this back to a direct DB read without WAL
handling.
