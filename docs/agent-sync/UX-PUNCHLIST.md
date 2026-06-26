# UX / workflow punch list (front lane)

Front-lane (`apps/desktop/src/renderer`) UX bugs and workflow decisions to debug.
Captured from a live walkthrough — see screenshot below. Newest batch on top;
check items off (`- [x]`) as they land, and keep the code pointers current.

> Lane note: these are all renderer-side. Where a fix needs a contract change
> (e.g. an explicit "add to backlog" mutator), call it out and land the
> `@mikan/contract` half first.

---

## Batch — 2026-06-12 (Prototype data still shipping + state refresh)

> **Theme: the UI is plumbing-complete but not product-complete.** Much of the
> renderer was ported from the design mockup and still runs on prototype
> stand-ins **in the shipping Electron build** (not just the browser preview) —
> even where the real backend now exists. `nimi/ui-stubs.ts` is the giveaway:
> its own header says it's "used in BOTH the Electron and browser-preview paths."
> These items connect the existing UI to the existing `window.api` backend.
> Sourced from a full renderer audit on 2026-06-12.

### A. Fake / prototype data shipping in the real app (wire to `window.api`)

- [ ] **Voice is cosmetic.** `nimi/voice.tsx` records nothing (timer + animated
  bars only); "stop" pastes a canned transcript from `ui-stubs.ts:nextTranscript()`
  (`add.tsx:152`, `feed.tsx:351`). Wire to real mic capture → `captureFile` →
  ASR pipeline (the backend ASR seam already exists). **high**
- [ ] **Task chat ("Ask Mikan") is scripted.** `task.tsx:599` `CHAT_REPLIES` +
  `task.tsx:647` fallback. No backend chat channel exists yet — needs a contract
  addition or should be hidden until one lands. **high**
- [ ] **Task draft is hardcoded.** `task.tsx:340 tryDraft()` injects a two-paragraph
  draft via `setTimeout`, ignoring the real `Task.draft` the drafter produces.
  Render `Task.draft`/`Task.brief` instead; wire Edit/Redo/Copy. **high**
- [ ] **Feed quick-add doesn't persist.** `feed.tsx:132 feedOne()` + `SAMPLE_TITLES`
  build local-only fake `FedItem`s for the Note/Link/voice buttons (`feed.tsx:235,351`).
  Route through `captureText`/`captureFile`. **high**
- [ ] **"Found N connections" is random.** `add.tsx:178` `2 + Math.random()*4`
  shown as a real result after feeding. Use the real capture/index result. **high**
- [ ] **Add sheet calls the stub `uncoverTodos()`** (`add.tsx:11,186`, always `[]`)
  instead of `data.pipeline.uncoverTodos()` — the real API now exists. **high**
- [ ] **Hardcoded user name.** `today.tsx:19 FIRST_NAME = 'Jordan'` (used L74) and
  `plan.tsx:57 'Good morning, Jordan'`. Use `useAuth().state.claims?.name`. **high**
- [ ] **Fake memory-weather stats.** `today.tsx:76 '1,284 memories · last fed 9h ago'`
  is literal. Use `archive.length` + most-recent feed timestamp. **high**
- [ ] **Backend AI fields never rendered.** Memory cards pass `why={null}`
  (`task.tsx:467,538`) though `Task.whyMap` is emitted; `relFor()` falls back to a
  fake `0.6` fit (`task.tsx:14`). **med**
- [ ] **Static suggestion chips** — `ui-stubs.ts:TASK_SUGGESTIONS`/`SEARCH_SUGGEST`
  (`add.tsx`, `search.tsx`). Either derive from real data or accept as decorative. **low**

### B. Incomplete / dead-end flows

- [ ] **Dead buttons in task detail:** "Open source"/"Open in Mail" `onClick={() => {}}`
  (`task.tsx:103`); draft Edit/Redo no handler (`task.tsx:247`); Copy draft toggles
  icon only, never writes clipboard (`task.tsx:193`); chat Attach no handler (`task.tsx:722`). **high/med**
- [ ] **Add success copy lies:** "Added to your backlog" (`add.tsx:511`) but on success
  `addTodo` adds to **Today** (`MikanApp.tsx:217`). **high**
- [ ] **Unplanned-day header mislabeled:** button is `aria-label="Plan tomorrow"`
  but wired to `onPlan` → today's plan ritual (`today.tsx:55,247`). **high**
