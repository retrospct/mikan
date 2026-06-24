# @nimi/mobile — agent guide

React Native / Expo companion app. Read the **root `CLAUDE.md`** first.
Architecture decision: **[ADR 0009](../../docs/adr/0009-mobile-rn-turso-cloud-pipeline.md)** —
mobile is offline-first via Turso embedded-replica, not a thin FastAPI HTTP client.

## Pattern

Scaffolded after [t3-turbo](https://github.com/t3-oss/t3-turbo): Expo managed workflow,
expo-router (file-based), `@nimi/contract` as the shared types layer.

## Key files

```
apps/mobile/
  app/
    _layout.tsx         ← root layout: initApiClient() + restoreToken() + broker→openDb()
    (auth)/login.tsx    ← Logto PKCE via system browser (expo-web-browser)
    (tabs)/_layout.tsx  ← tab bar
    (tabs)/feed.tsx     ← recent captures from local Turso replica (pull-to-refresh syncs)
    (tabs)/capture.tsx  ← quick text note → local DB → db.sync()
  src/
    db/
      schema.ts         ← CREATE TABLE SQL mirroring desktop items/todos/chunks tables
      client.ts         ← openDb() via @tursodatabase/sync-react-native
      index.ts          ← getDb() singleton accessor
    utils/
      api.ts            ← initApiClient(): configures @nimi/contract/api (FastAPI client, optional)
      auth.ts           ← SecureStore token persistence + token-store hydration
  metro.config.js       ← getDefaultConfig + unstable_enablePackageExports + FileStore
  tsconfig.json         ← extends expo/tsconfig.base + @nimi/contract/* path alias
```

## Data path

**Primary:** `@tursodatabase/sync-react-native` embedded-replica (offline-first).
`_layout.tsx` exchanges the Logto access token with the token broker → gets `syncUrl` +
`authToken` → opens the local replica. Reads are instant (local); writes call `db.sync()` to
push to cloud. The desktop picks them up on its next sync.

**Schema:** `src/db/schema.ts` mirrors the desktop `items`/`todos`/`chunks` tables.
No projection layer needed — same shape on both ends.

**Note:** `@nimi/contract/api` (FastAPI HTTP client) is still wired but unused for the primary
data flow. It remains available for future server-side search features. See ADR 0009.

## Env vars

| Var | Purpose |
|-----|---------|
| `EXPO_PUBLIC_BROKER_URL` | Token broker base URL (defaults to `https://token-broker.vercel.app`) |
| `EXPO_PUBLIC_NEEME_API_URL` | neeme FastAPI base URL (optional; LAN dev fallback) |
| `EXPO_PUBLIC_LOGTO_ENDPOINT` | Logto tenant URL |
| `EXPO_PUBLIC_LOGTO_APP_ID` | Logto Native app client ID |

## Dev

```bash
# Needs a dev client — NOT expo start / Expo Go (native module required)
npx expo run:ios   # builds dev client + opens on simulator/device
```

## Metro + pnpm gotcha

Expo SDK 52+ `getDefaultConfig` auto-detects the workspace root.
`unstable_enablePackageExports: true` is required for `@nimi/contract`'s subpath
exports (`./views`, `./api`, `./ipc`, etc.) — t3-turbo doesn't need this because
`@acme/api` uses a single `.` export.

## import.meta.env fix

`packages/contract/src/api/runtime.ts` no longer reads `import.meta.env` directly.
Desktop calls `configureClient({ baseUrl: import.meta.env.VITE_NEEME_API_URL })` in
`renderer/src/main.tsx`; mobile calls `initApiClient()` (which reads `EXPO_PUBLIC_*`)
in `app/_layout.tsx`. This is the t3-turbo app-layer config injection pattern.

## Phase 1 gaps (not yet implemented)

- Real Logto auth: `login.tsx` is a PKCE stub; needs `EXPO_PUBLIC_LOGTO_*` env + registered app
- Background sync: no push / periodic pull; user must pull-to-refresh
- At-rest encryption: broker doesn't return `encryptionKey` yet; `openDb` accepts it but won't receive it
- Schema drift guard: `src/db/schema.ts` is hand-maintained — see ADR 0009 for the plan to share it
- Mastra/Inngest cloud pipeline: capture → `memory/ingest` event not fired yet from mobile
