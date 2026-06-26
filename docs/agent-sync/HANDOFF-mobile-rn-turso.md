# Handoff — Mobile RN + Turso + cloud AI pipeline (Phase 0 VALIDATED → Phase 1)

**Branch:** `claude/desktop-beta-react-native-strategy-vg5qb9`
**Last session:** ran the Phase 0 validation gate end-to-end on a real Mac + iOS simulator.
**Status:** **V1–V6 PASS and committed.** The mobile app builds, launches, logs in via Logto,
and reads/writes its per-user Turso DB. V7 (cross-device) is **plumbing-proven but blocked on
mobile E2E parity**; V8 (offline persistence) **not yet run**.

> Previous handoff said Phase 0 was "code-complete, validations not run." Reality: the spikes
> had enough version/wiring drift that the workspace wouldn't even install. All of that is now
> fixed — the strategy held up; it was spike-era debt, not a design problem.

---

## What we did this session (6 commits)

| Commit | What |
|---|---|
| `70aeba5` | mobile: migrate Turso data layer to the **real** `@tursodatabase/sync-react-native@0.6.1` API (spike used a never-shipped API: `open/executeMultiple/execute().rows/sync` → `connect/exec/all/run/push/pull`, rows are column-keyed objects) |
| `0194865` | mastra: migrate to `@mastra/core@1.46` + `ai@6` + `inngest@4`; wire Vercel AI Gateway (`src/model.ts`) |
| `b36714e` | mastra: make it actually runnable — add `mastra` CLI + `tsx`, move entry to `src/mastra/index.ts`, fix pipeline model id + credential selection, add `scripts/inngest-dev-server.ts` |
| `3c95de2` | mobile iOS: `expo install --fix` (RN 0.86→0.85.3, expo-dev-client 5→56.0.20), Metro `.js`→extensionless imports, expo-router index-redirect, `mikan` scheme |
| `d84242d` | mobile: real Logto login → broker → Turso; resource indicator (RFC 8707); `src/db/bootstrap.ts`; auth gate in `app/index.tsx`; hide `_spike-db` tab |
| `aeb61b4` | mobile: split multi-statement schema `exec`; only clear token on broker 401 |

`pnpm typecheck` is green across all 5 packages.

---

## Validation results

| # | Gate | Result | Evidence |
|---|---|---|---|
| V1 | typecheck contract/desktop/brand/token-broker | ✅ | `pnpm typecheck` (5/5) |
| V2 | typecheck `@mikan/mobile` + `@mikan/mastra` | ✅ | both green after migrations |
| V3 | Mastra agent (playground :4111) | ✅ | `searchMemories` + `addTodo` fired via gateway (Sonnet 4.6); no invented memories |
| V4 | Inngest pipeline (:8288) | ✅ | `memory/ingest` run **Completed**; non-empty brief from Haiku 4.5 |
| V5 | iOS dev client builds + launches | ✅ | Turso native module compiles/links; app renders the Mikan login screen, no red screen |
| V6 | Logto login → broker → Turso → feed | ✅ | logged in as `juslee.ru@gmail.com`; feed rendered a real Turso item ("Dsdssffddsaf") |
| V7 | cross-device (phone ↔ desktop) | ⚠️ **blocked** | same broker DB confirmed, but **E2E mismatch** — see below |
| V8 | kill-and-reopen persistence (offline) | ⛔ **not run** | quick test: force-quit, reopen with Wi-Fi off, feed should still show items from the local replica |

### The V7 finding (important)

Desktop and mobile **do** share the same per-user Turso DB — the broker mints `neeme-<sha256(sub)>`,
and for this account that's **`neeme-440bae393e230a62`** (group `nimi-primary`). So the transport is right.

**But the content encryption differs:**
- **Desktop** content-encrypts fields (`apps/desktop/src/main/db/crypto.ts` → `enc:<iv>:<tag>:<ct>`, AES-256-GCM) and **refuses to sync without** a `NEEME_SYNC_ENCRYPTION_KEY` (`db/sync-config.ts`).
- **Mobile** reads/writes **plaintext** — it has no key (the broker returns only `{syncUrl, authToken}`; `openDb` accepts `encryptionKey` but never receives one).

So if you enable desktop **Cloud sync** today: desktop notes show as `enc:…` gibberish on the phone; mobile's plaintext notes sync to desktop (desktop's `decrypt()` passes non-`enc:` through) but sit unencrypted in the cloud. No corruption, but incoherent cross-device. **Decision: leave desktop Cloud sync OFF until mobile reaches E2E parity** (Phase 1 below). The desktop's *"Have a recovery key from another device?"* prompt is the intended key-sharing mechanism.

---

## Environment / config that's now wired (this account)