- [ ] **Plan ritual is bypassable:** switching tabs or `cancelPlan()` sets
  `planned = true` without planning (`MikanApp.tsx:293,445`). **high**
- [ ] **Empty slots / weather open the wrong thing:** empty slot "pick one more"
  → `onPlan` not `onAdd` (`today.tsx:185,303`); weather click → Plan overlay. **med**

### C. State-sync bugs (renderer keeps stale data after a backend mutation)

- [ ] **Archive never refreshes after capture.** `MemoryContext`/`archive` load once
  on mount (`MikanApp.tsx:154`); `onFed` only cheers (`:237`). New captures, connector
  syncs (`useConnectors.ts:61`), and ingested mail are invisible until reload. Broken
  thumbs/search rows/task ctx for anything new. **high**
- [ ] **Add is fire-and-forget.** `Promise.all(captures)` not awaited; "Filed away"
  fires on a 1750ms timer regardless of success/failure (`add.tsx:177`). **high**
- [ ] **Stale UI after worker restart** (sync toggle / key import) — renderer doesn't
  refetch tasks/backlog/archive (`useSync.ts`, `MikanApp.tsx:153`). See APP-GAPS.md §Sync. **high**

### D. Accessibility / keyboard / focus

- [ ] Clickable `<div>`s with no role/tabIndex/keyboard: memory weather (`today.tsx:71`),
  task rows (`today.tsx:143`), feed dropzone (`feed.tsx:179`). **med**
- [ ] Overlays (add/chat/search/celebrate) have no Escape handler and no focus trap. **med**
- [ ] Missing `aria-label`s on sheet-close buttons; bottom nav lacks `aria-current`. **low/med**

---

## Batch — 2026-06-02 (Auth: real login screen, not a header lock)

### 0. Replace the header lock icon with a proper login screen / gate
- **Symptom:** sign-in is a single lock-icon button tucked in the header
  (`auth.tsx` `AuthControl`, ~L16–21) that only appears when Logto is configured
  (`!state.configured` → renders `null`). It reads as a minor affordance, not the
  front door. When authenticated it becomes a `priv-pill` name/sign-out chip (~L25–30).
- **Want:** a dedicated login screen/surface (like the Settings overlay pattern in
  `MikanApp.tsx`) that presents sign-in as a first-class flow, with the lock chip in
  the header reduced to identity/sign-out only.
- **Decision needed (product):** is login **required** (a gate the app sits behind)
  or **optional**? Mikan is local-first and fully usable offline today, so a hard
  gate conflicts with that. Recommended model: app works locally without login;
  **login is what unlocks sync** (per-user Turso DB via the broker, ADR 0008), so
  the login screen is reachable from Settings and from any "turn on sync" CTA.
- **Linked gap — sync has no activation path:** sync is purely env-gated
  (`NEEME_SYNC=on` runtime + valid `NEEME_SYNC_ENCRYPTION_KEY`, see
  `db/sync-config.ts`), so in a shipped release it's **dormant** — there is no UI
  toggle and `NEEME_SYNC` is never set. The login screen work should land alongside
  a "Sync" toggle in Settings that (a) drives login, (b) flips sync on, and (c)
  surfaces `useSync` status/errors. Without this, login + broker + per-user DB are
  all wired but unreachable by a normal user.
- **Pointers:** `auth.tsx`, `hooks/useAuth.ts`, `hooks/useSync.ts`,
  `nimi/settings.tsx` (Settings overlay host), `MikanApp.tsx` overlay/`settingsOpen`
  state, main wiring in `src/main/index.ts` (~L140–156 broker token inject,
  L188–191 auth IPC).
- [x] **Login gate, not a header lock.** When Logto is configured the whole app
  now sits behind a full-screen sign-in gate (`nimi/auth-gate.tsx`, wired in
  `MikanApp.tsx`). `useAuth` gained a `ready` flag so the gate never flashes before
  a cached session restores; `src/main/auth/logto.ts` now keeps a cached session
  on offline/transient refresh failures (only a real 400/401 signs you out), so a
  hard gate never locks an offline user out of local-first data.
- [x] **Sign out moved to Settings.** The header `AuthControl` lock chip is gone
  (`auth.tsx` deleted); Settings has an **Account** section with identity + Sign
  out (`nimi/settings.tsx`).
