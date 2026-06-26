# ADR 0007 — Connectors / ingest (email + calendar)

**Status:** Accepted — implemented (ROADMAP #8)
**Date:** 2026-06-01
**Context owners:** back lane (`apps/desktop/src/main/**`)
**Related:** [ADR 0002 auth](0002-authentication.md) · [ADR 0003 pipeline](0003-all-typescript-on-device-pipeline.md) · [ADR 0004 drafting](0004-ai-drafting-model.md) · [setup guide](../google-connectors-setup.md)

## Problem

Mikan captures context manually (typed notes, drag-dropped files). "Automatic capture" means pulling existing email + calendar data into the on-device pipeline without asking the user to re-paste it. We need an OAuth grant to read Gmail + Google Calendar, a sync engine that fetches deltas, and idempotent ingest into the existing capture pipeline.

## Options considered

| # | Option | OAuth approach | Token owner | Runtime deps | Verdict |
|---|--------|---------------|-------------|--------------|---------|
| A | **Standalone Google client (chosen)** | PKCE + loopback in main | main (`safeStorage`) | none | ✅ |
| B | Logto social connector | Logto brokers Google token | Logto Management API | Logto configured + signed in | ⚠️ |
| C | Google SDK (`googleapis` npm) | PKCE or service account | varies | large package | ⚠️ |

### Notes

**A — Standalone (chosen):** Plain `fetch` against Google REST APIs; PKCE helpers reused from
`auth/oidc.ts` (PR #35). Decoupled from Logto — works whether or not app-login (#9) is configured.
Follows the "inert until configured" pattern of `NEEME_ANTHROPIC_KEY` / `MAIN_VITE_LOGTO_*`.
Google **Desktop app** OAuth client type allows loopback redirect to any port, so no registered
redirect URI is needed. `access_type=offline` + `prompt=consent` in the authorize URL reliably
yields a refresh token.

**B — Logto-brokered:** Logto's social connector is oriented toward identity federation (sign-in),
not durable data-API access. Getting a long-lived Google access token out of Logto requires the
Management API (`/api/users/{id}/identities/google/access-token`), M2M credentials, and couples
connectors to the user being signed in to Logto. Rejected: unnecessary coupling, more complexity.

**C — Google SDK:** `googleapis` npm brings a large dependency tree and gRPC transports. The REST
APIs are simple enough (a few `fetch` calls); no SDK needed.

## Decision

**Option A.** A new `apps/desktop/src/main/connectors/google-auth.ts` mirrors `auth/logto.ts`:
- PKCE (S256) using `oidc.ts` helpers; `shell.openExternal` to Google; ephemeral loopback `http.createServer` catches the `?code`.
- Refresh token sealed in `safeStorage` (`neeme-connectors.bin`).
- `isConfigured()` gates everything on `MAIN_VITE_GOOGLE_CLIENT_ID`.
- Tokens never reach the renderer (only connect/disconnect/state cross the IPC boundary).

The worker (`connector-service.ts`) runs all network I/O and DB writes: Gmail delta via
`historyId`, Calendar delta via `syncToken` (410 → full re-list). Each message/event is
normalised to plain text and fed to `pipelineService.captureExternal()`, which deduplicates by
`external_id` (skip for email; upsert for calendar events which mutate).

A `setInterval` in main (every `NEEME_CONNECTOR_SYNC_MINUTES`, default 15) plus sync-on-connect
drive background polling. No new runtime dependencies added.

## Consequences

**Easier:**
- Connectors work without Logto configured (local-first, BYO-key pattern).
- The existing capture pipeline (chunk → embed → vector search) handles connector content automatically.
- `memoryKindOf` emits `email` / `calendar` UI kinds using the new `connector` column — existing `MemoryKind` union and icons already covered.

**Harder:**
- Each user must create a Google Cloud Desktop app OAuth client and add test users (unverified app limit: 100).
- Refresh-token rotation: Google may not return a new `refresh_token` on every refresh; the stored one is reused until revoked.
- Calendar `syncToken` expiry (410) triggers a full re-list; large calendars are slow on recovery.

## Env knobs

| Variable | Kind | Effect |
|----------|------|--------|
| `MAIN_VITE_GOOGLE_CLIENT_ID` | `import.meta.env` (baked) | Required — Desktop app OAuth client id |
| `MAIN_VITE_GOOGLE_CLIENT_SECRET` | `import.meta.env` (baked) | Required — Desktop app OAuth client secret (non-confidential) |
| `MAIN_VITE_GOOGLE_SCOPES` | `import.meta.env` (baked) | Optional scope override (space-separated) |
| `NEEME_CONNECTORS=off` | `process.env` (runtime) | Force-disable all connectors |
| `NEEME_CONNECTOR_SYNC_MINUTES` | `process.env` (runtime) | Polling interval in minutes (default: 15) |

## Open questions

- **Webhook push vs polling:** Gmail supports push notifications via Cloud Pub/Sub; Calendar via
  watch channels. V1 uses polling (simpler, no infra). V2 can add push to reduce latency.
- **Attachment capture:** Email attachments (PDFs, images) could be routed through `captureFile`.
  Not in scope for v1 (text body only).
- **Multi-account:** V1 assumes one Google account per device. A future account-picker UI would
  store separate `neeme-connectors-{sub}.bin` files.

## Action items

- [x] `apps/desktop/src/main/connectors/google-auth.ts` — OAuth flow
- [x] `apps/desktop/src/main/services/connector-service.ts` — Gmail + Calendar sync engine
- [x] `apps/desktop/src/main/db/schema.ts` — `connector`, `external_id`, `uri` on `items`; `connector_state` table
- [x] `apps/desktop/src/main/db/index.ts` — `CREATE TABLE IF NOT EXISTS connector_state` + guarded `ALTER TABLE`
- [x] `apps/desktop/src/main/services/pipeline-service.ts` — `captureExternal`, cursor helpers
- [x] `apps/desktop/src/main/services/project.ts` — `memoryKindOf` connector branch
- [x] `apps/desktop/src/main/index.ts` — IPC handlers + scheduler
- [x] `apps/desktop/src/main/worker/index.ts` — `connectorsIngest` + `connectorsGetStats` handlers
- [x] `packages/contract/src/ipc.ts` — `ConnectorsApi`, `ConnectorId`, `ConnectorsState`, IPC channels
- [x] `apps/desktop/src/preload/index.ts` — bridge
- [x] `apps/desktop/src/renderer/src/nimi/connectors.tsx` + `useConnectors.ts` — UI
- [x] `docs/google-connectors-setup.md` — setup guide
- [x] `docs/INTEGRATION.md` — updated
- [x] `docs/ROADMAP.md` — #8 marked in-progress
