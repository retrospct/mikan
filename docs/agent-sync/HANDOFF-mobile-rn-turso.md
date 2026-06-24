# Handoff — Mobile RN + Turso + cloud AI pipeline (Phase 0 → Phase 1)

**Branch:** `claude/desktop-beta-react-native-strategy-vg5qb9`
**Last commit:** `b6dd920` — everything committed & pushed; working tree clean.
**Status:** Phase 0 (de-risking spikes) **code-complete**. Validations **NOT run** (no device/runtime
access in the cloud env). Phase 1 (real wiring) **not started**.

> **Why this exists:** the cloud environment can't run an iOS dev client, a Mastra playground, or an
> Inngest dev server, so none of the validation steps could be executed here. This doc lets another
> agent (or a human on a local Mac) pick up exactly where we stopped.

---

## TL;DR of the strategy (read ADR 0009 for the full rationale)

Mobile is **sync-first**, not on-device-first:
- **Data:** `@tursodatabase/sync-react-native` embedded replica per user. Reads are local/offline;
  writes call `db.sync()`. Same Turso DB the desktop uses (via the existing token broker, ADR 0008).
- **AI pipeline:** Inngest durable serverless (`services/mastra`) — `step.ai.infer()` so we don't pay
  for idle LLM time. Fired by a `memory/ingest` event.
- **Agent ("ask Nimi"):** Mastra agent (`claude-sonnet-4-6`) deployed on Vercel.
- Desktop stays **on-device-first** (ADR 0003 unchanged). On-device ONNX on RN was rejected (not
  production-ready) — see ADR 0009 options table.

The original "thin FastAPI HTTP client" plan was **abandoned** (online-only, no user scoping, no
offline). Production screens now use Turso.

---

## What's DONE (committed on this branch)

### Phase 0 spikes (commit `197e700`)
- `apps/mobile/src/db/{schema,client,index}.ts` — embedded-replica open + `getDb()` singleton.
- `apps/mobile/app/(tabs)/_spike-db.tsx` — manual spike screen (write → sync → verify). Kept on
  disk for manual testing but **removed from the tab bar**.
- `services/mastra/src/agents/nimi-agent.ts` — Nimi agent, 2 **stub** tools.
- `services/mastra/src/tools/{search-memories,add-todo}.ts` — return **mock data** (TODO: real libSQL).
- `services/mastra/src/inngest/functions/ingest-pipeline.ts` — 3 steps (extract → chunk →
  `step.ai.infer` brief). extract is **passthrough**, no embed step yet.

### Reconciliation + docs (commit `b6dd920`)
- `apps/mobile/app/(tabs)/feed.tsx` — now reads from local Turso via `getDb()`; pull-to-refresh
  calls `db.sync()`. FastAPI import removed.
- `apps/mobile/app/(tabs)/capture.tsx` — inserts into local DB then `db.sync()`. FastAPI removed.
- `apps/mobile/app/_layout.tsx` — broker fetch cleaned up (throws on non-ok; degrades to "Log in").
- `apps/mobile/app/(tabs)/_layout.tsx` — `_spike-db` tab removed.
- `apps/mobile/CLAUDE.md` — rewritten to describe the Turso data path + Phase 1 gaps.
- `docs/adr/0009-mobile-rn-turso-cloud-pipeline.md` — **the decision of record** (NEW).
- `docs/plans/mobile-rn-expo.plan.md` — todos marked done/in_progress; overview updated.

---

## What's LEFT

### A. Validations (do these FIRST — they gate everything; need a Mac + iOS device)

These could NOT be run in the cloud env. Full step detail is below in "How to run".

| # | Validation | Env needed | Pass criteria |
|---|---|---|---|
| V1 | `pnpm typecheck` (contract + desktop) | any | zero errors |
| V2 | `tsc --noEmit` for `@nimi/mobile` AND `services/mastra` | any (after `pnpm install`) | zero errors. **Highest-risk spot:** `result.rows.map(parseRow)` in `feed.tsx` — verify the Turso `rows` type matches `unknown[]` |
| V3 | Mastra agent smoke test (`pnpm dev`, playground :4111) | `ANTHROPIC_API_KEY` | both tools fire; agent doesn't invent memories |
| V4 | Inngest pipeline (`pnpm inngest:dev`, dash :8288) | same | 3 steps run; brief non-empty; `generate-brief` pauses; retry is per-step |
| V5 | `npx expo run:ios` builds dev client | **Mac + Xcode** | app launches, no red screen. **This is the make-or-break unknown** for `@tursodatabase/sync-react-native` on iOS |
| V6 | Turso offline round-trip on device | device + broker + Logto env | capture → save → appears in feed; airplane-mode write syncs on reconnect |
| V7 | **Cross-device:** phone capture appears in desktop feed | device + `pnpm dev` desktop | proves same Turso DB both ends |
| V8 | Kill-and-reopen persistence (offline) | device | replica survives restart |

### B. Phase 1 build work (not started)

