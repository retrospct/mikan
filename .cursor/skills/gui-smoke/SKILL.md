---
name: gui-smoke
description: >-
  Smoke-test a mikan desktop (Electron) feature end-to-end and produce
  reviewable artifacts (screenshot + short video) plus a pass/fail report. Use
  when asked to "smoke test", "follow the runbook", "verify this PR in the UI",
  or to test any GUI-facing change in apps/desktop. Encodes the standing SOP so
  the agent does not need the procedure re-pasted each run.
paths:
  - apps/desktop/**
  - docs/testing/**
---

# GUI smoke (mikan desktop)

The SOP for verifying a GUI-facing change in the Electron app and returning
consistent evidence. Two tiers: a deterministic tier that just passes/fails,
and a visual tier that produces a screenshot + a short demo video.

## 0. Orient

- Read `AGENTS.md` (root) → "Cursor Cloud specific instructions" and the
  "GUI feature tests" runbook table. If a runbook in `docs/testing/` matches the
  feature under test, follow it; it is the source of truth for steps + artifacts.
- Default offline env for every command below: `NEEME_EMBEDDER=hash`
  (skips the model download). Add `NEEME_EXTRACTOR=off` for capture/CSP smokes.
- If the Electron binary is missing (`Error: Electron uninstall`), run once:
  `node node_modules/electron/install.js`.

## 1. Deterministic tier (always run first — no judgement)

```bash
pnpm typecheck && pnpm --filter @mikan/desktop build
xvfb-run -a -s "-screen 0 1280x1024x24" pnpm --filter @mikan/desktop test:e2e
```

If a spec exists for the feature (e.g. `test/e2e/csp.spec.ts`), this is the
authoritative check. A failure here is a hard stop — fix it before the visual
tier. If you add behaviour that can be asserted programmatically, add/extend an
`_electron` spec under `apps/desktop/test/e2e/` rather than relying on eyeballs.

## 2. Visual tier (the judgement + artifacts half)

Launch the app: `NEEME_EMBEDDER=hash pnpm dev` (wait for the Vite line + the
Electron window). Then follow the matching runbook's GUI steps.

Capture exactly what the runbook's "Artifacts to capture" section lists —
typically:
- one **screenshot** of the relevant rendered screen, and
- one **short screen recording** of the behaviour working end-to-end.

Save artifacts to `/opt/cursor/artifacts/` and reference them in the report.

### Gotcha: DevTools / off-screen window

The tray-anchored window can spawn off-screen in headless VMs, so driving
DevTools via the GUI (F12) is unreliable. To inspect the renderer
deterministically, prefer the `_electron` spec (tier 1). If you must capture
runtime console / CSP data from a live `pnpm dev`, temporarily add a
`webContents.on('console-message', …)` forwarder + a `did-finish-load`
`executeJavaScript` probe in `apps/desktop/src/main/index.ts` (it logs to the
dev terminal and survives the off-screen window), and a `webContents.capturePage()`
to grab a screenshot of the real renderer. **Revert this instrumentation before
committing.**

## 3. Report

Return a terse report: each command prefixed ✅ / ⚠️ / ❌, the pass/fail of the
deterministic tier, and inline `<img>` / `<video>` references to the captured
artifacts. State explicitly if any expected artifact could not be produced and why.

## 4. Don't

- Don't loosen the security invariants in `docs/SECURITY.md` to make a test pass.
- Don't commit temporary debug instrumentation.
- Don't claim a clean result from code reading alone — the evidence must come
  from actually running the app (test output, terminal logs, or screenshots).