- **Logto:** custom domain `auth.getmikan.com`; Native app id `nzldfj1wbm48hhhb121mq`; redirect URIs `mikan://callback` (+ `nimi://`); **API resource `https://api.getmikan.com`** (must exist — desktop uses it too).
- **Broker:** `https://sync.getmikan.com` — `/health` returns `{ok:true}` (all env set: `LOGTO_ISSUER`/`AUDIENCE`/`JWKS_URL` on the `auth.getmikan.com` domain + Turso creds). Endpoint is `POST /token`.
- **Mobile `.env`:** `EXPO_PUBLIC_LOGTO_ENDPOINT`, `_APP_ID`, `_BROKER_URL`, **`EXPO_PUBLIC_LOGTO_RESOURCE=https://api.getmikan.com`** (added this session), legacy `_NEEME_API_URL` (unused since ADR 0009).
- **Bundle id:** `cool.jlee.nimi` (use this when registering the App Store / EAS bundle identifier).
- **Mastra `.env.local`:** `AI_GATEWAY_API_KEY` (Vercel gateway, `vck_…`) + `ANTHROPIC_API_KEY`. Models: agent `anthropic/claude-sonnet-4.6` (via gateway), pipeline `claude-haiku-4-5-20251001` (Inngest `@inngest/ai` adapter → Anthropic-native, not the gateway). Inngest keys can stay blank for local dev (`INNGEST_DEV=1`).

---

## Local dev runbook (so tomorrow-you isn't rediscovering this)

**Toolchain prereqs (one-time, were broken/missing this session):**
- `brew reinstall cocoapods` — the vendored `ffi` broke after a Homebrew Ruby bump.
- iOS **26.5 simulator runtime** installed (Xcode 26.5 shipped only the SDK). Xcode won't build against the old 26.1 sims.
- **`watchman` is not installed** → Metro doesn't see file changes. After editing mobile files, restart Metro with `--clear` (`npx expo start --dev-client --clear`), or the bundle is stale.

**Mobile:**
```bash
cd apps/mobile
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo run:ios   # build + launch (pod install needs UTF-8 LANG)
# Then reloads: npx expo start --dev-client --clear ; relaunch via the dev-client URL.
```
**Mastra (V3/V4):**
```bash
cd services/mastra
set -a; . ./.env.local; set +a
pnpm dev                    # agent playground :4111
INNGEST_DEV=1 pnpm inngest:endpoint   # local /api/inngest on :3939 (new this session)
INNGEST_DEV=1 pnpm inngest:dev        # Inngest dev server :8288 → POST event to :8288/e/dev
```

> ⚠️ Background dev servers (Metro, mastra dev, inngest) may still be running from the last session.
> `lsof -ti:8081,4111,8288,3939 | xargs kill` to reset.

---

## Phase 1 — what's next for mobile (in rough priority)

1. **Mobile E2E parity (unblocks V7).** Port `apps/desktop/src/main/db/crypto.ts` (the `enc:` codec) to mobile, and share `NEEME_SYNC_ENCRYPTION_KEY` via the desktop's recovery-key flow. Encrypt/decrypt the `text` (content) fields on mobile read/write. Until then, keep desktop Cloud sync OFF.
2. **Fire `memory/ingest` from mobile capture** (`app/(tabs)/capture.tsx`) after `db.push()` — needs `services/mastra` deployed.
3. **Real libSQL queries in mastra tools** (`search-memories`, `add-todo`) — replace mocks; add per-user DB routing (agent calls the broker server-side).
4. **`embed` step** in `ingest-pipeline.ts` (chunks → `chunks` table).
5. **Deploy `services/mastra`** to Vercel (set `AI_GATEWAY_API_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`); verify the gateway model slugs + the Inngest adapter baseURL (`TODO(verify)` in `model.ts` / `ingest-pipeline.ts`).
6. **Run V8** (offline kill-and-reopen) — quick.
7. **Tech debt:** extract shared `packages/schema` (desktop `db/schema.ts` vs mobile `src/db/schema.ts` drift); add `services/mastra` to CI typecheck; tab-bar icons are `▼` placeholders (no `tabBarIcon`).

---

## Next CYCLE (per product owner): desktop UI

After this mobile cycle, the focus shifts to **fleshing out the desktop (Electron renderer) UI**, with agent help. Suggested approach:
1. **`superpowers:brainstorming`** first — pin down what "fleshed out" means (which screens, flows, gaps) before building.
2. **`frontend-design`** — for building distinctive, production-grade React components/pages (avoids generic AI aesthetics). Best fit for net-new UI in `apps/desktop/src/renderer`.
3. **`ui-ux-pro-max`** — for design-system thinking, review/critique, and systematic polish across the existing renderer.
   (`design:design-critique` / `design:design-system` are also available for review-style passes.)

Desktop UI lives in `apps/desktop/src/renderer/src` (React + Tailwind); it only ever touches
`window.api.*` (see `docs/SECURITY.md`). Read `apps/desktop/CLAUDE.md` first.

## Key file map (mobile)
```
apps/mobile/
  app/index.tsx               ← auth gate: restore token → bootstrap → feed | login (clears token on 401)
  app/_layout.tsx             ← thin <Stack> mount
  app/(auth)/login.tsx        ← Logto PKCE + resource indicator (real, working)
  app/(tabs)/{feed,capture}.tsx ← Turso read (all/pull) / write (run/push)
  src/db/{client,schema,bootstrap,index}.ts ← connect/exec/pull, broker→openDb bootstrap
services/mastra/
  src/model.ts                ← AI Gateway model resolution
  src/agents/mikan-agent.ts · src/tools/*  ← agent + (mock) tools
  src/inngest/functions/ingest-pipeline.ts · scripts/inngest-dev-server.ts
docs/adr/0008 (broker) · 0009 (mobile RN+Turso)
```