- [x] **Sync has a real activation path.** Settings **Sync** section: a toggle
  (persisted pref in main, restarts the data worker), live status line, a
  per-device encryption key auto-generated into the OS keychain on first enable,
  and **reveal / import recovery key** to add devices (ADR 0008). Contract:
  `sync:get-settings` / `set-enabled` / `get-recovery-key` / `set-recovery-key`;
  main: `src/main/sync/sync-prefs.ts` + `sync-control.ts`; worker re-fork:
  `worker/client.ts restartWorker()`.
  - **Known limitation:** toggling sync on mid-session restarts the worker but the
    renderer keeps its already-loaded data in React state — newly pulled remote
    rows show on next navigation/reload, not instantly.
## Batch — 2026-06-02 (Today empty-state walkthrough)

![Today "A fresh day" empty state](assets/today-fresh-day.png)

### 1. Search button placement is inconsistent
- **Symptom:** search doesn't sit in a predictable top-right slot across screens.
- **Today:** it's the *middle* of three header buttons — plan-tomorrow, search,
  settings (`today.tsx` `AppHeader`, ~L57–65).
- **Task detail:** present in header (`task.tsx` ~L367).
- **Feed:** the Feed header has **no** search button at all.
- **Want:** search consistently pinned top-right (same slot, same order) on every
  primary screen, or a single shared header component that owns the button order.
- **Opportunity:** factor the header button cluster into one component so order
  can't drift per screen.

### 2. The "A fresh day / Plan today" page was supposed to be gone
- **Symptom:** this empty-state hero ("A fresh day", "Plan today", "N carried
  over · N in your backlog") still shows — thought it was removed.
- **Pointer:** Today empty state in `today.tsx`; but `MikanApp.tsx` ~L255 has
  `setOverlay('plan') // go straight to planning — no empty intermediate screen`,
  so the *intent* was to skip an empty intermediate screen. Intent vs. reality
  disagree.
- **Want:** decide whether this hero stays (and is the canonical fresh-day entry)
  or is removed in favor of going straight to the Plan ritual. Then make the code
  match the decision.

### 3. Define what the **+** (FAB) button does
- **Current:** the FAB always opens `AddSheet` defaulting to `mode='feed'`
  ("Feed a memory" tab) — `MikanApp.tsx` `onAdd` → `setOverlay('add')`;
  `add.tsx` `useState<'feed'|'todo'>('feed')` (~L35).
- **Want:** write down the intended behavior/spec so the default tab and entry
  points are deliberate (see #5 for the context-aware default).

### 4. Where does a new to-do get added? (today vs. backlog toggle)
- **Current:** `TodoPane` hard-codes the destination — the hint literally reads
  `GOES TO BACKLOG` (`add.tsx` ~L565). `MikanApp.addTodo` (~L198) only falls back
  to backlog when the cap-5 is already reached (`CAP_REACHED`); otherwise it tries
  Today. There is no user-facing choice.
- **Want:** an explicit **"Add to Today"** toggle in the add-to-do flow:
  - enabled only when Today has room (under the cap-5),
  - otherwise the to-do goes to the backlog (and the toggle is shown disabled with
    a reason, e.g. "Today's full").
- **Contract note:** there is currently no "add to backlog" mutator
  (`MikanApp.tsx` ~L198–213 fakes it in local state). A clean fix likely needs a
  contract addition — land that first.

### 5. On the backlog screen, **+** should default to "Add a to-do"
- **Current:** the FAB always opens the Add sheet on the **Feed** tab regardless of
  where you launched it from. Nav today is only `today` / `feed` — **there is no
  backlog screen yet**, so this depends on #2/#4 work that introduces one.
- **Want:** when the user is on the backlog surface, pressing **+** opens
  `AddSheet` with `mode='todo'` (the "Add a to-do" tab) instead of "Feed a memory".
- **Implementation hint:** give `AddSheet` an `initialMode` prop and have the FAB
  pass it based on the active screen.

---

## Cross-cutting

- **Header consolidation (#1, #3):** a shared header/FAB component would make
  button order and the FAB's context-aware default (#5) live in one place.
- **Contract gap (#4):** an explicit backlog mutator unblocks the today/backlog
  toggle and a real backlog screen (#5).
