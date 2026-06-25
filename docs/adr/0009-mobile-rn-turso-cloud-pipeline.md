# ADR 0009 — Mobile strategy: RN + Turso offline-sync + cloud AI pipeline

**Status:** ✅ Accepted — Phase 0 spikes complete; Phase 1 implementation in progress.
**Date:** 2026-06-24
**Context owners:** jlee
**Related:** supersedes the FastAPI-client data path in `docs/plans/mobile-rn-expo.plan.md`;
builds on [[0008-sync-auth-token-broker]] (broker already mints per-user Turso tokens);
introduces cloud-side AI that tensions with [[0003-all-typescript-on-device-pipeline]] (see
"on-device vs cloud" below); mobile scaffold lives under [[0006-repo-structure]] `apps/mobile`.

## Problem

[ADR 0006](0006-repo-structure.md) reserved `apps/mobile` for a React Native companion. With
the mobile slot now scaffolded, we need to commit to three interrelated decisions:

1. **Mobile data layer** — how does the mobile app store and retrieve captures?
2. **Mobile AI pipeline** — who runs embedding / extraction / briefing for mobile captures?
3. **Mobile agent layer** — how does conversational AI ("ask Nimi") work on mobile?

### Why the original plan (thin FastAPI HTTP client) is wrong

The original `mobile-rn-expo.plan.md` planned to drive the mobile UI entirely from the
`@nimi/contract/api` hey-api client pointed at the `neeme` FastAPI. Three facts killed it:

| Constraint | Why it matters |
|---|---|
| FastAPI is local-only, undeployed | The app has nothing to talk to by default |
| No auth / no `user_id` scoping on FastAPI | Every user sees the same global data |
| Online-only → no offline reading | Phone-as-companion is useless without offline access |

The desktop chose Turso embedded-replica sync in ROADMAP #10 specifically to get offline-first
multi-device. Mobile deserves the same guarantee.

### Why on-device AI isn't viable on mobile (tension with ADR 0003)

ADR 0003 chose "all-TypeScript on-device" for the desktop. The desktop runs `transformers.js` +
`onnxruntime-node` in a Node utilityProcess — a native binary, no GPU required. On mobile:

- `onnxruntime-node` is Node-only; there is no React Native equivalent at the 384-dim MiniLM
  scale that is production-ready today.
- Bundling a 23 MB ONNX model into the app binary is possible in theory but blocks on EAS
  build infrastructure and adds significant cold-start latency.
- Apple NeuralEngine / Android NNAPI require separate SDKs; no single cross-platform path is
  stable enough to commit to.

**Resolution:** ADR 0003 ("on-device-first") applies to the **desktop**. Mobile is
**sync-first** — it uses the Turso embedded-replica for local data but offloads AI to the cloud.

## Decision

### 1. Mobile data: Turso embedded-replica (same as desktop)

Use `@tursodatabase/sync-react-native` with the same **database-per-user** model already running
on desktop (ADR 0008). The token broker already mints per-user `{ syncUrl, authToken }` for any
Logto `sub` — mobile calls the same endpoint.

- `_layout.tsx` exchanges the Logto access token → broker → opens the embedded replica.
- Reads are instant (local replica, offline-capable).
- Writes call `db.sync()` immediately after insert to push to the cloud.
- Desktop picks up mobile captures on its next sync cycle.
- **Same `items`/`todos`/`chunks` schema** — no projection layer, no shape impedance.

### 2. Mobile AI pipeline: Inngest durable serverless (`services/mastra`)

Mobile captures fire a `memory/ingest` Inngest event instead of running the pipeline in-process.
The Inngest function runs on Vercel (deployed alongside the token broker):

```
mobile capture → db.sync() → Inngest event → extract → chunk → step.ai.infer(brief) → libSQL insert
```

`step.ai.infer()` offloads the LLM call so the serverless function isn't billed for idle
inference time. Each step (`extract-text`, `chunk-text`, `generate-brief`) retries independently.

**Phase 0 validates:** `step.ai.infer()` with Claude Haiku 4.5 returns a correct brief; steps
retry on transient failure without rerunning earlier steps.

**Phase 1 adds:** fire `memory/ingest` from `capture.tsx` after `db.sync()`; add real OCR/ASR
extraction and `embed` step that writes to the `chunks` table.

### 3. Mobile agent layer: Mastra (`services/mastra`, deployed on Vercel)

A `nimi` Mastra agent wraps Claude Sonnet 4.6 with two tools:
- `search-memories` — cosine-distance query against the user's `chunks` table
- `add-todo` — insert into the `todos` table

