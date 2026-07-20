# Integration contract (backend ⇄ UI)

## Where the contract lives

- **`packages/contract/src/views.ts`** — the view model: `Memory`, `Task`, `BacklogItem`, `FedItem`, `MatchHit`.
- **`packages/contract/src/ipc.ts`** — the `window.api.*` surface (`NimiApi`) + channels.
- Import from the workspace package: `import type { Task, Memory } from '@mikan/contract/views'`.

## "Wire real, plain"

Structural data is **served for real** from the on-device pipeline. **AI-generated fields come back `null`/empty** until the drafting layer lands. The UI degrades gracefully — no brief, no draft, neutral status.

## Task lifecycle (Mikan Flows)

The renderer redesign (`docs/plans/mikan-flows.prd.md`, model in `CONTEXT.md`) is a canonical
six-state lifecycle, `Task.state` + `Task.mode` — the sole source of truth. The old, coarser
`TaskStatus` (`gathering|gathered|drafted|done`) has been **retired**: `Task.state`/`Task.mode`
are required on every `Task` (S0–S6, `docs/adr/0010-task-lifecycle.md`).

| Field | Type | Real / AI-gap |
| --- | --- | --- |
| `Task.state` | `'listed' \| 'planning' \| 'planned' \| 'working' \| 'awaiting' \| 'done'` | **Real** — derived at the projector, overridden by a persisted run row when one exists (`toTask`) |
| `Task.mode` | `'plan' \| 'auto'` | **Real** — persisted per-task (`todos.mode` column); toggle via `todos.setMode(id, mode)` (S5) |
| `Task.steps` | `PlanStep[]` | **AI-gap** — `undefined` until the planner lands (S4+) |
| `Task.receipt` | `RunReceipt` | **Real when the drafter is configured** — populated by `todos.run()`/`todos.approve()` (S5, backed by the `todo_run` table); `undefined` otherwise (no-op) |

Projector mapping today (`services/project.ts` → `toTask`): `done → 'done'`, a landed AI draft
`→ 'awaiting'` (the approval gate), otherwise `→ 'listed'` — **unless** a `todo_run` row exists
and its `state` isn't `'listed'`, in which case the run row's `state` wins (it's a real signal
from `todos.run()`, not a derivation). `'planning'`/`'planned'` stay unreachable from the real
backend — there is still no persisted multi-step plan (S4+ scope); `run()` (S5) goes straight
from `listed` to `working`/`awaiting`/`done` around a single gather-and-draft step, not a step
sequence. (The browser-preview mock shows `planning`/`planned`/`working` on its demo seed tasks
so all six render states are exercisable without a live backend — see `mikan/mock.ts`.) Group-01
presentation states are **derived in the renderer**, not stored: `delegated = mode:auto &
working`, `deferred = planning`, `in-progress = working`, `done = done`. Decision of record:
`docs/adr/0010-task-lifecycle.md`.

**`RunReceipt.sentAnything` is always `false`** — there is no outbound "send"/action-taking
integration anywhere in this codebase yet (connectors only *ingest*); this is a structural gap,
not a placeholder to read as evidence of a real send capability. Likewise, `todos.pause()` is a
blunt abort of the in-flight run, not a mid-run "steer" — redirecting an active run via chat
input is out of scope until a real step-by-step execution engine (S4+) exists.

## Current renderer wiring

Renderer components import `data` from `apps/desktop/src/renderer/src/nimi/api.ts`.
In Electron, that seam is the real preload bridge (`window.api`). In a plain Vite
browser preview, where no preload exists, `api.ts` falls back to `mock.ts` so the UI
can still be exercised without Electron.

Remaining renderer stubs are not the main data seam. They are feature-specific UI
affordances: voice transcription (`ui-stubs.nextTranscript()`), the Feed voice quick
demo (`feedOne('voice')`), task draft CTA fallback (`tryDraft()`), task chat replies,
and static suggestion chips. Track them in `docs/agent-sync/UX-PUNCHLIST.md`.

## Contract map: renderer call → `window.api.*`

