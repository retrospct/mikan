# Integration contract (backend ⇄ UI)

The sync surface between the two of us. **The types are the contract** — `src/shared`
is compiler-enforced, so this doc only needs to carry the things types can't: which
`window.api.*` call replaces which mock, what's real vs. stubbed, and the invariants.

> Keep this short. It exists so we don't have to trade plan files. If something here
> drifts from `src/shared`, the code wins — fix the doc.

## Where the contract lives

- **`src/shared/views.ts`** — the view model: `Memory`, `Task`, `BacklogItem`,
  `FedItem`, `MatchHit` (+ `MemoryKind`/`TaskStatus`/`NoteKind`). Lifted **verbatim**
  from `renderer/src/neeme/data.ts`, so swapping is a mechanical import change.
- **`src/shared/ipc.ts`** — the `window.api.*` surface (`NeemeApi`) + channels.
- Import from the new alias: `import type { Task, Memory } from '@shared/views'`.

## "Wire real, plain"

Structural data is **served for real** from the on-device pipeline (libSQL + vector
search in the utilityProcess). **AI-generated fields come back `null`/empty** until the
drafting layer (an LLM) lands. The UI should degrade gracefully — no brief, no draft,
neutral status. Every AI-gap field is marked in `views.ts`.

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

`MEMORIES` is a `Record<id, Memory>`; `archive()` returns a `Memory[]`. Build the lookup
with `Object.fromEntries(archive.map((m) => [m.id, m]))` if you want the dict.

The mutators return the **updated `Task`**, so you can drop the result straight back into
state instead of refetching `today()`.

## Real vs. AI-gap (what's null)

**Real now:** all ids/titles/timestamps; the context pool (`Task.ctx`, `Task.pinned`,
`Task.relMap`); semantic search ranking; capture → archive → feed; the daily cap / plan
ritual; pin/dismiss persistence.

**AI-gap (null/empty until the LLM layer):**

- `Task.brief`, `Task.draft`, `Task.draftNote`, `Task.note`, `Task.noteKind`, and the
  `draftFor`/`draftType`/`draftIcon`/`useLabel`/`useNote`/`useDone` detail fields.
- `Task.status` is only ever `'gathered'` (open) or `'done'` — never `'gathering'` /
  `'drafted'` yet.
- `BacklogItem.conf` is `null`; `BacklogItem.ctx` is `[]` (context surfaces once scheduled).
- Feed-inferred `UncoveredTodo`s aren't emitted yet (treat as `[]`).
- `relOf`/`whyOf` (the per-context reason) — `relMap` gives the real score; the "why"
  string is AI-gap (use the mock `whyOf`/`CTX_WHY` or hide it for now).

## Invariant the UI relies on

Every id in `Task.ctx` / `Task.pinned` **also appears in `pipeline.archive()`** (both come
from the same `items` table). So `MEMORIES[ctxId]` always resolves — that's why the UI can
keep its "task holds ids, look the display up in the archive" model unchanged.

## Process model (unchanged — keep it true)

`renderer (sandboxed, no node)` → `preload (contextBridge)` → `main (router)` →
`utilityProcess (DB + pipeline/todos)`. The renderer only ever touches `window.api.*`.
See `docs/SECURITY.md`.

## How we stay in sync

1. Contract changes land in `src/shared` first (typecheck breaks at the boundary if we
   disagree — that's the point).
2. Update the swap map above in the same change.
3. That's the whole protocol. No plan-file trading.