| Item | File(s) | Notes |
|---|---|---|
| Real Logto auth | `apps/mobile/app/(auth)/login.tsx` | PKCE stub → `@logto/rn` SDK; register Native app + `nimi://` redirect in `app.json` |
| Fire `memory/ingest` | `apps/mobile/app/(tabs)/capture.tsx` | one call after `db.sync()`; needs Inngest deployed first |
| Real libSQL queries | `services/mastra/src/tools/{search-memories,add-todo}.ts` | replace mocks: cosine search + todos insert |
| Per-user DB routing | `services/mastra` route handler | agent must call broker server-side to get the caller's Turso DB |
| `embed` step | `services/mastra/src/inngest/functions/ingest-pipeline.ts` | step 4: embed chunks → `chunks` table |
| Deploy `services/mastra` | Vercel | set `ANTHROPIC_API_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` |

### C. Tech debt (before merge to main)

| Item | Risk if skipped |
|---|---|
| Extract shared `packages/schema` (raw SQL) | desktop `apps/desktop/src/main/db/schema.ts` and `apps/mobile/src/db/schema.ts` drift silently |
| Add `services/mastra` to turbo `typecheck` | it's excluded from CI now — regressions undetected |
| At-rest encryption: broker returns `encryptionKey` → pass to `openDb` | data unencrypted on device (`openDb` already accepts the field) |
| Background sync (expo-background-fetch / push) | mobile only syncs on explicit user action |

---

## How to run each validation (copy-paste)

```bash
# V1 — workspace typecheck (mobile is excluded by the default filter)
pnpm typecheck

# V2 — typecheck the excluded packages explicitly
pnpm --filter @nimi/mobile exec tsc --noEmit
cd services/mastra && pnpm typecheck && cd -

# V3 — Mastra agent playground
cd services/mastra
cp .env.example .env.local          # set ANTHROPIC_API_KEY
pnpm install && pnpm dev            # http://localhost:4111
#   In playground → nimi agent:
#   "What did I note about the project last week?"  → search-memories fires (mock ok)
#   "Add a task to follow up tomorrow"              → add-todo fires with title+day

# V4 — Inngest (second terminal, pnpm dev still running)
pnpm inngest:dev                    # http://localhost:8288
#   Send Event: name "memory/ingest"
#   data: { "text": "Meeting with Sarah: agreed Q3 priorities", "itemId": "t1", "contentType": "text" }
#   Verify: extract-text → chunk-text → generate-brief; brief non-empty; generate-brief pauses
#   Retry test: send with "text": "" and confirm earlier steps don't re-run

# V5–V8 — mobile (Mac + iOS device/simulator)
cd apps/mobile
cp .env.example .env.local
#   set EXPO_PUBLIC_BROKER_URL, EXPO_PUBLIC_LOGTO_ENDPOINT, EXPO_PUBLIC_LOGTO_APP_ID
#   (Logto dashboard: a Native app with nimi:// redirect URI must exist)
npx expo run:ios                    # MUST be dev client — NOT `expo start`/Expo Go
#   V6: log in → Capture "test note" → Save → pull-to-refresh Feed → appears
#   V6: airplane mode → capture → save still ok → reconnect → pull-to-refresh → syncs
#   V7: desktop `pnpm dev` (or NEEME_EMBEDDER=hash pnpm dev) → phone capture appears in feed
#   V8: force-quit app, reopen offline → feed still shows items
```

---

## Key file map

```
apps/mobile/
  app/_layout.tsx              ← startup: initApiClient + restoreToken + broker→openDb
  app/(auth)/login.tsx         ← Logto PKCE STUB (Phase 1: real auth)
  app/(tabs)/feed.tsx          ← reads local Turso, sync on refresh  [DONE]
  app/(tabs)/capture.tsx       ← local insert + db.sync()            [DONE]
  app/(tabs)/_spike-db.tsx     ← manual spike screen (off tab bar)
  src/db/{schema,client,index}.ts ← embedded replica + getDb()
services/mastra/
  src/agents/nimi-agent.ts     ← agent (real instructions, stub tools)
  src/tools/*.ts               ← MOCK — Phase 1 wires real libSQL
  src/inngest/functions/ingest-pipeline.ts ← extract(passthrough)→chunk→brief
docs/adr/0009-*.md             ← the decision of record (read this)
docs/plans/mobile-rn-expo.plan.md ← todo checklist (updated)
services/token-broker/         ← already mints per-user {syncUrl, authToken} (ADR 0008) — reused as-is
```

## Open decisions for a human
- EAS Build vs local-only for the dev client + store builds?
- Reuse the existing Logto Native app or register a separate mobile client?
- Promote the (now unused) FastAPI projector into `@nimi/contract`, or delete it from the mobile path?

## Environment note
No rogue process was running at handoff (`ps` showed only the Claude runner + watchdog). Nothing
was left listening. The container is ephemeral and reclaimed on archive — this branch on the remote
holds all state.