| Renderer need                      | Call                                                       | Returns               |
| ---------------------------------- | ---------------------------------------------------------- | --------------------- |
| Archive lookup for `MemoryContext` | `await window.api.pipeline.archive()`                      | `Memory[]`            |
| Recent feed rows                   | `await window.api.pipeline.feed()`                         | `FedItem[]`           |
| Inferred to-dos from recent feed   | `await window.api.pipeline.uncoverTodos()`                 | `UncoveredTodo[]`     |
| Global search                      | `await window.api.pipeline.search(text)`                   | `MatchHit[]`          |
| Today's tasks                      | `await window.api.todos.today()`                           | `Task[]`              |
| Backlog                            | `await window.api.todos.backlog()`                         | `BacklogItem[]`       |
| Add a task                         | `window.api.todos.add(title, notes?)`                      | `Task`                |
| Complete / reopen                  | `window.api.todos.{complete,reopen}(id)`                   | `Task \| null`        |
| Plan the day                       | `window.api.todos.plan(keep[], day?)`                      | `Task[]`              |
| Pull from backlog                  | `window.api.todos.schedule(id, day?)`                      | `Task \| null`        |
| Pin / dismiss context              | `window.api.todos.{pinContext,dismissContext}(id, itemId)` | `Task \| null`        |
| "Search more" context              | `window.api.todos.searchMoreContext(id)`                   | `Task \| null`        |
| Set a task's mode (Group 03)       | `window.api.todos.setMode(id, mode)`                       | `Task \| null`        |
| Run a task on device (Group 03)    | `window.api.todos.run(id)`                                 | `Task \| null`        |
| Approve an awaiting run (Group 03) | `window.api.todos.approve(id)`                             | `Task \| null`        |
| Pause an in-flight run (Group 03)  | `window.api.todos.pause(id)`                               | `Task \| null`        |
| Capture a note                     | `window.api.pipeline.captureText(text, name?)`             | `{ memory, created }` |
| Capture a file                     | `window.api.pipeline.captureFile(bytes, name, mime?)`      | `{ memory, created }` |

`archive()` returns a `Memory[]`. `NimiApp` builds the `MemoryContext` lookup with
`Object.fromEntries(archive.map((m) => [m.id, m]))`, so task detail screens can resolve
`Task.ctx` / `Task.pinned` ids without prop-drilling the whole archive.

The mutators return the **updated `Task`**, so drop the result straight back into state instead of refetching `today()`.

## Real vs. AI-gap (what's null)

**Real now:** all ids/titles/timestamps; the context pool (`Task.ctx`, `Task.pinned`, `Task.relMap`); semantic search ranking; capture → archive → feed; the daily cap / plan ritual; pin/dismiss persistence.

**Real when `NEEME_ANTHROPIC_KEY` is set (null/empty otherwise — graceful degradation still applies):**

- `Task.brief`, `Task.draft`, `Task.draftNote`, `Task.note`, `Task.noteKind`, and the `draftFor`/`draftType`/`draftIcon`/`useLabel`/`useNote`/`useDone` detail fields — all populated by the `Drafter` seam (`apps/desktop/src/main/pipeline/draft.ts`) and persisted in the `todo_ai` table.
- `Task.status` advances to `'gathering'` while the draft runs and `'drafted'` once it lands (still `'done'` when the todo is done).
- `Task.whyMap` — per-context reason strings; read as `task.whyMap?.[id]` in the renderer.
- `BacklogItem.conf` — populated by the drafter even for backlog items (search-backed context).
- `pipeline.uncoverTodos()` — `UncoveredTodo[]` inferred from the recent feed by `Drafter.uncover()` (`apps/desktop/src/main/services/uncover-service.ts`). Cached in the `meta` table keyed by an inputs-hash of the feed window, so it re-calls the API only when the feed changes. `[]` without a key. Surfaced in the Feed tab.

**Still AI-gap (not yet wired):**

- `BacklogItem.ctx` — still `[]` until a backlog item is scheduled onto a day.

## Invariant the UI relies on

Every id in `Task.ctx` / `Task.pinned` **also appears in `pipeline.archive()`**. So `MEMORIES[ctxId]` always resolves — the "task holds ids, look the display up in the archive" model holds.

## Async media extraction

`captureFile` with an image or audio file returns immediately with `status: 'pending'`. OCR/ASR
runs in the background (a serial queue in the worker). On the next `feed()` or `archive()` call,
`status` will be `'extracted'` and the memory will be searchable. The feed maps both `'captured'`
and `'extracted'` to `done`; `'pending'` stays as pending until extraction completes.

**Env knobs:**

