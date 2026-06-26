---
todos:
  - id: scaffold
    status: done
    content: 'Scaffold apps/mobile as an Expo (managed, TypeScript) app; register it in pnpm-workspace.yaml (apps/* already globs it) and add the @mikan/contract workspace dep + base scripts to apps/mobile/package.json — named @mikan/mobile, following the @acme/expo convention in t3-turbo'
  - id: turbo-wire
    status: done
    content: 'Wire apps/mobile into turbo.json tasks (typecheck, lint, plus a non-cached persistent start/dev task); add EXPO_PUBLIC_* to globalEnv; add Metro cache output (node_modules/.cache/metro) to the build task outputs so Turborepo can cache and restore the Metro bundle cache — following t3-turbo''s turbo.json task structure'
  - id: metro-contract
    status: done
    content: 'Add apps/mobile/metro.config.js starting from getDefaultConfig(__dirname) — Expo SDK 52+ auto-detects the pnpm workspace root and sets watchFolders/nodeModulesPaths; add unstable_enablePackageExports: true explicitly (needed for @mikan/contract''s subpath exports map) and a FileStore cache at node_modules/.cache/metro (t3-turbo pattern). Verify a value import from @mikan/contract/api bundles cleanly.'
  - id: tsconfig-wire
    status: done
    content: 'Add apps/mobile/tsconfig.json extending expo/tsconfig.base (or a shared tooling/typescript base when that lands) with jsx: react-native, moduleSuffixes: [".native", ""], paths: { "@mikan/contract/*": ["../../packages/contract/src/*"] }, and allowImportingTsExtensions — following t3-turbo''s apps/expo/tsconfig.json pattern'
  - id: runtime-config
    status: done
    content: 'Resolve the import.meta.env coupling in packages/contract/src/api/runtime.ts by following t3-turbo''s app-layer config injection pattern: strip env var reads from runtime.ts, export a configureClient(opts) factory, and have apps/mobile/src/utils/api.ts call it with process.env.EXPO_PUBLIC_NEEME_API_URL (+ getBaseUrl() fallback for Expo Go LAN dev); apps/desktop continues to call it with import.meta.env.VITE_NEEME_API_URL'
  - id: data-seam
    status: done
    content: 'Data seam changed from FastAPI HTTP client to Turso embedded-replica (ADR 0009). apps/mobile/src/db/ opens a per-user embedded replica via the existing token broker (ADR 0008). feed.tsx reads from local DB; capture.tsx inserts locally then calls db.sync(). No FastAPI dependency, no projection layer needed — same items/todos schema as desktop.'
  - id: auth
    status: in_progress
    content: 'SecureStore token persistence (src/utils/auth.ts) and broker integration done. login.tsx is a PKCE stub — needs real EXPO_PUBLIC_LOGTO_* env, a registered Logto Native app, and the nimi:// redirect scheme in app.json.'
  - id: screens
    status: done
    content: 'Auth gate, Feed (Turso local read + pull-to-refresh sync), and Capture (local insert + sync) screens implemented with expo-router. Spike DB tab removed from the tab bar; spike file kept at app/(tabs)/_spike-db.tsx for manual testing.'
  - id: verify-docs
    status: in_progress
    content: 'CLAUDE.md updated. Needs: npx expo run:ios smoke test on a real device with broker + Logto env configured, pnpm typecheck green. (human) mark ROADMAP #14 as the mobile scaffold landed on this branch.'
  - id: phase1-pipeline
    status: pending
    content: 'Phase 1 (not yet started): fire memory/ingest Inngest event from capture.tsx; wire real libSQL queries in Mastra tools; per-user DB routing in Mastra route handler; add embed step to Inngest pipeline; deploy services/mastra to Vercel. See ADR 0009 Phase 1 checklist.'
