# Auth gate + sync activation

How the desktop app gates on login and how a user turns on cross-device sync.
This is the client-side half of **ADR 0008** (the token broker + per-user Turso
DB) and **ROADMAP #10** (cloud offload). Read those first for the server side.

- **Auth:** `apps/desktop/src/main/auth/logto.ts`, `renderer/src/hooks/useAuth.ts`,
  `renderer/src/nimi/auth-gate.tsx`
- **Sync:** `apps/desktop/src/main/sync/{broker,sync-prefs,sync-control}.ts`,
  `main/db/{sync-config,crypto}.ts`, `renderer/src/hooks/useSync.ts`,
  `renderer/src/nimi/settings.tsx`
- **Worker lifecycle:** `apps/desktop/src/main/worker/client.ts`
- **Contract:** `packages/contract/src/ipc.ts` (`AuthState`, `SyncStatus`, `SyncSettings`)

---

## 1. The login gate

When Logto is configured, the **entire app sits behind a full-screen sign-in
screen**. This is a deliberate product choice ("force a login gate") that
coexists with Nimi's local-first design — see the offline rules below so it never
becomes a lock-out.

### Behavior matrix

| Logto configured? | Auth state | What renders |
|---|---|---|
| No (`MAIN_VITE_LOGTO_*` unset — dev/CI/preview) | n/a | **App** (gate never mounts) |
| Yes | hydrating (first tick) | Neutral splash (`AuthSplash`) |
| Yes | signed out | **Login gate** (`AuthGate`) |
| Yes | signed in (incl. **offline** w/ cached session) | **App** |

The gate decision lives at the top of `NimiApp`'s render:

```ts
const gated = auth.configured && (!authReady || !auth.isAuthenticated)
```

- `auth.configured` comes from main (`isConfigured()` = `MAIN_VITE_LOGTO_ENDPOINT`
  + `_APP_ID` present). Unconfigured builds are **never** gated, so the browser
  preview, the Playwright E2E, and the `NEEME_EMBEDDER=hash` smoke tests all run
  unauthenticated exactly as before.
- `authReady` is a new flag on `useAuth`. `useAuth` starts at `EMPTY`
  (`configured:false`), then main reports the real state asynchronously. Without
  `ready`, a configured build would render the app for one frame and then snap to
  the gate. `ready` flips true after the first `getState()` resolves; until then
  we show a neutral splash. Outside Electron it's `true` immediately.

### Offline tolerance (the important rule)

A hard gate is dangerous for a local-first app: if a returning user is **offline
at launch** and we sign them out because a token refresh failed, we've locked
them out of their own on-device notes. `logto.ts` now distinguishes failure
modes (`isAuthRejection`):

- **Auth rejection (HTTP 400/401, e.g. `invalid_grant`)** → drop the session
  (a real sign-out).
- **Network / timeout / 5xx** → **keep** the cached session. The user stays
  signed in; they just have no fresh access token until they're back online (so
  sync simply waits). This applies in both `init()` (boot) and `getAccessToken()`.

The refresh token + display claims are sealed in the OS keychain via
`safeStorage`; only the short-lived access token is ever handed to the renderer.

---

## 2. Sign out

Moved out of the header into **Settings → Account** (`settings.tsx`
`AccountSection`). The old header lock chip (`auth.tsx` `AuthControl`) is deleted:
login is the gate, identity + sign out belong in Settings. The header is now just
sync status (`SyncControl`) + plan/search/settings buttons.

---

## 3. Sync activation

Sync was previously **dormant in every shipped build** — purely env-gated
(`NEEME_SYNC=on` + a valid key), with no UI to turn it on. Now there's a real path
in **Settings → Sync**.

### Two sources of truth (don't conflate them)

| Type | Owner | Meaning | IPC |
|---|---|---|---|
| `SyncSettings` | **main** | The toggle *intent* + key presence + broker availability | `sync:get-settings`, `sync:set-enabled` |
| `SyncStatus` | **worker** | The *live* replica state (syncing / synced / error) | `sync:get-status`, `sync:now` |

The Settings UI binds the toggle to `SyncSettings.enabled` (intent) and the status
line to `SyncStatus` (reality). They can legitimately disagree — e.g. intent ON
but replica "Connecting…" while offline.

`SyncSettings`:
- `enabled` — persisted pref (`neeme-sync-prefs.json`), the toggle position.
- `hasKey` — whether this device has an at-rest encryption key yet (drives the
  "reveal recovery key" affordance).
- `available` — `isBrokerConfigured()`; false in builds without
  `NEEME_SYNC_BROKER_URL`, where the toggle is shown disabled.

### How the toggle works (the env→restart dance)

The worker reads `getSyncConfig()` (the `NEEME_SYNC*` env) **once at module load**,
so the only way to apply a change at runtime is to **re-fork the worker**:

1. `sync:set-enabled` → `sync-control.setSyncEnabled(enabled)` (main).
2. Persist the pref; on enable, set `process.env.NEEME_SYNC=on`, ensure the key is
   in env, and fetch a broker token → set `NEEME_SYNC_URL` + `NEEME_SYNC_AUTH_TOKEN`.
   On disable, delete `NEEME_SYNC` + url + token (but **keep** the key — see below).
