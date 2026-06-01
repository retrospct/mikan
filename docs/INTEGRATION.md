# Integration contract (backend ⇄ UI)

## Where the contract lives

- **`packages/contract/src/views.ts`** — the view model: `Memory`, `Task`, `BacklogItem`, `FedItem`, `MatchHit`.
- **`packages/contract/src/ipc.ts`** — the `window.api.*` surface (`NimiApi`) + channels.
- Import from the workspace package: `import type { Task, Memory } from '@nimi/contract/views'`.

## "Wire real, plain"

Structural data is **served for real** from the on-device pipeline. **AI-generated fields come back `null`/empty** until the drafting layer lands. The UI degrades gracefully — no brief, no draft, neutral status.

## Swap map: `data.ts` mock → `window.api.*`

| UI today (mock in `data.ts`) | Call instead                                               | Returns               |
| ---------------------------- | ---------------------------------------------------------- | --------------------- |
| `MEMORIES` (archive lookup)  | `await window.api.pipeline.archive()`                      | `Memory[]`            |
| `FED_RECENT`                 | `await window.api.pipeline.feed()`                         | `FedItem[]`           |
| `matchTask(text)`            | `await window.api.pipeline.search(text)`                   | `MatchHit[]`          |
| `SEED_TASKS`                 | `await window.api.todos.today()`                           | `Task[]`              |
| `BACKLOG`                    | `await window.api.todos.backlog()`                         | `BacklogItem[]`       |
| add a task                   | `window.api.todos.add(title, notes?)`                      | `Task`                |
| complete / reopen            | `window.api.todos.{complete,reopen}(id)`                   | `Task \| null`        |
| plan the day                 | `window.api.todos.plan(keep[], day?)`                      | `Task[]`              |
| pull from backlog            | `window.api.todos.schedule(id, day?)`                      | `Task \| null`        |
| pin / dismiss context        | `window.api.todos.{pinContext,dismissContext}(id, itemId)` | `Task \| null`        |
| "search more" context        | `window.api.todos.searchMoreContext(id)`                   | `Task \| null`        |
| capture a note               | `window.api.pipeline.captureText(text, name?)`             | `{ memory, created }` |
| capture a file               | `window.api.pipeline.captureFile(bytes, name, mime?)`      | `{ memory, created }` |

`MEMORIES` is a `Record<id, Memory>`; `archive()` returns a `Memory[]`. Build the lookup with `Object.fromEntries(archive.map((m) => [m.id, m]))`.

The mutators return the **updated `Task`**, so drop the result straight back into state instead of refetching `today()`.

## Real vs. AI-gap (what's null)

**Real now:** all ids/titles/timestamps; the context pool (`Task.ctx`, `Task.pinned`, `Task.relMap`); semantic search ranking; capture → archive → feed; the daily cap / plan ritual; pin/dismiss persistence.

**Real when `NEEME_ANTHROPIC_KEY` is set (null/empty otherwise — graceful degradation still applies):**

- `Task.brief`, `Task.draft`, `Task.draftNote`, `Task.note`, `Task.noteKind`, and the `draftFor`/`draftType`/`draftIcon`/`useLabel`/`useNote`/`useDone` detail fields — all populated by the `Drafter` seam (`apps/desktop/src/main/pipeline/draft.ts`) and persisted in the `todo_ai` table.
- `Task.status` advances to `'gathering'` while the draft runs and `'drafted'` once it lands (still `'done'` when the todo is done).
- `Task.whyMap` — per-context reason strings; read as `task.whyMap?.[id]` in the renderer (replaces the mock `whyOf()` from `data.ts` — a #2 follow-up).
- `BacklogItem.conf` — populated by the drafter even for backlog items (search-backed context).

**Still AI-gap (not yet wired):**

- Feed-inferred `UncoveredTodo`s — not emitted yet (treat as `[]`). Gated on #6.
- `BacklogItem.ctx` — still `[]` until a backlog item is scheduled onto a day.

## Invariant the UI relies on

Every id in `Task.ctx` / `Task.pinned` **also appears in `pipeline.archive()`**. So `MEMORIES[ctxId]` always resolves — the "task holds ids, look the display up in the archive" model holds.

## Process model

`renderer (sandboxed, no node)` → `preload (contextBridge)` → `main (router)` → `utilityProcess (DB + pipeline/todos)`. See `docs/SECURITY.md`.