name: mobile RN + Expo companion
overview: 'Mobile scaffold (Phase 0 complete) takes the Turso embedded-replica path chosen in ADR 0009, not the original FastAPI HTTP client plan. apps/mobile uses @tursodatabase/sync-react-native: the root layout exchanges the Logto access token with the existing token broker (ADR 0008) to get syncUrl + authToken, then opens a per-user local replica. feed.tsx reads from the local DB (offline-capable); capture.tsx inserts locally then calls db.sync() to push to the cloud. The desktop picks up mobile captures on its next sync. AI pipeline for mobile captures is Inngest (services/mastra) with step.ai.infer() — validated in Phase 0 spikes. Conversational AI is Mastra (claude-sonnet-4-6, two stub tools). The FastAPI HTTP client path in @mikan/contract/api is still wired but not used as the primary data path. Phase 1 wires the Inngest event, real Mastra tools, and Logto auth.'
isProject: false
---
# Mobile RN + Expo companion — ROADMAP #14

> **Scaffold modelled after [t3-turbo](https://github.com/t3-oss/create-t3-turbo)** — the
> Turborepo + pnpm + Expo SDK 54 + expo-router reference monorepo. Key patterns imported: app-layer
> config injection (no env vars in shared packages), `getDefaultConfig` auto-monorepo detection,
> Metro cache in Turborepo outputs, and a `tooling/typescript` tsconfig sharing model.

Stand up the **mobile surface**: a new `apps/mobile` Expo (managed workflow, TypeScript)
app inside the already-monorepo'd repo, sharing `@mikan/contract` with `apps/desktop`. Scope is
**"start the surface"** — a companion, not a full port: auth + Feed read + capture-a-note. This
item is **gated by [ADR 0006](../adr/0006-repo-structure.md)** (monorepo NOW; mobile lives at
`apps/mobile`), which is ✅ done — the structure exists, this slots into it.

## Current state / monorepo fit

The repo is a pnpm-workspace + turborepo monorepo:

- [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) globs `apps/*` + `packages/*`, so a new
  `apps/mobile` is picked up automatically once it has a `package.json`.
- [`turbo.json`](../../turbo.json) defines `build` / `typecheck` / `test` / `dev` and runs in
  **strict env mode** with `globalEnv: ["NEEME_*", "VITE_*"]`. Mobile reads config via Expo's
  `EXPO_PUBLIC_*` convention, so that prefix must be added, alongside the existing `NEEME_*`.
- [`package.json`](../../package.json) (root) fans scripts out with `turbo run …`; pnpm `10.26.0`,
  TypeScript `^6`.

`@mikan/contract` is the seam to reuse. Its [`package.json`](../../packages/contract/package.json)
exports map is consumed **from `.ts` source** (no build step — the apps bundle the TypeScript
directly). This is identical to t3-turbo's `@acme/api` pattern, where
`"default": "./src/index.ts"` in the exports map lets both Metro and Vite consume TS source
without a compile step.

| Contract entry | Reuse on mobile? | Why |
| --- | --- | --- |
| `@mikan/contract/views` ([views.ts](../../packages/contract/src/views.ts)) | ✅ yes | Pure view-model types (`Memory`, `Task`, `FedItem`, `MatchHit`) — no Node/Electron imports. |
| `@mikan/contract/api` ([api/index.ts](../../packages/contract/src/api/index.ts)) | ✅ yes (the point) | Plain-`fetch` hey-api client to the neeme FastAPI — the **only** data path mobile has. |
| `@mikan/contract/api/token-store` ([token-store.ts](../../packages/contract/src/api/token-store.ts)) | ✅ yes | In-memory bearer holder, explicitly written "works unchanged in React Native / Expo". |
| `@mikan/contract/api/runtime` ([api/runtime.ts](../../packages/contract/src/api/runtime.ts)) | ⚠️ needs refactor | Reads `import.meta.env.VITE_NEEME_API_URL` — **Vite-only** (see fix below). |
| `@mikan/contract/ipc` ([ipc.ts](../../packages/contract/src/ipc.ts)) | ❌ no runtime meaning | `window.api.*` is the Electron preload/IPC surface; RN has no preload. (Types could be imported, but the transport doesn't exist.) |

The desktop UI surfaces mobile would mirror live in
[`apps/desktop/src/renderer/src/mikan/`](../../apps/desktop/src/renderer/src/mikan/) — `MikanApp.tsx`
(shell/nav), `feed.tsx` (the recent-capture stream + quick capture), `today.tsx` (daily todos),
`add.tsx` (capture sheet). The desktop seam pattern ([`api.ts`](../../apps/desktop/src/renderer/src/mikan/api.ts):
`window.api` in Electron, mock in browser) is a good template for an analogous mobile `data` seam
— except mobile's "real" backend is HTTP, not IPC.

## Scaffolding steps (t3-turbo conventions)

The scaffold follows the conventions of t3-turbo's `apps/expo` app (Expo SDK 54, pnpm monorepo,
turborepo). Key differences from a from-scratch approach are called out in each step.

1. **Create the app.** `apps/mobile` via `create-expo-app` (managed, TS template). Give it
   `apps/mobile/package.json` (`name: "@mikan/mobile"`, `"@mikan/contract": "workspace:*"` in
   `devDependencies` — t3-turbo puts `@acme/api` in devDependencies since it's type-only/source;
   runtime deps like `expo`, `expo-router`, `react`, `react-native` go in `dependencies`). Scripts:
   `start` / `ios` / `android` / `typecheck` / `lint` / `clean`. No edit to
   [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) needed (the `apps/*` glob covers it);
   `pnpm install` once to link the workspace symlink.

2. **Turbo wiring.** In [`turbo.json`](../../turbo.json), follow t3-turbo's task structure:
   - `typecheck` and `lint` — add `apps/mobile` participation naturally (no per-app config needed;
     turbo discovers tasks from each package's `package.json` scripts).
   - `dev` / `start` — mobile's Metro server is non-cached and persistent. t3-turbo marks `dev` as
     `cache: false, persistent: false` (not `persistent: true`) — Turbo 2 manages persistence at
     the runner level, not per-task. Keep nimi's existing `persistent: true` on `dev` or split a
     `start` task; either is fine, but align with whatever the desktop uses.
   - **Metro cache output.** Add `"node_modules/.cache/metro"` to the `build` task outputs so
     Turborepo can cache and restore the Metro bundle cache across runs — t3-turbo's `metro.config.js`
     explicitly places the cache there via `FileStore`.
   - **`EXPO_PUBLIC_*` in `globalEnv`.** Extend `globalEnv` to include `"EXPO_PUBLIC_*"` so the
     API base URL and any other Expo public vars reach Metro under strict env mode. t3-turbo
     uses named vars in `globalEnv`; for nimi's wildcard pattern, `"EXPO_PUBLIC_*"` is sufficient.

3. **`tsconfig`.** `apps/mobile/tsconfig.json` should follow t3-turbo's `apps/expo/tsconfig.json`
   pattern:
   ```jsonc
   // apps/mobile/tsconfig.json
   {
     "extends": "expo/tsconfig.base",          // or "@mikan/tsconfig/base.json" when tooling/ lands
     "compilerOptions": {
       "jsx": "react-native",
       "checkJs": false,
       "moduleSuffixes": [".ios", ".android", ".native", ""],  // platform-specific file resolution
       "paths": {
         "@mikan/contract/*": ["../../packages/contract/src/*"],
         "~/*": ["./src/*"]                    // app-local alias, matches t3-turbo's ~ convention
       }
     },
     "include": ["src", "*.ts", "*.js", ".expo/types/**/*.ts", "expo-env.d.ts"]
   }
   ```
   Note `moduleSuffixes` — t3-turbo includes this for platform-specific file resolution (`.ios.ts`,
   `.android.ts`, `.native.ts` files in shared packages are picked up correctly). This is absent
   from the current plan and worth adding.

   **t3-turbo divergence — `tooling/typescript`.** t3-turbo has a dedicated `tooling/typescript`
   package (`@acme/tsconfig`) with `base.json` containing strict shared compiler options (`ES2022`,
   `moduleResolution: Bundler`, `noUncheckedIndexedAccess`, etc.). Mikan doesn't have this yet —
   configs are per-app. Not blocking for the mobile scaffold, but flagged as a future improvement
   (a `tooling/tsconfig` package would let both `apps/desktop` and `apps/mobile` share strictness
   settings without duplication).

## The Metro + contract-reuse gotcha (revised for Expo SDK 54)

**Key update vs the original plan:** As of Expo SDK 52+, `getDefaultConfig` from `expo/metro-config`
**auto-detects the monorepo root** by walking up from `__dirname` until it finds `pnpm-workspace.yaml`
(or `package.json` with `workspaces`). It then automatically configures:
- `watchFolders` to include the repo root (so Metro watches `packages/contract` changes)
- `resolver.nodeModulesPaths` to include both the app's and the root's `node_modules`
- Basic symlink awareness

This means t3-turbo's `metro.config.js` is minimal — just `getDefaultConfig(__dirname)` + a
`FileStore` for the Turborepo cache + `withNativeWind`. **Manual `watchFolders` and
`nodeModulesPaths` wiring from the old pattern is no longer needed.**

However, `@mikan/contract`'s subpath exports (`./views`, `./api`, `./api/token-store`, etc.) require
one addition that t3-turbo does NOT need (because their `@acme/api` has only a single `.` entry):

```js
// apps/mobile/metro.config.js — nimi's version (after t3-turbo pattern)
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { FileStore } = require("metro-cache");

const config = getDefaultConfig(__dirname);

// Store Metro cache where Turborepo can find it (t3-turbo pattern)
config.cacheStores = [
  new FileStore({
    root: path.join(__dirname, "node_modules", ".cache", "metro"),
  }),
];

// Needed for @mikan/contract's subpath exports map (./views, ./api, ./api/token-store, etc.)
// t3-turbo doesn't need this because @acme/api only has a single "." export entry.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
```

**Verification:** a trivial `import type { Memory } from '@mikan/contract/views'` **and** a value
import `import { getRecent } from '@mikan/contract/api'` both bundle and run in Expo Go / a dev
client. The `FileStore` location should also appear in turbo's cache output after a `turbo build`.

**Remaining caution:** `@mikan/contract` is `"type": "module"` (ESM). Metro's ESM support has
historically been opt-in. With Expo SDK 54 this is generally resolved, but if Metro's transformer
rejects bare `.ts` source from the workspace package, the fallback is to add a `babel.config.js`
that explicitly transpiles the `packages/contract` source — verify this in an actual Expo Go run.

## The `import.meta.env` fix — t3-turbo app-layer config injection pattern

The current plan lists two options (A: refactor `runtime.ts`; B: mobile-owned client config).
**The t3-turbo pattern is unambiguously Option A**, and specifies how to do it.

In t3-turbo, the shared `@acme/api` package contains **zero URL or auth configuration**. The tRPC
client is constructed entirely in the app layer: `apps/expo/src/utils/api.tsx` creates the client
with `getBaseUrl()` from `apps/expo/src/utils/base-url.ts`, which reads `expo-constants` in the
Expo app and a `NEXT_PUBLIC_*` var in the Next.js app. The shared package just exports types and
the router definition.

**The concrete fix for `packages/contract/src/api/runtime.ts`:**

Currently `runtime.ts` reads `import.meta.env.VITE_NEEME_API_URL` and calls `setConfig` on
the generated hey-api client. Strip this out and export a factory each app calls on startup:

```typescript
// packages/contract/src/api/runtime.ts — AFTER (t3-turbo app-layer injection pattern)
import { createClient, createConfig } from "@hey-api/client-fetch";
import { getToken } from "./token-store.ts";

export type ClientConfig = {
  baseUrl: string;
  getToken?: () => string | undefined;
};

/**
 * Call once at app startup with platform-specific config.
 * Each app owns its env-var read — this module reads nothing from the environment.
 */
export function configureClient({ baseUrl, getToken: tokenFn }: ClientConfig) {
  const client = createClient(
    createConfig({
      baseUrl,
      auth: () => (tokenFn ?? getToken)(),
    }),
  );
  return client;
}
```

Then each app wires it up at startup:

```typescript
// apps/desktop/src/renderer/src/main.tsx (existing init, updated)
import { configureClient } from "@mikan/contract/api/runtime";
configureClient({ baseUrl: import.meta.env.VITE_NEEME_API_URL });

// apps/mobile/src/utils/api.ts (new, follows t3-turbo base-url pattern)
import Constants from "expo-constants";
import { configureClient } from "@mikan/contract/api/runtime";
import { getToken } from "@mikan/contract/api/token-store";

function getBaseUrl(): string {
  // In Expo Go / dev client: use the LAN IP from the Expo debugger host
  const debuggerHost = Constants.expoConfig?.hostUri;
  const localhost = debuggerHost?.split(":")[0];
  if (localhost) return `http://${localhost}:8000`;
  // In production / EAS builds: use the explicit env var
  const envUrl = process.env.EXPO_PUBLIC_NEEME_API_URL;
  if (envUrl) return envUrl;
  throw new Error("Set EXPO_PUBLIC_NEEME_API_URL for production builds.");
}

export const nimiClient = configureClient({ baseUrl: getBaseUrl(), getToken });
```

`token-store.ts` needs **no** change (pure module). The `configureClient` approach ensures the
shared package has zero bundler-global dependencies — no `import.meta.env`, no `process.env`,
no `Constants`. This is the direct analog of t3-turbo's `getBaseUrl()` / `api.tsx` split.

**`import.meta.env` side-effect on `@mikan/contract`'s tsconfig:** `packages/contract/tsconfig.json`
currently pulls `"types": ["vite/client"]` to get `import.meta.env` typing. Once `runtime.ts`
no longer uses it, remove that types entry so the contract package has zero Vite coupling.

## `packages/ui` split — t3-turbo pattern, not yet applicable

t3-turbo has a `packages/ui` with shared React + RN components (shadcn-ui for web, NativeWind
for native). For nimi this is **premature**: desktop is Electron/web (React + Tailwind) and mobile
is React Native — the component model is incompatible without significant cross-platform shim work.

Flag for the future: if nimi ever needs a shared design-token layer or a primitive that works across
both surfaces (colors, spacing, typography constants), that lives in a `packages/ui` with
platform-specific sub-entries (`.native.ts` suffixes). Until then, keep desktop and mobile UI
code in their respective `apps/`.

## t3-turbo divergences worth calling out explicitly

| Area | t3-turbo | nimi / notes |
| --- | --- | --- |
| **Shared API package exports** | Single `.` entry, one file | `@mikan/contract` has 5 subpath exports — needs `unstable_enablePackageExports: true` in metro.config.js |
| **API transport** | tRPC v11 (procedure calls, type-safe server + client) | plain-fetch hey-api generated client (OpenAPI-based); analogy holds for the "shared typed API layer" role |
| **Web app** | Next.js (NEXT_PUBLIC_* env) | Electron + Vite (VITE_* env) — different env-var prefixes, same injection point principle |
| **Auth** | better-auth with `@better-auth/expo` | Logto PKCE with `@logto/rn` — same system-browser PKCE pattern |
| **Styling** | NativeWind v5 (Tailwind for RN) | TBD for mobile; desktop uses Tailwind v4; NativeWind is the t3-turbo recommendation for parity |
| **Shared tsconfig package** | `tooling/typescript/@acme/tsconfig` | Not yet in nimi; `apps/mobile/tsconfig.json` extends `expo/tsconfig.base` directly |
| **`globalPassThroughEnv`** | NODE_ENV, CI, VERCEL, npm_lifecycle_event | Not in nimi's turbo.json — add `NODE_ENV` and `CI` as passthrough |
| **`topo` task** | Used for dependency-order builds | Not in nimi; typecheck/lint use `^build` dep, which is equivalent for the current graph |

## Data approach — and the explicit remote-surface dependency

Mobile has **no Electron worker, no libSQL utilityProcess, no on-device pipeline**. The entire
`window.api.*` path (capture → content-hash store → extract → embed → vector search, all
in-process) **does not exist on RN**. So the companion's only data path is the **neeme FastAPI
HTTP client** in `@mikan/contract/api` (`getRecent`, `search`, `addNote`, `getToday`, `addTodo`, …).

**This makes #14 depend on a reachable remote surface — call it out loudly:**

- Today the neeme **FastAPI is a sibling repo on `:8000`** (per `AGENTS.md`) and is **not deployed**;
  desktop doesn't even use it (desktop's real data is the local worker). For mobile it's the *only*
  backend.
- Per [ADR 0002](../adr/0002-authentication.md), the FastAPI currently has **no auth and no
  `user_id` scoping** — data is global. Real multi-device, multi-user mobile needs the
  **`user_id` migration + JWKS-verify** that lands with accounts/sync.
- **➡ Hard dependency on ROADMAP #10 (Sync / cloud offload (Turso), multi-user).** Mobile is a
  *thin client of whatever #10 exposes.* Two ways to sequence:
  - **Depend on #10:** wait for the hosted sync/API surface (correct end state).
  - **Bridge on the existing FastAPI:** point mobile at a locally-run / dev-deployed neeme FastAPI
    to build the screens now, accepting global/unauthed data until #10 lands. Good for unblocking
    the scaffold + UI, not shippable to real users.

**Shape impedance to plan for:** the FastAPI returns its own response models
(`ItemSummary`, `SearchHitView`, `RecentResponse` — see
[api/index.ts](../../packages/contract/src/api/index.ts)), which are **not** the renderer
view-models (`Memory`, `FedItem`, `Task` in [views.ts](../../packages/contract/src/views.ts)). On
desktop the **main-process projection layer** (`apps/desktop/src/main/services/project.ts`) bridges
that gap; mobile has no such layer. So plan a **small mobile-side projection** (FastAPI shapes →
view-models) so screens can render the same `views.ts` types. (Open question: should that projector
be promoted into `@mikan/contract` so both clients share it once the API is the source of truth?)

## Auth approach (reuse #9 identity)

Auth #9 (Logto **Native** + PKCE, id_token JWKS-verified) is ✅ done for desktop. Mobile reuses the
**same Logto identity**, via Logto's RN/Expo SDK (PKCE in the system browser):

- Use `@logto/rn` (with `expo-web-browser` / `expo-auth-session` + `expo-secure-store` peer deps).
  System-browser PKCE — never an embedded webview (RFC 8252), matching ADR 0002's stance.
- On login, push the access token into the shared
  [`@mikan/contract/api/token-store`](../../packages/contract/src/api/token-store.ts) via
  `setToken(...)`; the hey-api client reads it lazily per request (`auth: () => getToken()`), so a
  late login takes effect with no client re-init — exactly the desktop pattern in
  [`useAuth.ts`](../../apps/desktop/src/renderer/src/hooks/useAuth.ts) (which itself calls
  `setToken`/`clearToken`), minus the IPC bridge.
- **Redirect scheme:** desktop registered a custom scheme (`neeme://`) + loopback. Mobile needs its
  **own redirect URI** (a `nimi://` app scheme, configured in `apps/mobile/app.json` `scheme` and
  registered as a redirect in the Logto app). Decide whether to reuse the existing Logto Native app
  or register a separate mobile app/redirect.

Until Logto env is configured, mobile (like desktop) stays unauthenticated — but note the FastAPI
itself is unauthed today, so login is only *meaningful* once #10 adds backend verification.

## First-cut screens (companion scope, not parity)

Minimal, matching "**start** an RN + Expo app". Navigation via **expo-router** (file-based, Expo
default, and t3-turbo's chosen nav solution) — the navigation lib decision is now made, no longer
open:

1. **Auth gate** — a Logto login screen / signed-out state; signed-in unlocks the tabs. (No-op /
   "configure auth" state when Logto env is unset, mirroring desktop's graceful degradation.)
2. **Feed (read)** — list recent captures via `getRecent` → projected to `FedItem[]`; the read-only
   analog of desktop [`feed.tsx`](../../apps/desktop/src/renderer/src/mikan/feed.tsx). `pending` vs
   `done` status surfaced the same way.
3. **Capture-a-note** — a text field → `addNote` (`POST /notes`); the smallest write that proves the
   round-trip (capture on phone, see it in the feed). File/photo/voice capture is **explicitly out
   of first-cut scope** (no native capture pipeline yet).

Today/todos, task detail, plan ritual, search overlay, OCR/ASR capture — all **deferred** beyond the
start deliverable.

## Decisions / open questions for a human

- **Expo managed vs bare / dev-client.** Managed + Expo Go is fastest to start, but Logto's native
  auth + custom URL scheme typically need a **dev client** (config plugins). t3-turbo uses
  `expo-dev-client` by default. Likely: managed workflow **with a dev client** (config plugins),
  not bare. Confirm.
- **EAS Build.** Adopt EAS for dev-client + later store builds, or stay local for now? (Ties into
  #12/#13's signing/distribution story for the desktop side.)
- **Shared-package strategy.** Keep consuming `@mikan/contract` as **TS source via Metro** (chosen
  default, matches desktop and t3-turbo's `@acme/api` pattern), or add a build step / publish?
  The `import.meta.env` fix (configureClient factory) removes the last blocker to source-only
  consumption — this should now be the clear winner.
- **#10 sync vs existing FastAPI.** Build against the **existing local FastAPI** to unblock now, or
  **block on #10** for a real hosted/authed surface? (Recommend: scaffold + screens against local
  FastAPI behind an env-pointed base URL; gate "real users" on #10.)
- **NativeWind for styling?** t3-turbo uses NativeWind v5 (Tailwind for RN). Desktop uses Tailwind
  v4. NativeWind provides parity but adds Metro transform complexity — decide before building screens.
- **`tooling/typescript` package.** Extract a shared tsconfig base (like t3-turbo's `@acme/tsconfig`)
  to share strictness settings between `apps/desktop` and `apps/mobile`? Not blocking for the
  scaffold, but cleaner long-term.
- **Navigation lib.** Decided: **expo-router** (file-based, Expo default, t3-turbo's choice).
- **Logto app/redirect.** Reuse the existing Native app's config, or register a separate mobile
  client + `nimi://` redirect?

## Risks / notes

- **`unstable_enablePackageExports`** is the one metro.config.js addition nimi needs beyond
  t3-turbo's minimal config — without it, `@mikan/contract`'s subpath imports (`/views`, `/api`,
  `/api/token-store`) fail to resolve. Budget a verification step for this.
- **`import.meta.env` will break the shared client under Metro** — must be resolved (via the
  `configureClient` factory above) before any API call works on mobile (it's not theoretical).
- **No backend to talk to by default** — without a running/deployed neeme FastAPI (or #10), the app
  has nothing to render; this is a sequencing dependency, not a code bug.
- **Shape impedance** (FastAPI response models ≠ `views.ts`) needs a projector; don't assume the
  desktop view-models come back from HTTP.
- **`@mikan/contract` is `"type": "module"` (ESM).** Metro's ESM handling has improved significantly
  in Expo SDK 54, but if the transformer rejects bare `.ts` ESM source from the workspace package,
  add a `babel.config.js` override that explicitly transpiles the `packages/contract` directory.
- Keep **per-app agent context hygiene** (ADR 0006): `apps/mobile` gets its own `CLAUDE.md` /
  `AGENTS.md`; the root spine stays shared, so a mobile task isn't polluted by desktop/Electron
  context.

## Verify

- `pnpm install` links `@mikan/mobile` + the `@mikan/contract` workspace symlink with no errors.
- `pnpm -w typecheck` (turbo) green including `apps/mobile`; `pnpm -w lint` green.
- `pnpm --filter @mikan/mobile start` (or `turbo run start`) boots Metro; the app loads in Expo Go /
  a dev client with **both** a type-only and a value import from `@mikan/contract` resolving (proves
  the Metro/exports/symlink + `configureClient` fixes).
- The Metro cache lands at `apps/mobile/node_modules/.cache/metro` after the first build
  (confirms the `FileStore` is wired and Turborepo will pick it up on the next run).
- Against a locally-running neeme FastAPI (`EXPO_PUBLIC_NEEME_API_URL` set): the **Feed** lists
  recent items and **capture-a-note** posts a note that appears on next feed load.
- With Logto env set: login completes in the system browser, the token lands in `token-store`, and
  an authenticated request carries the bearer.
- Add `apps/mobile/README.md` (run/env notes) + per-app `CLAUDE.md`/`AGENTS.md`; a human marks
  ROADMAP #14 in-progress (not edited by this plan).