3. `worker/client.restartWorker()` kills the old worker, waits for a clean exit,
   then forks a fresh one that inherits the updated `process.env`.
4. Return fresh `SyncSettings`; the renderer re-renders.

At boot, `sync-control.prepareSyncEnv()` does the same resolution before the first
fork, honoring an explicit shell `NEEME_SYNC=on` (dev/tests/runbook) without
downgrading it.

### Encryption key + recovery key (ADR 0008)

- On first enable, a 64-hex AES-256-GCM key is generated (`randomBytes(32)`) and
  sealed in the OS keychain (`safeStorage`) at `neeme-sync-key.bin`
  (`sync-prefs.getOrCreateKey`).
- **Reveal recovery key** (Settings) shows the hex + copy button so you can move
  it to another device.
- **Import recovery key** (Settings) accepts a 64-hex key from another device,
  stores it, and restarts the worker (`importRecoveryKey`).
- Encryption-at-rest is **sticky**: once a device has a key it's always injected
  into the worker, even when sync is OFF. See the footgun below for why.

---

## 4. Caveats, limitations & footguns

> These are the things to be careful about and the obvious next improvements.

### 4.1 Sticky encryption key (intentional, but know why)
When you turn sync **off**, we keep the encryption key in the worker env and do
**not** delete it. Reason: with the key gone, `crypto.decrypt()` becomes a
pass-through and every previously-encrypted local row (`enc:…`) would render as
garbled ciphertext. So "off" stops the *network replica* only; local rows stay
encrypted-and-readable. A device that has **never** enabled sync has no key and
stays plaintext-local (unchanged default, and what all the unit tests rely on).
- **To improve:** offer an explicit "remove sync from this device" that first
  decrypts rows back to plaintext (or wipes the local replica) before dropping
  the key, so the at-rest format can actually be reverted.

### 4.2 Importing a recovery key replaces the device key — destructively
`setRecoveryKey` overwrites this device's key. If the device already has rows
encrypted under a *different* key, those rows will no longer decrypt. The intended
flow is **fresh device → import key → then enable sync**. The UI warns about this,
but nothing enforces "device is fresh."
- **To improve:** detect existing encrypted rows and block/confirm import; or
  re-encrypt existing rows under the imported key.

### 4.3 Mid-session toggle doesn't refresh already-rendered data
Enabling sync restarts the worker, but the renderer keeps its already-loaded data
in React state. The local DB file is the same (data is safe), but rows pulled from
the remote on first connect won't appear until the next navigation/reload or a
manual "sync now."
- **To improve:** have main broadcast a "worker restarted / sync changed" event
  and have the renderer refetch the active view.

### 4.4 No push event for sync status — the renderer polls
`useSync` polls `sync:get-status` every 5s (paused when hidden). Right after a
toggle the status line can lag by up to a poll interval.
- **To improve:** a `sync:changed` main→renderer push (like `auth:changed`).

### 4.5 Worker restart races (handled, but fragile)
`restartWorker()` waits for the old process's `exit` before forking so the
module-level `child`/`ready` aren't clobbered by a late exit event. In-flight
`call()` promises are rejected during the gap; the renderer's pollers swallow
those. Rapid double-toggles are prevented by disabling the toggle while `busy`.
- **To watch:** any new caller that holds a long-lived `call()` across a restart
  will see a rejection — treat worker calls as retryable.

### 4.6 Offline / not-logged-in enable backs off silently
If you flip sync on while offline or before a broker token can be fetched, the
pref stays ON but we don't set `NEEME_SYNC` for that session (so the worker
doesn't surface a confusing "NEEME_SYNC_URL is not set" error). The status reads
"Connecting…". It activates on the next online boot or toggle.
- **To improve:** a clearer "waiting for connection" state distinct from a real
  config error, and an auto-retry once a token becomes available.

### 4.7 Gate assumes the cached-session check is cheap and correct
The gate trusts `getState().isAuthenticated`, which is `Boolean(session)`. After
the offline-tolerance change, a session with an expired access token but a live
refresh token still counts as authenticated (correct). But a *revoked* refresh
token is only discovered on the next refresh attempt — until then the user sees
the app, and the first server call fails. Acceptable (local-first), but note that
the gate is not a real-time authorization check.

### 4.8 Single-device key custody
The key lives only in the device keychain. If a user loses the device without
having exported the recovery key, their synced ciphertext is unrecoverable (by
design — "trusted cloud with encrypted content", not key escrow). The reveal/
export flow is the only backup.
- **To improve:** prompt the user to save the recovery key at first enable, not
  just expose it passively in Settings.

---

## 5. What's verified vs. not

- **Verified here:** `pnpm --filter @nimi/desktop typecheck`, `lint` (clean on all
  touched files), `test` (266 pass), and a full `build`.
- **Not verified here (needs a GUI + creds):** the live sign-in → toggle → broker
  → Turso round-trip, and the two-device recovery-key flow. Run on a packaged
  build with Logto + broker env set. The sync-encryption runbook
  (`docs/testing/sync-encryption-runbook.md`) covers the underlying replica loop;
  the new toggle just drives the same env it expects.