| Var                        | Effect                                                     |
| -------------------------- | ---------------------------------------------------------- |
| `NEEME_EXTRACTOR=off`      | Skip OCR/ASR entirely — image/audio stay `pending` forever |
| `NEEME_EXTRACTOR=portable` | Force tesseract.js/Whisper even on macOS                   |
| `NEEME_OCR_LANG`           | Tesseract language code (default `eng`)                    |
| `NEEME_WHISPER_MODEL`      | Whisper model (default `Xenova/whisper-tiny`)              |

## Cloud sync status (`window.api.sync`)

Opt-in Turso sync (ROADMAP #10) exposes a small status surface on `window.api`:

| Call                                | Returns      | Notes                                          |
| ----------------------------------- | ------------ | ---------------------------------------------- |
| `await window.api.sync.getStatus()` | `SyncStatus` | `{ enabled, lastSyncAt, syncing, error }`      |
| `await window.api.sync.now()`       | `void`       | trigger an immediate sync; no-op when disabled |

`SyncStatus.error` is set when sync is refused or fails — notably when `NEEME_SYNC=on`
but no valid `NEEME_SYNC_ENCRYPTION_KEY` is present (`enabled:false` + an error message).
The renderer surfaces this via `SyncControl` (`nimi/sync.tsx`, driven by the `useSync`
hook) as a header pill: a red "Sync off"/"Sync error" pill with the message in its
tooltip, "Syncing…" while a sync runs, or "Synced" (click to sync now) when healthy. The
pill renders nothing when sync is simply off with no error. There's no push event yet, so
`useSync` polls `getStatus()` on an interval.

Two more moving parts keep the replica and the renderer's view current without a manual
toggle:

- **Token refresh (`sync:set-auth`, main → worker, internal).** The worker reads
  `NEEME_SYNC_URL`/`NEEME_SYNC_AUTH_TOKEN` once at fork, so a long-running session would
  otherwise sync with a stale, expired Turso token. `sync/sync-control.ts` refreshes the
  token at the broker ~2 min ahead of expiry and pushes it to the worker over this
  channel; the worker swaps its replica client in place (`reconfigureSyncAuth`,
  `db/index.ts`) — no re-fork, no interrupted in-flight work. Also fires when a user logs
  in after boot with the sync pref already on (`onLoginEnableSync`), and returns `false`
  (a no-op, logged not retried) when the worker forked without an active replica.
- **`data:invalidated` (main → renderer push, `window.api.data.onInvalidated`).** Every
  worker re-fork (`restartWorker()` in `worker/client.ts` — the sync toggle, a recovery-key
  import, and any future crash-restart) leaves the renderer holding a stale in-memory
  today/backlog/archive. `restartWorker()` broadcasts this event once the new worker is
  ready; `MikanApp.tsx` subscribes and bumps its `reloadKey` to refetch. No payload — the
  renderer already knows how to reload everything from scratch.

## Auth status (`window.api.auth`)

Logto OIDC + PKCE (ADR 0002), inert until `MAIN_VITE_LOGTO_ENDPOINT`/`_APP_ID` are set:

| Call                                  | Returns     | Notes                                             |
| -------------------------------------- | ----------- | -------------------------------------------------- |
| `await window.api.auth.getState()`     | `AuthState` | `{ configured, isAuthenticated, claims, lastError }` |
| `await window.api.auth.getAccessToken()` | `string \| undefined` | refreshed if near expiry; `undefined` if signed out |
| `window.api.auth.login()`              | `void`      | opens the system browser (or, in dev, starts the loopback listener — see `src/main/auth/dev-loopback.ts`) |
| `window.api.auth.logout()`             | `void`      | clears the session; also clears `lastError`        |
| `window.api.auth.onChanged(cb)`        | unsubscribe | push on login/refresh/logout/callback-failure       |

`AuthState.lastError: AuthLoginError | null` surfaces why the **most recent** interactive
sign-in attempt failed — `{ code: 'user_cancelled' | 'login_failed', message }`. It's cleared
the moment a new attempt starts, on success, and on logout, so it only ever reflects a
still-relevant failure. The gate (`mikan/auth-gate.tsx`) reads it to show an error and re-enable
the Sign in button instead of hanging on the optimistic "awaiting" state forever.

## Process model

`renderer (sandboxed, no node)` → `preload (contextBridge)` → `main (router)` → `utilityProcess (DB + pipeline/todos)`. See `docs/SECURITY.md`.
