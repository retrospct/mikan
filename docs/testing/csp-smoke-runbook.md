# Runbook: CSP hardening + local fonts — GUI Test (#11)

Verifies the production Content-Security-Policy and offline font bundling from
commit `f522bab`: the renderer must boot with **zero CSP violations**, load the
bundled Hanken Grotesk + JetBrains Mono fonts locally (no Google Fonts), and ship
the strict production CSP. See `docs/SECURITY.md` for the policy rationale.

## Test pyramid

| Tier | Command | Needs secret? | Needs display? | Covers |
|---|---|---|---|---|
| **1 — Static** | `pnpm typecheck && pnpm --filter @nimi/desktop build` | No | No | Types, build, font assets emitted |
| **2 — E2E smoke** | `xvfb-run -a pnpm --filter @nimi/desktop test:e2e` | No | Xvfb | `test/e2e/csp.spec.ts`: violations, fonts, no Google Fonts, strict meta |
| **3 — GUI/visual** | This runbook (§1–§2) | No | Yes | Renders correctly with bundled fonts; artifact capture |

Tiers 1–2 are automated by `.github/workflows/e2e-smoke.yml` on every PR.

> **Coverage note.** The E2E launches the built-but-not-packaged app, so
> `app.isPackaged` is `false`. That exercises the strict production `<meta>` CSP
> (the dev relaxation only applies under electron-vite `serve`), but **not** the
> defense-in-depth response header in `apps/desktop/src/main/index.ts`, which is
> gated on `app.isPackaged`. Verify the header against a packaged artifact (Tier 3
> packaging in `AGENTS.md`).

## Prerequisites

- Node ≥ 20, pnpm 10.x, X11 display (`DISPLAY=:1` in cloud VMs).
- Offline env: `NEEME_EMBEDDER=hash` (and `NEEME_EXTRACTOR=off`).
- Electron binary missing? `node node_modules/electron/install.js`.

## 1. Launch

```bash
NEEME_EMBEDDER=hash pnpm dev
```

Wait for the Vite line and the Electron window. In **dev**, a serve-only Vite
plugin rewrites the meta CSP to `DEV_CSP` (adds `style-src 'unsafe-inline'` for
HMR + `connect-src http://localhost:8000`). That relaxation is expected and is
**not** present in the built app.

## 2. Verify no CSP violations + local fonts

Open DevTools → Console and confirm **no** `Refused to …` / "Content Security
Policy" messages.

> If the tray window is off-screen and DevTools won't open (common in headless
> VMs), don't fight it — rely on Tier 2 (`csp.spec.ts`), or use the
> console-forwarder instrumentation described in the `gui-smoke` skill.

Confirm fonts loaded (DevTools console):

```js
document.fonts.check('16px "Hanken Grotesk"')   // → true
document.fonts.check('16px "JetBrains Mono"')    // → true
performance.getEntriesByType('resource').map(r => r.name).filter(n => n.includes('fonts.g'))  // → []
```

**Expected:** both font checks `true`; no `fonts.googleapis.com` / `fonts.gstatic.com`
requests; the UI renders with the correct sans (Hanken Grotesk) + mono (JetBrains
Mono) typefaces (not the system fallback).

## Artifacts to capture

- [ ] **Screenshot:** the rendered Today screen showing the bundled fonts (e.g.
      "Up late" in Hanken Grotesk, mono labels like `PICK ONE MORE THING`).
- [ ] **Video (≤ ~10s):** boot → tab through Today/Feed showing fonts render and
      no visual fallback flash. (Optional when Tier 2 is green; the screenshot +
      passing `csp.spec.ts` are sufficient evidence.)

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Fonts look like system default | `@fontsource` imports missing in `main.tsx` | confirm imports; rebuild |
| `Refused to load the font …` in console | a remote font origin crept back into the CSP/HTML | remove it; fonts must be local |
| DevTools won't open | off-screen tray window in VM | use Tier 2 `csp.spec.ts` |
| `Error: Electron uninstall` | binary not downloaded | `node node_modules/electron/install.js` |
