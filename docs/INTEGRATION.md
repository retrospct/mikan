# Integration contract (backend ⇄ UI)

## Where the contract lives

- **`src/shared/views.ts`** — the view model: `Memory`, `Task`, `BacklogItem`, `FedItem`, `MatchHit`.
- **`src/shared/ipc.ts`** — the `window.api.*` surface (`NimiApi`) + channels.
- Import from the alias: `import type { Task, Memory } from '@shared/views'`.

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

`MEMORIES` is a `Record<id, Memory>`; `archive()` returns a `Memory[]`. Build the lookup with `Object.fromEntries(archive.map((m) => [m.id, m]))`.

The mutators return the **updated `Task`**, so drop the result straight back into state instead of refetching `today()`.

## Real vs. AI-gap (what's null)

**Real now:** all ids/titles/timestamps; the context pool (`Task.ctx`, `Task.pinned`, `Task.relMap`); semantic search ranking; capture → archive → feed; the daily cap / plan ritual; pin/dismiss persistence.

**AI-gap (null/empty until the LLM layer):**

- `Task.brief`, `Task.draft`, `Task.draftNote`, `Task.note`, `Task.noteKind`, and the `draftFor`/`draftType`/`draftIcon`/`useLabel`/`useNote`/`useDone` detail fields.
- `Task.status` is only ever `'gathered'` (open) or `'done'` — never `'gathering'` / `'drafted'` yet.
- `BacklogItem.conf` is `null`; `BacklogItem.ctx` is `[]`.
- Feed-inferred `UncoveredTodo`s aren't emitted yet (treat as `[]`).
- `relOf`/`whyOf` (the per-context reason) — `relMap` gives the real score; the "why" string is AI-gap.

## Invariant the UI relies on

Every id in `Task.ctx` / `Task.pinned` **also appears in `pipeline.archive()`**. So `MEMORIES[ctxId]` always resolves — the "task holds ids, look the display up in the archive" model holds.

## Process model

`renderer (sandboxed, no node)` → `preload (contextBridge)` → `main (router)` → `utilityProcess (DB + pipeline/todos)`. See `docs/SECURITY.md`.