The agent runs at `POST /api/mastra` on Vercel. Mobile (and in the future the desktop renderer)
will call it as a regular HTTPS endpoint.

**Phase 0 validates:** tool-calling loop works; agent instructions produce the right behavior.

**Phase 1 wires:** real libSQL queries (replacing stubs); per-user DB routing via the broker
token (the agent must know which user's DB to query — requires a signed request or session token).

## Architecture diagram

```
iOS/Android app (apps/mobile)
  │
  ├─ reads/writes → @tursodatabase/sync-react-native (embedded replica)
  │                          │
  │                     db.sync() ──────────────────────────────── Turso cloud (per-user DB)
  │                                                                       │
  ├─ capture → fire memory/ingest ──► Inngest (services/mastra on Vercel)│
  │                                    extract → chunk → brief → libSQL  │
  │                                                                       │
  └─ ask Nimi → POST /api/mastra ──► Mastra agent (services/mastra)      │
                                      search-memories ──────────────────►│
                                      add-todo ───────────────────────── │
                                                                          ▼
                                              desktop also syncs from same Turso DB
```

## Options considered

| Option | Offline? | Auth/user-scoped? | AI on-device? | Verdict |
|---|---|---|---|---|
| **A. Turso embedded-replica + Inngest/Mastra** *(chosen)* | ✅ | ✅ (broker) | ❌ cloud | ✅ |
| **B. Thin FastAPI HTTP client** (original plan) | ❌ | ❌ (no user scoping) | n/a | ❌ |
| **C. On-device ONNX (transformers.js RN)** | ✅ | n/a | ✅ | ❌ not production-ready |
| **D. Pure cloud DB (no local replica)** | ❌ (online only) | ✅ | ❌ cloud | ❌ |

## Consequences

### Positive
- Mobile reuses the broker, the Turso schema, and `@nimi/contract` view-model types already built for desktop.
- Offline-first: the app reads and writes without a network connection.
- Desktop and mobile stay in sync via the same Turso DB — captures made on either surface appear on the other.
- The Inngest + Mastra services are independently deployable; they don't couple to the Electron binary.

### Negative / trade-offs
- **Schema drift risk:** `apps/mobile/src/db/schema.ts` is hand-maintained SQL that must track the desktop's Drizzle schema. Plan: extract a shared `packages/schema` package (raw SQL CREATE TABLE strings) that both apps import. Not blocking for Phase 1 but must land before the schema diverges.
- **Per-user DB routing in Mastra:** the agent must know which Turso DB to query for the calling user. This requires either a signed JWT in the request or a broker call from the Mastra route handler. Pattern: same broker call that the app makes, but server-side.
- **At-rest encryption deferred:** the broker doesn't yet return an `encryptionKey`; `openDb` accepts the field. Will land when field-encryption (ROADMAP #10 follow-on) is specified.
- **No background sync:** mobile currently syncs only on explicit actions (app open, pull-to-refresh, after capture). Background sync requires a background task (expo-background-fetch or push notification trigger) — Phase 2.
- **`services/mastra` is outside turbo:** it has its own `tsconfig`/`pnpm` but isn't wired into `turbo run typecheck` or CI. Add it to the turbo pipeline before shipping to production.

## Phase 0 spikes (done, on `claude/desktop-beta-react-native-strategy-*`)

| Spike | File | What it validates |
|---|---|---|
| Turso offline sync | `apps/mobile/src/db/`, `app/(tabs)/_spike-db.tsx` | `@tursodatabase/sync-react-native` builds + links on iOS dev client; write → offline → sync round-trip works |
| Mastra agent | `services/mastra/src/agents/nimi-agent.ts`, `src/tools/` | Tool-calling loop; agent instructions produce correct behavior |
| Inngest durable pipeline | `services/mastra/src/inngest/functions/ingest-pipeline.ts` | `step.ai.infer()` pauses between steps; retries are per-step, not whole-function |

## Phase 1 checklist (not yet done)

- [ ] Wire `capture.tsx` to fire `memory/ingest` after `db.sync()`
- [ ] Replace stub tools in `services/mastra/src/tools/` with real libSQL queries
- [ ] Add per-user DB routing to the Mastra route handler (broker call server-side)
- [ ] Add `embed` step to the Inngest pipeline (write to `chunks` table)
- [ ] Wire real Logto auth in `apps/mobile/app/(auth)/login.tsx`
- [ ] Extract `packages/schema` shared SQL to prevent desktop/mobile drift
- [ ] Add `services/mastra` to turbo `typecheck` pipeline
- [ ] Deploy `services/mastra` to Vercel; set `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`
- [ ] At-rest encryption: update broker to return `encryptionKey`; pass to `openDb`
