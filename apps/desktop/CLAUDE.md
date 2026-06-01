# @nimi/desktop — agent guide

The Electron desktop app. Read the **root `CLAUDE.md`** first (the shared spine:
coordination, security invariants, the contract, verify steps). This file adds the
detail that's specific to working *inside* this package.

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
  electron-builder.yml       ← packaging (mac/win/linux), appId cool.jlee.nimi
  tsconfig.node.json / tsconfig.web.json
```

## Consuming the contract

Import the shared types/client from the **`@nimi/contract`** workspace package — never with
a relative path into `packages/`:

```ts
import { IPC, type NimiApi } from '@nimi/contract/ipc'
import type { Task, Memory } from '@nimi/contract/views'
import { getHealth } from '@nimi/contract/api'
```

`@nimi/contract` is bundled **from .ts source**: `electron.vite.config.ts` passes
`externalizeDepsPlugin({ exclude: ['@nimi/contract'] })` so it's compiled into the bundles
(not externalized like native deps), and the tsconfigs map `@nimi/contract/*` via `paths`.
If you change the contract, edit it in `packages/contract` and update `docs/INTEGRATION.md`.

## Build/dev notes

- `pnpm --filter @nimi/desktop dev` (or `pnpm dev` from root via turbo). `electron-vite dev`
  is interactive/persistent.
- Two main-process entries build into `out/main`: `index.js` (app) and `worker.js` (the
  utilityProcess, forked at runtime via `join(__dirname, 'worker.js')`).
- **No Electron runtime in CI/agents** → smoke-test worker behavior with a live `pnpm dev`
  before merge. Offline fallback: `NEEME_EMBEDDER=hash pnpm dev`.
- The worker receives its data dir from main as `NEEME_USER_DATA` when forked (it has no
  `electron.app`).

## Security

The non-negotiable Electron invariants live in the root `CLAUDE.md` and `docs/SECURITY.md`.
They are enforced here (`src/main/window`, `src/preload`) — don't loosen sandbox / context
isolation / nav lockdown, and only expose scoped methods over `contextBridge`.
