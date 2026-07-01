---
todos:
  - id: adr-decision
    status: pending
    content: 'Amend ADR 0001 (or add ADR 0007) to record Turso/libSQL embedded replicas as the chosen single-user multi-device sync path; reconcile with ADR 0003''s speed-first reframing (0001 leaned Jazz-for-privacy, 0003 endorses Turso); capture the open human decisions (Turso org, per-user DB provisioning model, trusted-cloud vs E2E posture)'
  - id: sync-config-seam
    status: pending
    content: 'Add an opt-in sync seam in apps/desktop/src/main/db/index.ts: build the libSQL client with syncUrl/authToken/offline/syncInterval only when NEEME_SYNC=on + NEEME_SYNC_URL/NEEME_SYNC_AUTH_TOKEN are set; otherwise keep today''s pure file: client unchanged. Add a sync() wrapper + a setSyncToken() the worker can call after main fetches a token.'
  - id: vector-index-split
    status: pending
    content: 'Move the chunks vector table to a local-only DB (neeme-vec.db) so embeddings are recomputed per device and never bloat the synced primary; drop the cross-DB FK to items, repoint indexItem/search/reindexAll/syncEmbedder at the vec client, and rebuild via reindexAll() after first sync on a new device.'
  - id: identity-per-user-db
    status: pending
    content: 'Adopt per-user database isolation: one Turso DB per Logto sub. Document why whole-DB embedded replicas make a shared DB + user_id row-scoping insufficient (a replica pulls the entire primary). Key the local replica path by user (e.g. neeme-<subhash>.db) so account switching uses a different replica + token.'
  - id: token-broker
    status: pending
    content: 'Specify the TS token-broker backend (the one ADR 0002/0003 anticipate): JWKS-verify the Logto access token -> provision/lookup the user''s Turso DB via the Turso Platform API -> mint a short-lived DB-scoped token -> return { syncUrl, authToken, expiresAt }. Main fetches it with auth.getAccessToken(), caches the result in safeStorage, and pushes it to the worker — mirroring the connector access-token passing pattern.'
  - id: sync-service-wiring
    status: pending
    content: 'Add a worker sync-service that owns client.sync() (on boot, on a NEEME_SYNC_MINUTES timer, and a syncNow IPC + status broadcast); main pushes syncUrl+token when starting the worker and on token refresh, via a new @mikan/contract channel.'
  - id: at-rest-encryption
    status: pending
    content: 'Set encryptionKey for the synced primary + local replica; derive/store the key in safeStorage. Document explicitly that this is encryption-at-rest under a trusted cloud (the primary is readable with the key), NOT the zero-knowledge/E2E posture ADR 0001 explored.'
  - id: rollout-and-tests
    status: pending
    content: 'Keep NEEME_SYNC off by default so NEEME_EMBEDDER=hash / offline paths and the temp-DB vitest harness stay network-free; add a unit test asserting the seam yields a pure file: client when unconfigured; update AGENTS.md / CLAUDE.md verify + env tables.'
  - id: verify
    status: pending
    content: 'Run pnpm typecheck / build / lint / test green; manual two-device smoke against a real Turso DB (capture on device A -> sync -> appears on B; confirm the vector index rebuilds locally on B and search works offline).'
name: sync cloud offload (multi-device)
overview: 'Give a single user multi-device sync for their nimi data, behind an opt-in NEEME_SYNC flag, by choosing a sync approach from an explicit options comparison rather than assuming one. Five realistic paths are scored against nimi''s actual constraints (TS-everywhere on-device pipeline per ADR 0003, libSQL already the local store, a rebuildable F32_BLOB vector index, Logto identity from #9): Turso/libSQL embedded replicas, self-hosted libSQL server (same driver, no vendor), a Postgres cloud (Supabase/Neon) with a local libSQL cache, a sync-engine/CRDT option (ElectricSQL/PowerSync/Automerge), and a roll-your-own oplog over the existing worker. The comparison recommends Turso embedded replicas as the default for lowest friction (the data layer already builds a file: libSQL client and its header comment anticipates exactly this), with a self-hosted libSQL server as the no-lock-in fallback that reuses the identical code path. The chosen design then adds syncUrl/authToken/offline + a sync() loop only when configured, isolates users with a database-per-user model (one DB per Logto sub) since embedded replicas replicate the whole DB, splits the vector index into a local-only DB recomputed per device, and must leave the hash-embedder / temp-DB vitest harness untouched when the flag is off. Conflict resolution in libSQL offline sync is still immature, reinforcing the P3, opt-in framing.'
isProject: false
---
# Sync / cloud offload (multi-device), multi-user — ROADMAP #10

Make a single user's nimi data follow them across their own devices, tied to the Logto identity shipped in #9. This is **back** lane, size **L**, **P3** — it must be fully **opt-in** and must not perturb the local-first, offline, no-network default that the whole app (and its test harness) depends on. **The approach is chosen below in [Options & trade-offs](#options--trade-offs), not assumed**; the comparison recommends **Turso/libSQL embedded replicas** as the default (with a self-hosted libSQL server as the no-vendor fallback on the same code path), and the architecture, schema, and todos that follow flow from that recommendation.

> **ADR status up front:** ADR 0001 is still **"Exploring (no decision yet)"** and its *recommendation* leaned **Jazz** for the private peer/E2E sync axis, filing Turso only as a *trusted-cloud system-of-record* "if we accept the cloud holding a readable primary." ADR 0003 (newer, gates the all-TS on-device pipeline) then **explicitly endorses Turso embedded replicas as the sync story** and **reframes the motivation from privacy → speed/latency/offline**. **These two ADRs disagree, so #10 cannot start without resolving it.** The options comparison below lands on Turso embedded replicas (aligning with 0003), so **ADR 0001 must be amended** — see [Decision: does ADR 0001 need amending?](#decision-does-adr-0001-need-amending). That reconciliation is `todo: adr-decision` and is the first gate.

## Options & trade-offs

The brief is explicit: **Turso is the natural fit, but not a foregone conclusion.** Below, five realistic approaches are scored against nimi's *actual* constraints, then a default is recommended. The constraints that do the most filtering:

