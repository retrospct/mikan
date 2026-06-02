<!--
Clone this file to docs/testing/<feature>-runbook.md for any GUI-facing feature,
then add a row to the "GUI feature tests" table in AGENTS.md so agents discover it.
Keep the section order below — the `gui-smoke` skill expects it.
-->

# Runbook: <Feature> — GUI Test (<PR/issue ref>)

One-paragraph description of what the feature does and what "working" looks like.

## Test pyramid

| Tier | Command | Needs secret? | Needs display? | Covers |
|---|---|---|---|---|
| **1 — Static** | `pnpm typecheck && pnpm --filter @nimi/desktop build` | No | No | Types, build |
| **2 — E2E smoke** | `xvfb-run -a pnpm --filter @nimi/desktop test:e2e` | No | Xvfb | Deterministic `_electron` assertions |
| **3 — GUI/visual** | This runbook (§ below) | <key or "No"> | Yes | Judgement + artifacts |

Tiers 1–2 are the automated half (run by `.github/workflows/e2e-smoke.yml` on every
PR). Tier 3 is the agent/human half that produces the screenshot + video.

## Prerequisites

- Node ≥ 20, pnpm 10.x, an X11 display (`DISPLAY=:1` in cloud VMs).
- Offline env: `NEEME_EMBEDDER=hash` (+ `NEEME_EXTRACTOR=off` where relevant).
- `<any secret, e.g. NEEME_ANTHROPIC_KEY>` — required for: <what>.
- Electron binary missing? `node node_modules/electron/install.js`.

## 1. Launch

```bash
NEEME_EMBEDDER=hash pnpm dev
```

## 2. Steps (happy path)

1. …
2. …

**Expected:** …

## 3. Edge / degradation cases

- …

## Artifacts to capture

> The `gui-smoke` skill captures exactly what's listed here. Be specific.

- [ ] **Screenshot:** <which screen / state>.
- [ ] **Video (≤ ~15s):** <the behaviour to record end-to-end>.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| App window never opens | display not set | `export DISPLAY=:1` |
| `Error: Electron uninstall` | binary not downloaded | `node node_modules/electron/install.js` |
