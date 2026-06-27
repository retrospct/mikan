# @mikan/desktop — agent guide

The Electron desktop app. Read the **root `CLAUDE.md`** first (the shared spine:
coordination, security invariants, the contract, verify steps). This file adds the
detail that's specific to working _inside_ this package.

## Structure

```
apps/desktop/
  src/
    main/        ← Node/Electron. A thin IPC router + the data utilityProcess (worker).
      worker/    ← the utilityProcess: owns libSQL + pipeline + todos (native work lives here)
      services/  ← pipeline-service, todo-service, project (data-model → view-model projection)
      pipeline/  ← capture → extract → chunk → embed → index
      db/        ← Drizzle schema + libSQL client
      auth/      ← Logto OIDC (inert until configured)
      window/    ← tray-anchored frameless window
    preload/     ← the contextBridge surface (window.api.*)
    renderer/    ← the React UI (src/renderer/src), index.html, Tailwind
  electron.vite.config.ts   ← three builds (main+worker / preload / renderer)
  electron-builder.config.cjs ← packaging (macOS now, Windows later), appId dev.retro.mikan from @mikan/brand identity.json
  tsconfig.node.json / tsconfig.web.json
```

## Consuming the contract

Import the shared types/client from the **`@mikan/contract`** workspace package — never with
a relative path into `packages/`:

```ts
import { IPC, type MikanApi } from '@mikan/contract/ipc'
import type { Task, Memory } from '@mikan/contract/views'
import { getHealth } from '@mikan/contract/api'
```

`@mikan/contract` is bundled **from .ts source**: `electron.vite.config.ts` passes
`externalizeDepsPlugin({ exclude: ['@mikan/contract'] })` so it's compiled into the bundles
(not externalized like native deps), and the tsconfigs map `@mikan/contract/*` via `paths`.
If you change the contract, edit it in `packages/contract` and update `docs/INTEGRATION.md`.

## Build/dev notes

- `pnpm --filter @mikan/desktop dev` (or `pnpm dev` from root via turbo). `electron-vite dev`
  is interactive/persistent.
- Two main-process entries build into `out/main`: `index.js` (app) and `worker.js` (the
  utilityProcess, forked at runtime via `join(__dirname, 'worker.js')`).
- **No Electron runtime in CI/agents** → smoke-test worker behavior with a live `pnpm dev`
  before merge. Offline fallback: `NEEME_EMBEDDER=hash pnpm dev`.
- The worker receives its data dir from main as `NEEME_USER_DATA` when forked (it has no
  `electron.app`).

## Tests (vitest)

Worker-service tests live under `test/` and run in plain Node (no Electron):

```bash
pnpm --filter @mikan/desktop test        # run once
pnpm --filter @mikan/desktop test:watch  # watch mode
```

Tests use `NEEME_EMBEDDER=hash` + `NEEME_DRAFTER=off` + a per-file temp libSQL DB
(auto-created / cleaned up). No ONNX model download, no network, no Electron required.
Tier A: pure unit tests (chunk, extract, embed, draft, projectors). Tier B: integration
tests against a real libSQL file (pipeline-service, todo-service, draft-service).

## Security

The non-negotiable Electron invariants live in the root `CLAUDE.md` and `docs/SECURITY.md`.
They are enforced here (`src/main/window`, `src/preload`) — don't loosen sandbox / context
isolation / nav lockdown, and only expose scoped methods over `contextBridge`.

### Secrets & the macOS keychain prompt

All at-rest secrets (Logto refresh token, Google connector tokens, broker sync token,
per-device sync key) live in **one** `safeStorage`-sealed vault, `src/main/secrets/store.ts`
(`neeme-secrets.bin`). `loadAll()` runs first in `app.whenReady()` — one Keychain decrypt at
boot; every owner then reads its slice from memory. Add a new secret as a key on `SecretsShape`
(`get`/`set`), not a new sealed file — N files = N Keychain prompts on launch.

The macOS "… wants to use … Safe Storage" prompt is a **code-signing** artifact, not a bug:
the keychain ACL is granted to a stable signing identity. So —
- **`pnpm dev` is ad-hoc-signed → it re-prompts on every launch** (expected; "Always Allow"
  can't persist). Live with it, or re-sign `node_modules/electron/dist/Electron.app` with a
  stable self-signed identity so the ACL sticks.
- **A properly Developer-ID-signed + notarized release prompts once**, then "Always Allow"
  (not "Allow") persists forever. The CI release signs (`.github/workflows/release.yml`:
  `CSC_LINK` + `APPLE_*`). If a *packaged* build re-prompts every launch, verify it's the
  signed DMG: `codesign -dv --verbose=4 <app>` (expect Developer ID + stable identifier/team)
  and `spctl -a -vv <app>` (expect Notarized). An unsigned local `build:unpack` /
  `electron-vite preview` will behave like dev.