- **C1 — libSQL is already the local store.** [`db/index.ts`](apps/desktop/src/main/db/index.ts) is libSQL + Drizzle; switching the *local* engine is a rewrite, not a feature.
- **C2 — native vector search lives in the DB.** `chunks.embedding F32_BLOB(384)` + `libsql_vector_idx` + `vector_distance_cos` ([`pipeline-service.ts`](apps/desktop/src/main/services/pipeline-service.ts) lines 99–108, 236–255) is a libSQL/SQLite-native feature (ADR 0003 chose it deliberately). Any engine swap must re-home vector search.
- **C3 — TS-everywhere, on-device pipeline (ADR 0003).** No Python; the pipeline runs in the worker. A sync choice that drags in a non-TS server or a second data model fights this.
- **C4 — Logto identity is done (#9), token-passing pattern exists.** Whatever we pick must take a Logto-derived credential and isolate users; the connector flow (main mints/forwards a token to the worker) is the template.
- **C5 — offline-first is non-negotiable**, and the test harness must stay network-free when the flag is off.

Legend: ✅ strong · ⚠️ caveats · ❌ poor.

### Option A — Turso / libSQL embedded replicas *(recommended)*

Promote the local file to a replica: `createClient({ url: 'file:…', syncUrl, authToken, offline, syncInterval })` + `client.sync()`.

- **Local DB + vector fit (C1/C2):** ✅ **best possible — zero engine change.** Same driver, same file, same `F32_BLOB`/`libsql_vector_idx`. The header comment in `db/index.ts` (lines 14–18) was written for exactly this.
- **Multi-user isolation (C4):** ⚠️ **database-per-user** (one Turso DB per Logto `sub`) — required because replicas mirror the *whole* DB, so row-scoping can't isolate across devices. Clean isolation, but needs per-user DB provisioning automation.
- **Offline / conflict (C5):** ⚠️ `offline: true` gives local writes + background `sync()`; but libSQL offline sync currently does **conflict *detection* without automatic *resolution*** — LWW-ish in practice.
- **Auth tie-in (C4):** ✅ small TS token-broker (JWKS-verify Logto token → mint DB-scoped Turso token); reuses the connector token-passing pattern.
- **Ops cost:** ✅ managed Turso; main cost is the broker + per-user DB lifecycle. **Vendor dependency** is the real downside — mitigated by Option B sharing the code path.
- **P3 sequencing:** ✅ lowest-friction; can spike behind env (`NEEME_SYNC_URL`/`NEEME_SYNC_AUTH_TOKEN`) before building any automation.

### Option B — Plain libSQL / SQLite + custom sync, or **self-hosted libSQL server** *(recommended fallback)*

Run our own `sqld`/libSQL server (the open-source engine behind Turso) and point `syncUrl` at it; or hand-roll a sync layer over plain SQLite.

- **Local DB + vector fit (C1/C2):** ✅ identical to A — same driver, same vector features.
- **Isolation (C4):** ⚠️ same database-per-user model (or one DB per user on our server).
- **Offline / conflict (C5):** ⚠️ self-hosted `sqld` = **same embedded-replica protocol and the same immature conflict story** as A. A fully hand-rolled SQLite sync layer would let us *choose* a conflict model but means **building + operating replication ourselves** (large, error-prone — this is most of what Turso *is*).
- **Auth tie-in (C4):** ✅ same broker, pointed at our own token issuance.
- **Ops cost:** ❌ **we now run + scale a stateful DB service** (backups, upgrades, multi-tenancy). Trades vendor lock for ops burden.
- **P3 sequencing:** ⚠️ heavier. **Value here is strategic, not immediate:** because it's the *same `@libsql/client` code path as A*, "managed Turso now, self-host later" is a config change, not a re-platform — so A doesn't lock us in.

### Option C — Postgres cloud (Supabase / Neon) + local libSQL cache

Cloud system-of-record in Postgres; device keeps its libSQL store as a local cache/mirror.

- **Local DB + vector fit (C1/C2):** ❌ **two engines, two dialects.** We'd map every table between SQLite and Postgres and **re-home vector search** — either run `pgvector` in the cloud (then the *local* search still needs libSQL vectors → maintain both) or keep vectors local-only (then Postgres is just a blob store and we've gained little over A). High impedance with C1/C2.
- **Isolation (C4):** ✅ **this is Postgres's strength** — row-level security + `user_id` scoping is mature; Supabase/Neon both tie cleanly to a JWT (`sub`) from Logto. Best multi-user story of the five.
- **Offline / conflict (C5):** ❌ **not offline-first on its own.** Postgres clients assume connectivity; you must *build* the local-cache reconciliation layer (effectively Option E on top). Supabase's offline story is immature; Neon has none built-in.
- **Auth tie-in (C4):** ✅ excellent (Supabase Auth / Neon + JWKS). *(Neon is installed here via MCP — viable if we went this way, but it doesn't solve offline.)*
- **Ops cost:** ⚠️ managed, but now we run **two** data systems (libSQL local + Postgres cloud) and the sync glue between them.
- **P3 sequencing:** ❌ heaviest migration cost; only justified if we needed Postgres-grade relational/multi-tenant features that nimi doesn't currently have.

### Option D — Sync engine / CRDT (ElectricSQL · PowerSync · Automerge/Yjs)

Purpose-built offline-first sync with real conflict handling.

- **Local DB + vector fit (C1/C2):** ⚠️–❌ **PowerSync** syncs into a local SQLite (closest fit) but is Postgres-backed on the server (inherits C's two-engine + vector problem) and is a commercial product. **ElectricSQL** is Postgres→local read-path sync (writes are your problem; RN not a documented target — per ADR 0001). **Automerge/Yjs** replace the data model with a CRDT doc — **our `F32_BLOB` vector index and SQL queries don't live naturally in a CRDT**; we'd keep libSQL for search and bolt CRDT on for sync (two models).
- **Isolation (C4):** ✅ per-document/per-user is native to CRDTs; ⚠️ Electric/PowerSync isolate via Postgres scoping.
- **Offline / conflict (C5):** ✅ **the standout strength** — CRDTs give principled multi-writer convergence (better than A/B's LWW). This is the one place these clearly beat Turso.
- **Auth tie-in (C4):** ⚠️ varies; doable but more bespoke than A.
- **Ops cost:** ⚠️–❌ new runtime/dependency, new mental model, and (Electric/PowerSync) a Postgres backend.
- **P3 sequencing:** ❌ biggest conceptual + integration cost. ADR 0001 already explored Jazz/Automerge for the **privacy/E2E** axis; if the driver were *privacy* (not speed), this family — esp. **Jazz** — would lead. Under ADR 0003's **speed/offline** reframing, the CRDT conflict win doesn't outweigh the vector/data-model mismatch for v1.

### Option E — Roll-your-own change-log / oplog sync over the existing IPC/worker

Append an oplog table; push/pull deltas through a thin TS endpoint; apply with our own conflict rules.

- **Local DB + vector fit (C1/C2):** ✅ keeps libSQL + vectors exactly as-is (oplog covers `items`/`todos`/etc.; vectors stay local & rebuildable).
- **Isolation (C4):** ✅ we define it (per-user oplog stream keyed by `sub`).
- **Offline / conflict (C5):** ✅ **full control** of the conflict model (could even adopt CRDT-per-field) — but we **own every edge case** (ordering, idempotency, tombstones, compaction, retries).
- **Auth tie-in (C4):** ✅ trivially fits the existing main→worker token-passing.
- **Ops cost:** ❌ **we are now building and operating a sync engine.** This is exactly the work A/B buy off-the-shelf.
- **P3 sequencing:** ❌ highest build cost; justified only if no off-the-shelf option fit — but A fits.

### Scorecard

| Option | Local DB + vector fit (C1/C2) | Multi-user isolation (C4) | Offline / conflict (C5) | Logto/token tie-in (C4) | Ops cost | P3 friction |
|---|---|---|---|---|---|---|
| **A. Turso embedded replicas** | ✅✅ none needed | ⚠️ DB-per-user | ⚠️ LWW-ish (detection only) | ✅ broker | ✅ managed (vendor) | ✅ lowest |
| **B. Self-host libSQL / custom** | ✅✅ none needed | ⚠️ DB-per-user | ⚠️ same as A (or DIY) | ✅ broker | ❌ we operate it | ⚠️ medium |
| **C. Postgres + local cache** | ❌ two engines, re-home vectors | ✅ RLS/`user_id` | ❌ build the cache layer | ✅ excellent | ⚠️ two systems | ❌ high (migration) |
| **D. Sync engine / CRDT** | ⚠️–❌ data-model mismatch | ✅ native/scoped | ✅ best conflicts | ⚠️ bespoke | ⚠️–❌ new runtime | ❌ high |
| **E. Roll-your-own oplog** | ✅ unchanged | ✅ self-defined | ✅ full control / full burden | ✅ trivial | ❌ build+operate | ❌ highest |

### Recommendation

**Default: Option A — Turso / libSQL embedded replicas**, with **Option B (self-hosted libSQL server) as the explicit no-lock-in fallback on the identical code path.**

Reasoning, tied to constraints:

1. **C1 + C2 dominate.** nimi's local store *is* libSQL and its vector search *is* a libSQL-native feature chosen on purpose (ADR 0003). A is the **only option with zero engine/data-model change** — every other option either swaps the engine (C), bolts on a second model (C/D), or makes us build replication (B-custom/E). That alone is decisive at P3.
2. **The vendor risk is bounded by design.** Because B uses the *same* `@libsql/client` + `syncUrl` contract, "managed Turso now → self-host `sqld` later" is a configuration change, not a rewrite. So choosing A does **not** lock us in — it defers B until/if ops appetite exists.
3. **Where the alternatives win doesn't matter enough for v1.** D's superior CRDT conflict handling and C's mature `user_id` isolation are real, but the *driver per ADR 0003 is speed/offline*, not multi-writer collaboration or relational multi-tenancy. nimi's data is mostly append-style (`items` are content-addressed by sha256, so concurrent captures don't collide); the genuinely mutable surface (`todos`) tolerates LWW for a single user across their own devices. We pay a small conflict-quality cost to avoid a large data-model cost.
4. **If the premise changes, the choice flips — and the plan says so.** If **privacy/E2E** becomes the driver (ADR 0001's original lean), **Jazz/Automerge (D)** leads, not Turso. If nimi grows **true multi-user collaboration** or needs Postgres-grade relational features, **C** earns its migration. The `adr-decision` todo is where that premise gets pinned.

Everything below assumes Option A. Swapping to B is a deploy/config change; swapping to C/D/E would reopen the architecture section.

## Current state

The data layer is already shaped for this — by design.

- **One libSQL client, one local file.** [`apps/desktop/src/main/db/index.ts`](apps/desktop/src/main/db/index.ts) builds `dbPath = join(userDataDir(), 'neeme.db')` (line 19) and `client = createClient({ url: \`file:${dbPath}\` })` (line 24). Its header comment (lines 14–18) already states the intent: *"the same driver later turns this local file into a Turso embedded replica that syncs to the cloud, without rewriting the data layer. Sync stays opt-in (and will only ever push encrypted data)."* This plan executes that comment.
- **The worker owns the DB.** The data utilityProcess [`apps/desktop/src/main/worker/index.ts`](apps/desktop/src/main/worker/index.ts) calls `initDb()` then `syncEmbedder()` then `resumeMediaExtraction()` in `start()` (lines 71–90). It's a **plain Node child** (no `electron.app`), forked by [`apps/desktop/src/main/worker/client.ts`](apps/desktop/src/main/worker/client.ts) with `NEEME_USER_DATA: app.getPath('userData')` (lines 37–45). `@libsql/client`'s `sync()` is Node-only (Sqlite3Client) — the worker is exactly the right place for it.
- **`NEEME_USER_DATA` is the data-dir seam.** [`apps/desktop/src/main/runtime/paths.ts`](apps/desktop/src/main/runtime/paths.ts) `userDataDir()` throws if unset; main sets it when forking, and the vitest harness sets it to a temp dir.
- **Schema is global — no `user_id` anywhere.** [`apps/desktop/src/main/db/schema.ts`](apps/desktop/src/main/db/schema.ts) + the raw-SQL tables in `initDb()` define `memories`, `items` (sha256 PK + connector provenance), `connector_state`, `todos`, `todo_context`, `todo_ai`, and the vector `chunks` table (`F32_BLOB(${EMBED_DIM})` with `libsql_vector_idx`, [`db/index.ts`](apps/desktop/src/main/db/index.ts) lines 56–63). **None carry an owner.** ADR 0002 flagged the eventual `user_id` data-scoping migration; this plan revisits whether it's even the right move under embedded replicas (it isn't — see [Multi-user isolation](#multi-user-isolation)).
- **The vector index is an explicitly rebuildable artifact.** `pipelineService.reindexAll()` ([`pipeline-service.ts`](apps/desktop/src/main/services/pipeline-service.ts) lines 279–289) drops + rebuilds `chunks` from `items.text`; `syncEmbedder()` (lines 314–326) reindexes when the embedder changes. The schema comment in `schema.ts` says it outright: *"the vector index is a rebuildable artifact derived from it."*
- **Auth (#9) already gives us identity + a token-passing pattern to copy.** [`apps/desktop/src/main/auth/logto.ts`](apps/desktop/src/main/auth/logto.ts) runs the OIDC+PKCE flow in main, seals the refresh token in `safeStorage`, exposes `getAccessToken()` (lines 204–216), and carries verified `claims` (incl. `sub`). The **connector flow is the exact template for sync token handling**: main owns the token and passes a fresh one to the worker per call — `runSync()` in [`index.ts`](apps/desktop/src/main/index.ts) (lines 155–162) does `getAccessToken()` then `call(IPC.connectorsIngest, [provider, accessToken])`. Sync should pass a Turso token the same way.
- **Tests run fully offline.** `apps/desktop/test/setup.ts` sets `NEEME_USER_DATA` (temp dir) + `NEEME_EMBEDDER=hash` + `NEEME_DRAFTER=off`; vitest per-file isolation gives each file its own libSQL singleton on its own temp file. Nothing may regress this.

## How embedded-replica sync works (verified API, June 2026)

`@libsql/client` `createClient` config (confirmed against Turso docs + the libSQL client type):

```ts
const client = createClient({
  url: 'file:path/to/neeme.db', // local replica file (what we have today)
  syncUrl: 'libsql://<user-db>.turso.io', // remote primary (per-user)
  authToken: '<short-lived DB-scoped token>',
  encryptionKey: '<at-rest key>', // optional; encrypts the local file
  syncInterval: 300, // optional periodic background pull (seconds)
  offline: true // enable LOCAL writes queued for sync (else writes go to the primary)
})
await client.sync() // push local changes + pull remote frames; Node-only
```

Behavioral facts that drive the design:

- **Default = writes hit the remote primary** (needs connectivity); reads are local-fast. `offline: true` enables **local writes** queued and reconciled on the next `sync()`. For a desktop app that must work on a plane, `offline: true` is required.
- **Whole-database replication.** A replica mirrors the *entire* primary. **You cannot replicate a subset of tables or rows** — this is the single most important constraint and it dictates both the multi-user model and the vector-index decision below.
- **Conflict resolution is immature.** Turso's offline sync (public beta) does **conflict *detection* but not automatic *resolution*** yet; effective behavior is last-write-ish / policy-on-sync. This is the headline risk for a multi-device mutable store and a reason #10 is P3.
- **`encryptionKey` is at-rest only.** The cloud primary is still readable *with the key*; this is **trusted-cloud, not zero-knowledge** — exactly the caveat ADR 0001 records for Turso.

## Proposed architecture

Five seams, each opt-in and each leaving the offline default intact.

### 1. A sync-config seam in `db/index.ts` (`todo: sync-config-seam`)

Today `client` is constructed unconditionally as a pure `file:` client. Introduce a small config resolver:

```ts
// pseudo — apps/desktop/src/main/db/index.ts
function syncConfig() {
  if (process.env.NEEME_SYNC !== 'on') return null
  const syncUrl = process.env.NEEME_SYNC_URL
  const authToken = process.env.NEEME_SYNC_AUTH_TOKEN // bootstrap; later replaced by setSyncToken()
  if (!syncUrl) return null
  return { syncUrl, authToken, offline: true, syncInterval: Number(process.env.NEEME_SYNC_MINUTES ?? 5) * 60 }
}

export const client = createClient({ url: `file:${dbPath}`, ...(syncConfig() ?? {}) })
```

- **Flag off (default, and in every test): identical to today** — a bare `file:` client, no network, no `sync()`. This is the contract that keeps `NEEME_EMBEDDER=hash` and the temp-DB harness untouched.
- Add an exported `syncNow()` wrapper around `client.sync()` (no-op when not a replica — `sync()` returns `undefined` for non-replica clients) and a `setSyncToken(token)` the worker can call after main hands it a fresh token (the client is rebuilt or its token refreshed when the broker returns one).
- `EMBED_DIM`, `initDb()`, and the schema are unchanged. `initDb()`'s `CREATE TABLE IF NOT EXISTS` + additive `addColumnIfMissing` (lines 113–124) are already replica-safe: on a fresh device the replica syncs the primary's tables first, and the guards no-op.

### 2. Split the vector index into a local-only DB (`todo: vector-index-split`)

Because replication is whole-database, the `chunks` table (F32_BLOB vectors) would otherwise be **synced too**, which is undesirable:

- vectors are large and bloat the cloud primary + every device's transfer;
- they're a **rebuildable artifact** (we already rebuild them on embedder change);
- a device that runs a *different* embedder (e.g. `hash` vs MiniLM, ADR 0003's device-variance reality) holds vectors in a different space — syncing them is worse than recomputing.

**Decision:** keep `chunks` in a **second, local-only libSQL file** (`neeme-vec.db`) that is *never* given a `syncUrl`. Repoint the vector SQL in [`pipeline-service.ts`](apps/desktop/src/main/services/pipeline-service.ts) — `indexItem` (lines 99–108), `search` (lines 236–255), `reindexAll` (lines 279–289), `syncEmbedder` (lines 314–326) — at the vec client. The cross-DB FK `chunks.item_id REFERENCES items(id)` (db/index.ts line 57) must be **dropped** (no cross-file FKs); integrity is maintained in app logic (it already is — `reindexAll` iterates `items`). On a new device: after the first `sync()` pulls `items`, run `reindexAll()` once to populate `neeme-vec.db` locally. This is the cleanest expression of ADR 0001's "re-derivable, cloud-OK vs never-synced" line: **items/todos sync; vectors recompute.**

*(Alternative considered: leave `chunks` in the synced DB and accept the bloat. Rejected — embedder-space mismatch across devices makes synced vectors actively wrong, and the rebuild path already exists.)*

### 3. Multi-user isolation = database-per-user (`todo: identity-per-user-db`)

The whole-DB replication constraint **rules out the `user_id` row-scoping** approach ADR 0002 pencilled in: a shared multi-tenant DB would replicate *every* user's rows to *every* device. The idiomatic Turso model is **one database per user** (Turso scales to many small DBs), which gives true isolation for free — no `user_id` column, no query rewriting, a per-user vector index.

- **Identity → DB mapping:** the Logto `sub` (already in `claims`) is the tenant key. The local replica path becomes per-user, e.g. `join(userDataDir(), \`neeme-${shortHash(sub)}.db\`)`, so **account switching points at a different replica + token** and never mixes data. (When sync is off / signed out, fall back to today's plain `neeme.db`.)
- **No `user_id` migration needed** for the synced tables — isolation is at the DB boundary. (If we ever want server-side multi-tenant analytics we'd revisit, but that's out of scope for #10.)
- This directly answers ADR 0002's open question *"single-user-per-install vs multi-account switching"* and *"existing global rows"*: existing local `neeme.db` data is the signed-out/single-user store; turning on sync provisions a fresh per-user DB and (optionally) seeds it from the local file on first enable.

### 4. Token broker: Logto identity → Turso DB + token (`todo: token-broker`)

The Turso `authToken` is **not** the Logto token. We need a tiny **TS backend** — the one ADR 0002 ("backend verification… verifies the provider's JWT against the JWKS URL") and ADR 0003 ("pick the backend shape for offload/sync") both anticipate. Responsibilities:

1. Receive the Logto **access token** from the desktop app.
2. **JWKS-verify** it (reuse the `jose`/`createRemoteJWKSet` approach already in [`auth/logto.ts`](apps/desktop/src/main/auth/logto.ts) lines 102–106, 124–132) → trust `sub`.
3. **Provision-or-lookup** the user's Turso DB via the **Turso Platform API** (create DB on first login, keyed by `sub`).
4. **Mint a short-lived, DB-scoped Turso token** and return `{ syncUrl, authToken, expiresAt }`.

Client side mirrors the connector pattern exactly:

- Main calls the broker with `await auth.getAccessToken()`, caches `{ syncUrl, authToken }` in `safeStorage` (like the refresh token), and **pushes it to the worker** over a new `@mikan/contract` channel (e.g. `IPC.syncSetToken`) — the same shape as `call(IPC.connectorsIngest, [provider, accessToken])` in [`index.ts`](apps/desktop/src/main/index.ts) line 158.
- The worker's sync-config seam swaps the token into the client (`setSyncToken`). On 401 / expiry, the worker asks main to refresh (broadcast pattern like `auth.onChange`).

**The Turso provisioning automation + where the broker runs are human decisions** (see Open questions). For an early spike, `NEEME_SYNC_URL` + `NEEME_SYNC_AUTH_TOKEN` env (a hand-created DB + `turso db tokens create`) lets us prove the replica loop **before** building the broker.

### 5. Sync-service wiring in the worker (`todo: sync-service-wiring`)

A small `sync-service` in `apps/desktop/src/main/services/` owns the `sync()` cadence:

- **On boot** (in `worker/index.ts` `start()`, after `initDb()` and *before* `syncEmbedder()` so the first reindex sees pulled `items`): if configured, `await syncNow()`.
- **Periodic**: rely on `syncInterval`, plus an explicit `syncNow` after local mutations (capture/todo writes) and before searches that need freshness — `client.sync()` is cheap when nothing changed.
- **IPC**: `IPC.syncNow` + a `syncStatus` broadcast (last-synced, pending, error) for a future settings UI, paralleling `connectorsChanged`/`buildConnectorsState` in [`index.ts`](apps/desktop/src/main/index.ts) lines 123–149.

## Schema / identity changes

- **No `user_id` columns.** Isolation is at the database boundary (database-per-user), not the row boundary — a deliberate departure from ADR 0002's pencilled migration, forced by whole-DB replication. Document this in the ADR amendment.
- **`chunks` leaves the synced DB.** Move it (and `chunks_vec_idx`) into `neeme-vec.db`; drop the `item_id` FK; keep the same DDL otherwise. `db/index.ts` `initDb()` splits into `initDb()` (synced tables) + `initVecDb()` (local-only).
- **Local replica path is per-user.** `dbPath` derives from `sub` when sync is on; today's `neeme.db` remains the signed-out store.
- **No change to view-models / `@mikan/contract` data shapes** — sync is invisible to the renderer; only new control channels (`syncSetToken`, `syncNow`, `syncStatus`) are added.

## Phased todos

1. **`adr-decision`** — Resolve the 0001-vs-0003 disagreement on the record (amend 0001 or add 0007). Gate.
2. **`sync-config-seam`** — Opt-in client config in `db/index.ts`; pure `file:` client when off; `syncNow()` + `setSyncToken()`.
3. **`vector-index-split`** — `chunks` → `neeme-vec.db`; repoint pipeline-service vector SQL; rebuild via `reindexAll()` on new devices.
4. **`identity-per-user-db`** — Per-user local replica path keyed by Logto `sub`; document database-per-user over row-scoping.
5. **`token-broker`** — TS broker (JWKS-verify → Platform-API provision → mint DB token); main caches + pushes token to worker.
6. **`sync-service-wiring`** — Worker sync cadence + `syncNow`/`syncStatus` IPC; main pushes token on start/refresh.
7. **`at-rest-encryption`** — `encryptionKey` for primary + replica; key in `safeStorage`; document the trusted-cloud (not E2E) posture.
8. **`rollout-and-tests`** — Default-off flag; unit test the seam (pure `file:` when unconfigured); update `AGENTS.md`/`CLAUDE.md`.
9. **`verify`** — Static checks green + a real two-device smoke.

A useful **spike order** (de-risk before the broker): do `sync-config-seam` + `vector-index-split` first, point at a hand-created Turso DB via env, prove the two-device loop, *then* build identity/broker/encryption.

## Risks

- **Conflict resolution (highest).** libSQL offline sync detects but does **not auto-resolve** conflicts yet. `todos` mutate (`status`/`day`/`position`) and are the real exposure; `items` are content-addressed (sha256 PK) so concurrent captures rarely collide, and `chunks` don't sync at all. Mitigation: lean on `items` immutability, treat `todos` as last-write-wins for v1, gate behind P3, and document the limitation. Re-evaluate when Turso ships automatic resolution.
- **Vector sync / embedder-space drift.** Solved by *not* syncing vectors (local-only `neeme-vec.db` + per-device `reindexAll()`), which also dodges cross-device embedder mismatch (ADR 0003 device variance). Cost: a one-time reindex on each new device after first sync (acceptable; already a supported path).
- **Token security.** Never put the Turso `authToken` in the renderer; keep it in main `safeStorage` + the worker, exactly like the Logto refresh token and connector tokens. Use **short-lived, DB-scoped** tokens minted per session; refresh on 401.
- **Privacy gap vs ADR 0001's ideal.** `encryptionKey` is at-rest; the cloud primary is readable with the key → **trusted-cloud, not zero-knowledge.** ADR 0001's E2E/Jazz lean is *not* satisfied by this. The amendment must state this explicitly and accept it for #10 (matching ADR 0003's speed-first reframing), or scope #10 to non-sensitive/re-derivable data only.
- **Provisioning + cost (P3 sequencing).** Per-user DB creation automation, Turso org/billing, and broker hosting are real ops. Keep #10 behind the flag and ship the env-driven spike first so nothing is provisioned until a human commits.
- **Test-harness regression.** The flag-off default is the guardrail; add an explicit unit test that the seam produces a non-replica client when unconfigured so a future refactor can't silently turn sync (and network) on in CI.

## Decision: does ADR 0001 need amending?

**Yes.** ADR 0001 is still **"Exploring"** and its recommendation **leaned Jazz** for private peer/E2E sync, filing Turso only as a conditional trusted-cloud fallback. ADR 0003 later **chose Turso embedded replicas** as the sync story and **reframed the driver to speed/offline**. Proceeding with this plan means **formally adopting the Turso path**, so either:

- **(preferred)** flip ADR 0001 to **Accepted** with an amendment recording: Turso embedded replicas for single-user multi-device sync; database-per-user isolation; vectors recomputed locally; trusted-cloud (at-rest) not zero-knowledge for v1; Jazz/E2E deferred to a future privacy track — **or** —
- add a focused **ADR 0007 "Sync implementation: Turso embedded replicas"** that supersedes 0001's recommendation section and cites 0003.

Either way the disagreement must be closed in `docs/adr/` before code lands (`todo: adr-decision`).

## Open questions (need a human)

- **Turso account/org + billing** — who owns it, free-tier headroom for database-per-user at expected user counts.
- **Per-user DB provisioning model** — auto-create-on-first-login via Platform API vs pre-provision; naming; teardown on account delete.
- **Where the token broker runs** — Hono/Next/Vercel function vs folding into a future nimi backend (ties to ADR 0003 action item #4 "pick the backend shape").
- **Encryption key custody** — per-user key derivation + escrow/recovery (lose the key = lose at-rest data); is recovery in scope?
- **Privacy posture sign-off** — accept trusted-cloud (at-rest) for #10, or hold the line on 0001's zero-knowledge goal (which would push toward Jazz/E2E instead of Turso)?
- **P3 sequencing** — does multi-device sync precede or follow `apps/mobile` (#14)? Mobile is the strongest reason sync matters, and libSQL/Turso RN support is weaker (ADR 0001) — worth confirming before investing.

## Verify

- `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm test` all green **with the flag off** — proving the default path and the temp-DB vitest harness are untouched (158 tests still pass with `NEEME_EMBEDDER=hash`, no network).
- New unit test: with `NEEME_SYNC` unset, the `db` seam yields a pure `file:` client and `syncNow()` is a no-op.
- Manual two-device smoke (real Turso DB, env-driven): capture a note on device A → `sync()` → it appears on device B's archive/feed; confirm B rebuilds its local `neeme-vec.db` via `reindexAll()` and semantic search works; confirm both devices read offline after sync.
- Data-layer smoke (AGENTS.md `tsx` recipe) still works unchanged on a plain `file:` DB.

## Hosting & operators (trusted-cloud path)

This section answers the two hosting questions the trusted-cloud direction raises — **(1) the sync backend** (the libSQL/Turso primary the device replicates from) and **(2) the token-broker** — and lands on a concrete v1 stack. It assumes the chosen mechanism (Turso/libSQL embedded replicas, database-per-user, vectors local-only) from the [recommendation](#recommendation) above and the [amended ADR 0001](../adr/0001-sync-and-processing-architecture.md). *(Figures verified against Turso's pricing/docs, June 2026 — re-check at provisioning time.)*

### 0. One client-library fork to know about first

Turso now ships **two** sync stories, and which one we use sets everything else:

| | `@libsql/client` **Embedded Replicas** *(what nimi uses today)* | `@tursodatabase/sync` **Turso Sync** *(newer, Turso's recommended path)* |
|---|---|---|
| Engine | libSQL (SQLite fork) | Turso Database (Rust rewrite) |
| Sync model | Page-level; **whole DB synced first**; writes hit cloud primary (or local with `offline:true`) | Logical CDC; **local-first** `push()`/`pull()`; partial/lazy bootstrap |
| Conflict story | Detection only (LWW-ish) — our headline risk | Better (CDC), MVCC concurrent writes |
| **Drizzle / `F32_BLOB` vectors** | ✅ **supported today** (our data layer) | ❌ **no Drizzle yet** (only `@tursodatabase/database` has Drizzle *beta*); vector parity unproven |
| Status | Fully supported in production | GA engine, but ORM/vector ecosystem still catching up |

**Decision for v1: stay on `@libsql/client` embedded replicas.** It's the only path that keeps Drizzle + the native `F32_BLOB`/`libsql_vector_idx` vector search unchanged (constraints C1/C2), and it's the exact code path `db/index.ts` already anticipates. **Turso Sync is the strategic upgrade**, not the v1 choice: adopting it now would mean dropping Drizzle and re-homing vector search — exactly the data-model cost the recommendation rejects. Migrating later is a client-library swap against the *same* Turso Cloud backend (see [migration path](#migration-path-if-we-outgrow-v1)), and it directly retires this plan's "conflict resolution is immature" risk when it does.

### 1. Sync backend

#### Option A — Turso Cloud (managed) — *recommended*

Managed libSQL primaries; we provision one DB per Logto `sub` via the Platform API and mint scoped tokens from the broker.

- **Fit:** ✅ zero data-layer change. `@libsql/client` ≥ 0.35 embedded replicas, fully supported in prod. The Platform API (`@tursodatabase/api`: `databases.create(name, { group })` → `databases.createToken(name, { expiration, authorization })`) is purpose-built for database-per-user, and **Multi-DB Schema** (`is_schema` parent → `schema` children) lets all per-user DBs share + migrate one schema — a clean home for `initDb()`'s DDL.
- **At-rest encryption:** local replica file is protected by the client `encryptionKey` *we* manage. Cloud primaries are volume-encrypted at rest by default (SOC2). **Per-DB BYOK keys that Turso itself can't read are Pro/Enterprise only** — so on Free/Developer/Scaler this is genuinely *trusted-cloud* (Turso could read a primary), matching the ADR's posture. Don't conflate the local `encryptionKey` with cloud unreadability.
- **Regions:** the group's region(s); pick near testers.
- **DB-per-user scaling — the key gotcha:**

  | Plan | $/mo | Databases | Storage | Reads/mo | Writes/mo | DB-per-user verdict |
  |---|---|---|---|---|---|---|
  | **Free** | 0 | **100 / org (hard cap)** | 5 GB | 500 M | 10 M | fine for **< ~100 testers**, then you hit a wall |
  | **Developer** | 4.99 | **Unlimited** | 9 GB | (plan) | (plan) | **the DB-per-user unlock** — cheap, no count cap |
  | **Scaler** | 24.92 | Unlimited; billed by **~2,500 monthly *active* DBs** | 24 GB | (plan) | (plan) | note the billing-unit shift: *active* DBs, not total |
  | Pro | ~417 | Unlimited | 50 GB | (plan) | (plan) | only tier with **BYOK per-DB keys** |

  The single scaling gotcha: **Free caps at 100 databases per org**, and database-per-user means **1 DB ≈ 1 user** — so free silently tops out at ~100 users. Storage/rows are pooled org-wide and tiny for nimi's text data, so they're not the binding limit; the *database count* is. **Developer ($4.99) lifts the cap to unlimited**, which is why it's the recommended starting tier the moment a tester cohort could exceed ~80 DBs. (Turso explicitly markets millions of small DBs, so the many-tiny-DBs pattern is blessed, not abused.)
- **Setup:** Turso account + org slug, a group, a Platform API token (broker secret). Optional schema-parent DB.
- **Cost at tester scale:** **$0** (Free, < ~100 users) or **$4.99/mo** (Developer, no DB-count anxiety). Reads/writes for dozens of users are orders of magnitude under the free limits.
- **Lock-in:** bounded — Option B shares the identical `@libsql/client` + `syncUrl` contract, so "managed now → self-host later" is config, not a rewrite.

#### Option B — Self-hosted libSQL server (`sqld` / `libsql-server`) — *no-lock-in fallback*

Run `ghcr.io/tursodatabase/libsql-server` (`SQLD_NODE=primary`, persist `/var/lib/sqld`, optional `-F bottomless` continuous backup to S3) and point `syncUrl` at it.

- **Fit:** ✅ identical app code (same driver, same vectors, same embedded-replica protocol → same conflict story as A).
- **Where:** **Fly.io** (Turso publishes an embedded-replica-on-Fly guide; cheap mounted volume), Railway, a Hetzner/other VPS (~€4–5/mo), or Docker on any small VM.
- **DB-per-user:** we provision DBs ourselves (sqld namespaces / per-user files) **and issue our own tokens** — i.e. we re-implement the slice of the Platform API that A gives us for free.
- **What we operate:** volume persistence, backups (bottomless→S3), TLS termination, JWT/token issuance, upgrades, monitoring.
- **Cost:** ~$5/mo infra at tester scale; the real cost is **ops time**. No DB-count cap, no vendor.
- **Lock-in:** none. **Verdict: don't self-host for v1 testers** — its value is strategic insurance, realized only if vendor-exit or cost ever demands it.

#### Other managed/libSQL-adjacent options — *honest landscape*

There isn't a strong third managed libSQL host. **Turso is effectively the only managed embedded-replica provider.** Cloudflare **D1** is SQLite-over-HTTP but **not** libSQL-protocol compatible (no embedded replica / local file, different client, 10 GB/DB hard cap, different vector story) — adopting it is a re-platform (≈ Option C territory), not a drop-in. Other SQLite-cloud SaaS don't speak the embedded-replica protocol. So the realistic field is exactly **managed Turso (A) vs self-hosted `sqld` (B) on one code path** — which is why the plan treats B as a config-flip fallback rather than a separate architecture.

### 2. Token-broker host

A tiny stateless TS HTTP service: `POST` Logto access token → JWKS-verify (reuse the `jose`/`createRemoteJWKSet` already in [`auth/logto.ts`](../../apps/desktop/src/main/auth/logto.ts)) → provision-or-lookup the user's Turso DB (Platform API) → mint a short-lived DB-scoped token → return `{ syncUrl, authToken, expiresAt }`. Holds `TURSO_PLATFORM_TOKEN`, so it **must** run server-side. The mint is **once-per-session and cached in `safeStorage`** — it is not on a hot path, so cold-start latency barely matters.

| Host | Fit (TS / Hono / route handler) | Secrets | Cold start for a token mint | Cost (tester) | Verdict |
|---|---|---|---|---|---|
| **Vercel function** | ✅ TS-native; Hono or a single Next route handler | env vars | ~100–300 ms Node (Fluid Compute trims it) — fine, mint is cached | **$0** Hobby | ✅ **recommend** |
| **Cloudflare Workers** | ✅ `jose` via WebCrypto; Platform API is REST over `fetch` | secrets/vars | near-zero | ~$0–5 | ✅ strong alt (edge latency / CF-centric) |
| **Fly.io / Railway** | ✅ always-on container | env/secrets | none (always-on) | ~$5/mo | ⚠️ overkill for one endpoint unless co-located with self-hosted `sqld` |
| **Small VPS** | ✅ anything | manual | none | ~$5/mo | ⚠️ most ops, least reason |
| **Fold into neeme FastAPI** | ❌ Python, not TS | — | — | — | ❌ wrong language (ADR 0003 wants a **TS** backend) + currently undeployed; re-introduces the cross-language dance 0002/0003 avoid |

**Recommend Vercel** (a single Hono or route-handler function in a new `services/token-broker` workspace): TS-native per ADR 0003, zero-ops, env-var secrets, free at tester scale, git-push CI, and cold start is irrelevant for a cached once-per-session mint. **Cloudflare Workers** is the equally-good pick if you prefer edge latency or are already CF-centric. (The Vercel MCP/plugin is already available in this workspace, easing setup.)

### Recommended stack (v1 testers)

- **Sync backend → Turso Cloud, `@libsql/client` embedded replicas.** Start **Free** for a closed cohort (< ~100 testers); move to **Developer ($4.99/mo)** the moment DB count could cross ~80 — that single upgrade removes the only hard scaling limit (the 100-DB cap). DB-per-user keyed off Logto `sub`; local `encryptionKey` for the device file; vectors stay in local-only `neeme-vec.db`.
- **Token-broker → Vercel function** (Hono / route handler) in `services/token-broker`, holding the Platform API token and verifying Logto tokens.
- **Why:** zero data-layer change (the decisive C1/C2 win), all-TS (ADR 0003), ~**$0–5/mo** total at tester scale, and bounded lock-in (self-host `sqld` is a config flip on the same code path).

### Migration path if we outgrow v1

1. **> ~100 users** → Turso Free → Developer (billing/config only; no code).
2. **Conflict quality / bandwidth hurts** → swap `@libsql/client` embedded replicas → **`@tursodatabase/sync`** (CDC, local-first, partial sync, MVCC) once it has Drizzle + vector parity. Same Turso Cloud backend; client-library swap; retires the LWW-conflict risk.
3. **Need keys Turso can't read** (true zero-knowledge-ish per user) → Turso **Pro BYOK**, or reopen [ADR 0001](../adr/0001-sync-and-processing-architecture.md)'s **E2E/Jazz** track (premise flip: privacy becomes the driver).
4. **Vendor-exit / cost** → self-host **`sqld`** on Fly.io; point `syncUrl` at it; broker mints sqld tokens instead of Platform-API tokens. Config change, not a re-platform.
5. **Broker outgrows functions / wants DB co-location** → move the broker to Fly.io/Railway alongside self-hosted `sqld`.

### Setup checklist (what the human must create/provision)

- [ ] **Turso** account + organization; record the **org slug**.
- [ ] A **group** in a region near testers; choose plan (**Free** to start, **Developer** once DBs could exceed ~80).
- [ ] A **Platform API token** (`TURSO_PLATFORM_TOKEN`) — store only as a broker secret, never in the client.
- [ ] *(Optional)* a **Multi-DB Schema parent** DB seeded with `initDb()`'s DDL so per-user DBs share/migrate one schema.
- [ ] **Logto**: confirm the broker's expected **issuer / audience / JWKS URL** (same values `auth/logto.ts` already uses) so the broker can verify desktop access tokens.
- [ ] **Vercel** account + project for the broker; set env secrets `TURSO_PLATFORM_TOKEN`, `TURSO_ORG`, `TURSO_GROUP`, `LOGTO_ISSUER`/`LOGTO_AUDIENCE`/`LOGTO_JWKS_URL`; connect the repo for git-push deploys.
- [ ] **Spike before the broker:** a hand-created DB + `turso db tokens create`, then run the desktop with `NEEME_SYNC=on`, `NEEME_SYNC_URL`, `NEEME_SYNC_AUTH_TOKEN` to prove the two-device replica loop.
- [ ] Decide **at-rest `encryptionKey` custody** (derive + seal in `safeStorage`; lose-key-lose-data recovery story).
- [ ] **CI:** nothing new for desktop (sync stays flag-off in tests); the broker gets its own minimal Vercel deploy.

## Due-diligence sweep + re-weighted priorities (2026-06)

Final pre-sign-off sweep of the current (2026) local-first / offline-sync landscape — *then re-run under new weights from the human.* Everything above was scored with **libSQL + native vector search + TS-everywhere as hard constraints**. The human has **demoted those to mild preferences (cost/effort tie-breakers, not vetoes)** and set the real priorities, in order:

1. **Reliability / maturity** — proven, "just works," no babysitting; Electron (Node) now + React Native later without heroics.
2. **Cost** — cheap at tester scale, sane scaling.
3. **Security & privacy (elevated)** — E2E / zero-knowledge / client-side-encrypted weighted **up**; plain trusted-cloud (readable primary) is now a **relative negative** unless mitigated (BYOK / client-side encryption).

libSQL/vector/TS are now decided **only when reliability → cost → privacy tie.** Vectors must live *somewhere*, but since nimi's index is **re-derivable on-device**, "vectors stay local & rebuilt per device" is acceptable for **every** option below — so vector placement is a one-time-reindex cost, never a veto. The "where vectors live" column records it but does not gate.

### The architectural insight that reorders privacy

Two facts decide the privacy question more than any product feature:

- **A server that must *query* your data cannot be zero-knowledge.** Any SQL-sync engine whose server executes queries/joins/CDC over your rows (Postgres-backed: PowerSync, Electric, Zero, Convex, Supabase, Neon; and a *readable* Turso primary) **structurally sees plaintext.** No amount of TLS changes this. So the entire "Postgres/SQL sync engine" family is **trusted-cloud by construction** — they cannot be the privacy answer.
- **But nimi's embedded-replica design queries the *local* file, not the cloud.** The Turso primary is a **dumb sync transport** here — it never needs to read content to serve a query (all reads hit the local replica; vectors are local-only). **That means we can store client-side-encrypted content in the synced rows and the cloud holds only ciphertext** — near-zero-knowledge **without leaving the libSQL path and without paying for BYOK.** This is the option the original sweep didn't separate out, and under the new weights it's the pivotal one.

Only architectures where **the server stores opaque blobs** can be truly E2E: CRDT sync meshes (Jazz, Automerge/Yjs+relay), app-level-encrypted blob stores, or **Turso-as-ciphertext-transport** (above) / **Turso BYOK** (server-side page encryption with a key Turso can't read).

### Quick elimination (re-weighted: reliability → cost → privacy)

| Option | Reliability / maturity | Cost (tester scale) | Privacy (can it be E2E?) | Where vectors live | One-line verdict |
|---|---|---|---|---|---|
| **Turso embedded replicas — trusted-cloud** *(prior pick)* | ✅✅ GA, zero rewrite | ✅ $0–5/mo | ❌ readable primary (at-rest only) | local `neeme-vec.db` | Reliable+cheap but **now a privacy negative** on its own. |
| **Turso replicas + client-side (app-level) field encryption** | ✅ (Turso solid; ⚠️ DIY crypto layer) | ✅ $0–5/mo | ✅ cloud holds **ciphertext** (metadata leaks) | local | **The new sweet spot** — keeps #1/#2, fixes #3 cheaply. |
| **Turso BYOK (server-side, key Turso can't read)** | ✅✅ GA, zero rewrite | ❌ **Pro $416.58/mo** | ✅✅ true zero-knowledge at rest | local | Cleanest privacy, but **cost blows #2** at tester scale; revisit when funded. |
| **Self-hosted libSQL (`sqld`)** | ✅ same code path; ⚠️ we operate it | ⚠️ ~$5/mo infra + ops | ⚠️ we control it (still readable unless we add enc) | local | No-lock-in fallback; ops burden hurts #1. Config-flip from Turso. |
| **PowerSync** | ✅✅ mature, Electron+RN+Tauri SDKs | ⚠️ commercial, usage-based | ❌ Postgres/Mongo backend reads plaintext | local SQLite (their engine) | Best "local-SQLite-sync" maturity, but **trusted-cloud + 2 engines**; no privacy edge over Turso. |
| **ElectricSQL** | ✅ v1.x, but write-path is yours | ✅ OSS / SaaS | ❌ Postgres reads plaintext | local | Read-path Postgres→SQLite; not E2E; RN undocumented. |
| **Rocicorp Zero** | ✅ prod-ready | ⚠️ vCPU-priced | ❌ Postgres-backed; **explicitly NOT offline-write** | IDB replica | **Killed on offline-first** (no offline writes) + trusted-cloud. |
| **Replicache** | — superseded by Zero | — | ❌ | — | EOL path; ignore. |
| **Triplit / InstantDB** | ⚠️ young | ✅ free tiers | ❌ own trusted backend (no E2E) | own store | Trusted-cloud BaaS; no privacy edge, data-model rewrite. |
| **Convex** | ✅✅ very mature BaaS | ⚠️ usage-based | ❌ server-first, **offline still in flux** | (offline add-ons sync to SQLite) | Great reactive backend, **not offline-first/E2E**; wrong axis. |
| **RxDB + sync backend** | ✅ mature client DB | ✅–⚠️ premium plugins | ⚠️ has an encryption plugin, but you assemble sync+E2E | own (Rx) store | DIY assembly; less "just works" than Jazz, no clear win. |
| **cr-sqlite / Vlcn** | ⚠️ one-maintainer, deliberate pace | ✅ OSS | ⚠️ CRDT extension; E2E is yours to add | SQLite (works w/ libSQL!) | Loadable CRDT ext (even on libSQL); strong tech, **thin support → fails #1**; you still build the relay. |
| **MongoDB Realm / Atlas Device Sync** | ❌ **EOL Sept 30 2025** | — | — | — | **Dead.** Hard eliminate. |
| **Couchbase Lite / Capella** | ✅✅ very mature, P2P sync | ❌ enterprise pricing | ⚠️ at-rest enc; sync gateway reads data | own NoSQL store | Mature but heavy + enterprise cost; not zero-knowledge; NoSQL rewrite. |
| **Ditto** | ✅ mature edge/mesh | ❌ **enterprise (~$12k/yr base)** | ⚠️ **mTLS in transit only**, not at-rest E2E | own NoSQL store | Cost + sales motion **kill #1/#2**; privacy is transport-only. |
| **Dexie Cloud** | ✅ mature (browser) | ✅ cheap | ⚠️ add-on E2E | IndexedDB | Browser/IDB-centric; weak Electron-Node/RN file-DB story. |
| **PocketBase** | ✅ simple, mature | ✅ self-host cheap | ❌ online client to a server SQLite | server-side | Not local-first/offline-write on device; wrong shape. |
| **Supabase (offline) / Neon + cache** | ✅ Postgres mature | ✅–⚠️ | ❌ Postgres reads plaintext; offline immature | local cache | Two engines, build the cache; trusted-cloud. (Neon is here via MCP — still no offline/privacy win.) |
| **Firebase / Firestore** | ✅✅ mature, offline cache | ⚠️ usage; lock-in | ❌ Google reads data | own store | Heavy lock-in, no E2E, NoSQL rewrite. |
| **AWS Amplify DataStore** | ⚠️ maintenance-mode | ⚠️ | ❌ | own | Declining; GraphQL/DynamoDB rewrite. |
| **Jazz (jazz.tools)** | ❌ **self-described alpha**, best-effort SLA | ✅ ~$0.03/MAU, scale-to-zero, self-host (MIT) | ⚠️ **E2E weakened in 2026 rewrite** → trusted server + *opt-in* encrypted fields | local (libSQL kept for vectors) | Best cross-platform DX (RN/Expo first-class), but **fails #1 (alpha)** and **no longer E2E-by-default**. Top *spike* candidate, not a "just works" pick. |
| **Automerge / Yjs + encrypted relay** | ✅ mature core libs | ✅ run a relay | ✅ if **you build** the encryption+transport | local | True E2E achievable but **you build it → not "just works."** |
| **Evolu** | ⚠️ small project, less proven | ✅ cheap / self-host | ✅✅ **E2E-by-default on SQLite (TS)** | SQLite | **Truest E2E-SQLite-TS match**; maturity/RN+Electron unproven → privacy-purist spike. |
| **Layerbase / SQLite Cloud / sqlitedeploy** | ⚠️ newer hosts | ✅ free/cheap | ❌–⚠️ same trusted-cloud posture | local | A *second* managed-libSQL host now exists (Layerbase claims Turso-compat), but **embedded-replica/offline + E2E parity unverified**; no privacy edge over Turso. |

> Correction to the earlier "Hosting & operators" note: a couple of **managed-libSQL-adjacent hosts** (Layerbase, SQLite Cloud, the `sqlitedeploy` packaging of `sqld`) have appeared by 2026, so "Turso is the *only* managed embedded-replica provider" is now slightly too strong — but none demonstrably matches Turso's embedded-replica + vector + maturity combo, and none adds a privacy advantage. Turso remains the reference implementation.

### Privacy finalists — head-to-head

Under the new weights the contest is **not** "Turso vs a Postgres sync engine" (those are all trusted-cloud and lose on privacy). It's: **how do we get real privacy while keeping reliability #1 and cost #2?** Three live answers:

| | (a) Turso **trusted-cloud** | (b) Turso **+ client-side encryption** | (c) **Jazz** (E2E-ish CRDT) |
|---|---|---|---|
| Reliability (#1) | ✅✅ GA, zero rewrite | ✅ Turso GA + ⚠️ our crypto layer | ❌ **alpha**, evolving API |
| Cost (#2) | ✅ $0–5/mo | ✅ $0–5/mo (no Pro BYOK needed) | ✅ cheap (~$0.03/MAU) / self-host |
| Privacy (#3) | ❌ readable primary | ✅ cloud sees **ciphertext** (⚠️ metadata leaks) | ⚠️ **opt-in** encrypted fields (rewrite dropped E2E-by-default) |
| Electron now / RN later | ✅ / ⚠️ (libSQL RN weaker) | ✅ / ⚠️ | ✅ / ✅✅ (RN/Expo first-class) |
| Effort | ✅ lowest | ⚠️ design field-encryption + key custody | ❌ adopt cojson data model (rewrite); keep libSQL for vectors |
| Vendor lock-in | ⚠️ bounded (sqld fallback) | ⚠️ bounded | ✅ MIT, self-host |

The two "official" zero-knowledge options each have a fatal flaw at **this** scale: **Turso BYOK** is true zero-knowledge but **$417/mo (Pro)** — it violates cost #2 until the project is funded; **Jazz** is the batteries-included privacy story on paper but is **alpha (violates #1)** and its 2026 rewrite **moved from E2E-by-default to a trusted server with opt-in encrypted fields**, so it no longer clearly out-privacies option (b) either. **Evolu** is the only product that is *E2E-by-default on SQLite*, but it's the least proven (fails #1 as a default pick).

### Verdict

**No single product cleanly beats Turso under the new weights — but plain trusted-cloud Turso (a) is no longer the right call.** The recommendation **flips, but stays on Turso:**

- **Recommend (b): Turso embedded replicas + client-side (application-level) encryption.** It is the only option that satisfies all three priorities at tester scale: keeps the **GA, zero-rewrite, "just works" Turso path (#1)**, stays **$0–5/mo (#2)**, and makes the cloud hold **ciphertext, not plaintext (#3)** — decryption happens only on-device against the local replica, and vectors never leave the device. Use Turso's built-in `encryptionKey` for the **local replica file**, and add **app-level field encryption** for the **synced primary** so the cloud can't read content. This is strictly better on privacy than (a) for ~the same reliability/cost, and it does **not** require Turso BYOK.
- **Escalate to Turso BYOK (Pro, $417/mo)** only when funded — it removes the DIY-crypto burden and gives server-managed zero-knowledge on the identical code path (config change, not a re-platform).
- **Spike Jazz (or Evolu)** *only if privacy must be E2E-by-default/provable AND the team will accept alpha-grade maturity + a data-model rewrite* — i.e. if privacy outranks reliability in practice, not just on paper. Jazz wins the **RN-later** axis decisively and is MIT/self-hostable; Evolu is the truer E2E-SQLite match. Neither is a "just works" #1 pick today.

**Closest challengers and why they lose:**
1. **Jazz** — loses on **#1 (alpha)** and a **weakened, now-opt-in E2E** story; wins only if you prioritize by-default E2E + RN DX over maturity.
2. **Turso BYOK** — loses on **#2 (Pro $417/mo)**; it's the same great engine, just cost-gated until scale.
3. **PowerSync** — the most *mature* local-SQLite sync after Turso, but **structurally trusted-cloud (Postgres backend reads plaintext)** → no privacy edge to justify two engines.

**Caveats that would change the answer:**
- If **server-side queryability of content** is ever needed (server search/analytics over rows), app-level encryption (b) breaks and you'd accept trusted-cloud (a) or go Postgres.
- If the team is **uncomfortable owning field-crypto + key recovery** (lose-key-lose-data), prefer **BYOK when funded** over rolling it yourself.
- If **metadata leakage** (row counts, timestamps, sha256 ids, sizes to the cloud) is itself unacceptable, only a **CRDT blob mesh (Jazz/Automerge+relay)** hides it — accept the alpha/rewrite cost.
- If **privacy becomes the explicit product driver** (not just elevated), reopen ADR 0001's E2E track toward **Jazz/Automerge** as originally lent — the premise-flip the ADR already documents.

## Scaling thresholds & monitoring KPIs (2026-06)

The DB-per-user model and embedded-replica sync have specific pressure points.
These are the metrics to watch, the thresholds to act on, and the next move at each.

### 1. Turso database count (the #1 scaling gate)

| Stage | DB count | Action |
|---|---|---|
| **Free** | 0–80 | No action |
| **⚠️ Warning** | 80–95 | Upgrade to Developer ($4.99/mo — unlimited DBs) |
| **🔴 Hard cap** | 100 | Free tier silently rejects new DB provisioning → users can't sign in |

**Monitor:** Turso Platform API `GET /v1/organizations/{org}/databases` → count. Alert at 80.

### 2. Sync latency (embedded replica round-trip)

| Metric | Target | Warning | Action |
|---|---|---|---|
| `client.sync()` wall time (p50) | < 500 ms | > 2 s | Check DB size, network, Turso region match |
| `client.sync()` wall time (p99) | < 3 s | > 10 s | Consider per-table sync scoping or pruning old items |
| Time-to-first-sync on new device | < 10 s | > 30 s | DB too large → introduce item archival / prune policy |

**Instrument:** log `[sync] synced in Xms` in `worker/index.ts` sync loop (already has try/catch). Expose `lastSyncDurationMs` in `SyncStatus`.

### 3. DB size per user (affects sync time + Turso storage cost)

| DB size | Notes |
|---|---|
| < 10 MB | Healthy — text + todos only, no large blobs |
| 10–50 MB | Monitor — likely has many captures; check if `items.text` is storing extracted PDF/audio text verbatim |
| > 50 MB | Investigate — consider pruning extracted text > N chars, or moving large text to a separate non-synced store |

> Vectors (`chunks` table) stay in the **local-only `neeme-vec.db`** and never sync — this is the key reason DB size stays manageable.

**Monitor:** `SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()` on the synced DB.

### 4. Token broker (when wired)

| Metric | Target | Action |
|---|---|---|
| Token mint latency | < 200 ms (cached hit), < 1 s (Turso Platform API) | Cache tokens in `safeStorage`; set `expiresAt - 5min` refresh |
| Token mint error rate | < 0.1% | Alert + fallback to offline mode |
| Broker cold start (Vercel) | < 500 ms | Acceptable; token is cached so this is rare |

### 5. Encryption correctness (field-level AES-256-GCM)

| Signal | What it means |
|---|---|
| `decrypt()` returns raw `enc:…` string | Wrong or missing `NEEME_SYNC_ENCRYPTION_KEY` on this device |
| Items visible on device B but showing raw ciphertext in UI | Key not propagated — check `NEEME_SYNC_ENCRYPTION_KEY` is set identically on both devices |
| `[sync] error` with libSQL auth error | `NEEME_SYNC_AUTH_TOKEN` expired — re-run `turso db tokens create` |

### 6. When to re-evaluate the stack

| Signal | Consider |
|---|---|
| > 1,000 users | Evaluate Turso Pro for BYOK (zero-knowledge without DIY crypto) |
| Sync conflicts appearing in todos | Implement last-write-wins merge log or move todos to a CRDT structure |
| DB size > 50 MB / user | Item archival policy + separate large-text store |
| Privacy must be provable (product decision) | Spike Jazz or Evolu; reopen ADR 0001 E2E track |
| Turso cost > $50/mo | Self-host `sqld` on Fly.io — identical `@libsql/client` code path |
