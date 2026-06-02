# @nimi/mobile — agent guide

React Native / Expo companion app. Read the **root `CLAUDE.md`** first.

## Pattern

Scaffolded after [t3-turbo](https://github.com/t3-oss/t3-turbo): Expo managed workflow,
expo-router (file-based), `@nimi/contract` as the shared API/types layer.

## Key files

```
apps/mobile/
  app/
    _layout.tsx         ← root layout: initApiClient() + restoreToken() + Stack
    (auth)/login.tsx    ← Logto PKCE via system browser (expo-web-browser)
    (tabs)/_layout.tsx  ← tab bar
    (tabs)/feed.tsx     ← recent captures from neeme FastAPI
    (tabs)/capture.tsx  ← quick text note → POST /notes
  src/utils/
    api.ts              ← initApiClient(): configures @nimi/contract/api with Expo env
    auth.ts             ← SecureStore token persistence + token-store hydration
  metro.config.js       ← getDefaultConfig + unstable_enablePackageExports + FileStore
  tsconfig.json         ← extends expo/tsconfig.base + @nimi/contract/* path alias
```

## Data path

Mobile has no local libSQL worker. All data flows through the neeme FastAPI
(`@nimi/contract/api`). Multi-user/sync requires ROADMAP #10 to be deployed.

## Env vars

| Var | Purpose |
|-----|---------|
| `EXPO_PUBLIC_NEEME_API_URL` | neeme FastAPI base URL (defaults to LAN dev machine) |
| `EXPO_PUBLIC_LOGTO_ENDPOINT` | Logto tenant URL |
| `EXPO_PUBLIC_LOGTO_APP_ID` | Logto Native app client ID |

## Dev

```bash
pnpm --filter @nimi/mobile dev   # expo start (Expo Go or dev client)
pnpm --filter @nimi/mobile ios   # expo start --ios
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
