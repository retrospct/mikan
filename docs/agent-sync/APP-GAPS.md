# App gaps — reliability, sync, security, data model (back lane)

Back-lane (`apps/desktop/src/main`, `worker`, `packages/contract`) gaps and
risks to work through. Sourced from a full main/worker/contract audit on
2026-06-12. Companion to `UX-PUNCHLIST.md` (front lane). Check items off
(`- [x]`) as they land; keep code pointers current.

Severity: **high** = data loss / wrong behavior / broken shipped path ·
**med** = reliability/degradation risk · **low** = polish / docs drift / edge case.

---

## 1. Security & encryption (PRIORITY)

> Partial at-rest encryption means some user content is stored — **and synced to
> the cloud replica — in plaintext.** Closing this is a priority.

- [ ] **Encrypt the remaining content columns.** Today only `items.text` and
  `todos.title/notes` are encrypted (`db/migrate.ts:23-28` `ENCRYPTED_COLUMNS`,
  `services/pipeline-service.ts:19-24`). **`chunks.text`, `todo_context.excerpt`,
  and `todo_ai.*` are plaintext** at rest and over sync. Extend the encrypted-column
  set + migration. **high**
- [ ] **Wrong recovery key shows garbage, not a hard fail.** `db/crypto.ts:72-109`
  returns raw ciphertext with a warning on decrypt failure instead of failing
  closed — UI renders garbage. Decide: hard-fail + re-key prompt. **med**
- [ ] **Importing a recovery key over existing rows under a different key** makes
  that data unreadable (documented, `sync/sync-prefs.ts:75-79`). Needs a guard /
  warning flow. **med**
- [ ] **App-level lock deferred** — DB protected only by the OS account, "no
  app-level lock yet" (`db/index.ts:13`). Decide if in scope for v1.1. **low**

## 2. Reliability / crash recovery

- [ ] **Worker crash = dead app.** `worker/client.ts:59-65` rejects in-flight calls,
  clears `child`, and **never restarts**; later `call()` throws "data worker not
  started". Add supervised restart + backoff. **high**
- [ ] **No RPC timeout.** `worker/client.ts:90-96` — a hung handler blocks the caller
  forever. Add a per-call timeout + reject. **med**
- [ ] **No `unhandledRejection`/`uncaughtException` handler** in main or worker
  entrypoints (`main/index.ts`, `worker/index.ts`). **med**
- [ ] **No network timeout/retry** on outbound calls: broker (`sync/broker.ts:88`),
  Anthropic drafter (`pipeline/draft.ts:339`), Google connectors
  (`connectors/google-auth.ts:132`, `services/connector-service.ts:34`),
  `client.sync()` (`db/index.ts:123`). **med**
- [ ] **Google refresh failure silently disconnects** the provider
  (`google-auth.ts:196-206` deletes the session). A transient network blip should
  not log the user out of Gmail/Cal. **med**
- [ ] **Extraction has no retry policy** beyond boot-time `resumeMediaExtraction`;
  items stuck `pending`/`failed` stay stuck (`services/pipeline-service.ts:94-98`). **med**

## 3. Sync limitations

- [ ] **Turso auth token frozen at worker fork.** Worker reads sync config + token
  once at module load (`sync/sync-control.ts:4-5`, `worker/client.ts:71-73`). Broker
  refreshes the token in main (`broker.ts:112-126`) but the worker keeps the stale
  one until `restartWorker()` → long sessions hit auth failures. **high**
- [ ] **Login after boot doesn't enable sync.** `auth.onChange` (`main/index.ts:117-126`)
  doesn't call `prepareSyncEnv()`/`restartWorker()`. A user who turns the sync pref on
  while logged out, then logs in, stays local-only until a manual toggle. **high**
- [ ] **Stale renderer after worker restart.** `setSyncEnabled`/`importRecoveryKey`
  re-fork the worker but the renderer never refetches tasks/backlog/archive
  (`useSync.ts:79`, `MikanApp.tsx:153-168`). (Cross-listed in UX-PUNCHLIST §C.) **high**
- [ ] **No conflict resolution.** Pre-sync migration uses `INSERT OR IGNORE`
  (`db/migrate.ts:127`); libSQL replica is last-write-wins; concurrent multi-device
  edits to the same row are undefined at the app layer. **med**
- [ ] **No proactive broker-token refresh** while the app runs — only on next
  `getSyncToken()` at boot/toggle (`broker.ts:46-78`). **med**
- [ ] **Sync status is poll-only** (5s, `useSync.ts:13`); no push on worker
  boot / sync-complete. **low**

## 4. Data model / migrations

- [ ] **No versioned migrations.** Schema is raw `CREATE TABLE IF NOT EXISTS` +
  ad-hoc `addColumnIfMissing` (`db/index.ts:156-246`), despite the comment promising
  drizzle-kit once stable (`:152-154`). Risk on future upgrades. **med**
- [ ] **Drizzle schema ≠ runtime DDL.** `todoContext` lacks the FK
  `ON DELETE CASCADE` present in the SQL bootstrap (`schema.ts:103-119` vs
  `index.ts:196-207`); `external_id` unique is unconditional in Drizzle but partial
  (`WHERE ... IS NOT NULL`) in SQL. **med**
- [ ] **Orphan `memories` table** created but never read/written (`db/index.ts:162`,
  `schema.ts:12-20`) — yet included in `MIGRATABLE_TABLES`. Remove. **low**
- [ ] **Gmail full re-list every sync** when incremental returns 0 messages —
  `!cursor || messageIds.length === 0` re-lists 200 (`services/connector-service.ts:77-87`). **med**
- [ ] **`gathering` draft status never set** before the LLM call
  (`services/draft-service.ts:163`), so the UI never sees an in-flight drafting
  state. **low**
- [ ] **`todoApi.done()` returns worker `Todo[]`**, not the view model — inconsistent
  with other todo IPC (`contract/ipc.ts:185`). **low**

## 5. Missing capabilities (contract surface)

- [ ] **No delete / edit / forget.** No IPC to delete an item, edit a todo title, or
  forget a memory — the archive only grows (`contract/ipc.ts`). **med**
- [ ] **No un-pin.** Unpinning context is local-only; reload restores server pins
  (`task.tsx:325`). Needs a contract mutator. **med**
- [ ] **Stale "AI-gap" comments** in `contract/views.ts:50-84` claim fields aren't
  emitted — backend now emits them (`services/project.ts`, `draft-service.ts`).
  Update the docs. **low**

---

## Dormant-by-default (informational, not bugs)

These ship inert without runtime secrets/env — expected, but worth knowing when
testing a packaged build:

- **AI drafting / chat / uncovered-todos** — need `NEEME_ANTHROPIC_KEY`
  (`pipeline/draft.ts:382`); else `NullDrafter` → null fields, `uncoverTodos → []`.
- **Gmail/GCal connectors** — need `MAIN_VITE_GOOGLE_CLIENT_ID/_SECRET`.
- **Semantic search quality** — default `LocalEmbedder` downloads an ONNX model;
  `NEEME_EMBEDDER=hash` (tests/CI) is non-semantic.
- **Login gate** — when Logto env is baked in, the whole app sits behind sign-in
  (`MikanApp.tsx:330`); local-first data is reachable only after login.
