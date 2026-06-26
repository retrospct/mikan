# UX / workflow punch list (front lane)

Front-lane (`apps/desktop/src/renderer`) UX bugs and workflow decisions to debug.
Captured from a live walkthrough — see screenshot below. Newest batch on top;
check items off (`- [x]`) as they land, and keep the code pointers current.

> Lane note: these are all renderer-side. Where a fix needs a contract change
> (e.g. an explicit "add to backlog" mutator), call it out and land the
> `@nimi/contract` half first.

---

## Batch — 2026-06-12 (remaining prototype stubs + state refresh)

> **Theme: the UI is plumbing-complete but not product-complete.** Much of the
> renderer was ported from the design mockup and still runs on prototype
> stand-ins. #90 wired the main data seam (`nimi/api.ts`) to real `window.api`
> calls in Electron and moved the browser-preview data into `mock.ts`; the items
> below track what is still stubbed or only partially refreshed.
> Sourced from a full renderer audit on 2026-06-12; status refreshed 2026-06-26.

### A. Fake / prototype data shipping in the real app (wire to `window.api`)

- [ ] **Voice is cosmetic.** `nimi/voice.tsx` records nothing (timer + animated
      bars only); "stop" still pastes a canned transcript from
      `ui-stubs.ts:nextTranscript()` in the Add sheet, while Feed's voice quick-tool
      still uses the local `feedOne('voice')` demo path. Wire to real mic capture →
      `captureFile` →
      ASR pipeline (the backend ASR seam already exists). **high**
- [ ] **Task chat ("Ask Nimi") is scripted.** `task.tsx:599` `CHAT_REPLIES` +
      `task.tsx:647` fallback. No backend chat channel exists yet — needs a contract
      addition or should be hidden until one lands. **high**
- [ ] **Task draft CTA is still local.** Existing `Task.draft` / `Task.brief` render
      when the backend supplies them, but `task.tsx:tryDraft()` still injects a local
      two-paragraph draft via `setTimeout` when a task has no draft. Wire the CTA,
      Edit, and Redo to the drafter surface, or hide them until available. **high**
- [ ] **Feed voice quick-add doesn't persist.** Note/Link quick tools now open the
      real Add composer, and file/drop capture persists through `captureFile`; voice
      still creates a local-only `FedItem` via `feedOne('voice')` + `SAMPLE_TITLES`.
      **high**
- [x] **"Found N connections" no longer uses a random count.** Add/feed completion
      now waits for real capture results, and the add-to-do flow reads context count
      from the returned `Task.ctx`.
- [x] **Add sheet calls real `pipeline.uncoverTodos()`.** It now uses
      `data.pipeline.uncoverTodos()` after capture; the section stays hidden when the
      backend returns `[]` without an AI key.
- [x] **User name comes from auth claims.** Today and Plan receive
      `auth.claims?.name ?? null` from `NimiApp`.
- [x] **Memory-weather stats use the archive.** Today receives `archive.length` and
      `archive[0]?.when` instead of hardcoded "Jordan" / "1,284 memories" copy.
- [x] **Backend AI fields render when present.** Task detail reads `Task.whyMap` and
      `Task.relMap`; missing scores still fall back to a neutral fit for older rows.
- [ ] **Static suggestion chips** — `ui-stubs.ts:TASK_SUGGESTIONS`/`SEARCH_SUGGEST`
      (`add.tsx`, `search.tsx`). Either derive from real data or accept as decorative. **low**

### B. Incomplete / dead-end flows

- [ ] **Dead buttons in task detail:** "Open source"/"Open in Mail" still no-ops;
      draft Edit/Redo have no handler; chat Attach has no handler. Copy draft now writes
      to the async Clipboard API. **high/med**
- [x] **Add success copy names the actual destination.** The add sheet now renders
      "Added to today" or "Added to your backlog" based on whether `onAddTodo` returned
      a `Task` or fell back locally.
- [ ] **Unplanned-day header mislabeled:** button is `aria-label="Plan tomorrow"`
      but wired to `onPlan` → today's plan ritual (`today.tsx:55,247`). **high**
- [ ] **Plan ritual is bypassable:** switching tabs or `cancelPlan()` sets
      `planned = true` without planning (`NimiApp.tsx:293,445`). **high**
- [ ] **Empty slots / weather open the wrong thing:** empty slot "pick one more"
      → `onPlan` not `onAdd` (`today.tsx:185,303`); weather click → Plan overlay. **med**

### C. State-sync bugs (renderer keeps stale data after a backend mutation)

- [x] **Archive refreshes after capture.** `NimiApp.onCaptured()` now re-pulls
      `pipeline.archive()` after captures resolve, so new memories can appear in
      `MemoryContext` without a full reload.
- [ ] **Background mutations still need a refresh signal.** Connector syncs,
      worker restarts, and remote rows pulled after enabling sync can still leave
      already-rendered React state stale until navigation/reload. **high**
- [x] **Add waits for real captures.** The Add sheet awaits `captureText` /
      `captureFile` results, reports the actual filed count, and shows a failure state
      on rejection.
- [ ] **Stale UI after worker restart** (sync toggle / key import) — renderer doesn't
      refetch tasks/backlog/archive (`useSync.ts`, `NimiApp.tsx:153`). See APP-GAPS.md §Sync. **high**

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
  `NimiApp.tsx`) that presents sign-in as a first-class flow, with the lock chip in
  the header reduced to identity/sign-out only.
- **Decision needed (product):** is login **required** (a gate the app sits behind)
  or **optional**? Nimi is local-first and fully usable offline today, so a hard
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
  `nimi/settings.tsx` (Settings overlay host), `NimiApp.tsx` overlay/`settingsOpen`
  state, main wiring in `src/main/index.ts` (~L140–156 broker token inject,
  L188–191 auth IPC).
- [x] **Login gate, not a header lock.** When Logto is configured the whole app
      now sits behind a full-screen sign-in gate (`nimi/auth-gate.tsx`, wired in
      `NimiApp.tsx`). `useAuth` gained a `ready` flag so the gate never flashes before
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
- **Today:** it's the _middle_ of three header buttons — plan-tomorrow, search,
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
- **Pointer:** Today empty state in `today.tsx`; but `NimiApp.tsx` ~L255 has
  `setOverlay('plan') // go straight to planning — no empty intermediate screen`,
  so the _intent_ was to skip an empty intermediate screen. Intent vs. reality
  disagree.
- **Want:** decide whether this hero stays (and is the canonical fresh-day entry)
  or is removed in favor of going straight to the Plan ritual. Then make the code
  match the decision.

### 3. Define what the **+** (FAB) button does

- **Current:** the FAB always opens `AddSheet` defaulting to `mode='feed'`
  ("Feed a memory" tab) — `NimiApp.tsx` `onAdd` → `setOverlay('add')`;
  `add.tsx` `useState<'feed'|'todo'>('feed')` (~L35).
- **Want:** write down the intended behavior/spec so the default tab and entry
  points are deliberate (see #5 for the context-aware default).

### 4. Where does a new to-do get added? (today vs. backlog toggle)

- **Current:** `TodoPane` hard-codes the destination — the hint literally reads
  `GOES TO BACKLOG` (`add.tsx` ~L565). `NimiApp.addTodo` (~L198) only falls back
  to backlog when the cap-5 is already reached (`CAP_REACHED`); otherwise it tries
  Today. There is no user-facing choice.
- **Want:** an explicit **"Add to Today"** toggle in the add-to-do flow:
  - enabled only when Today has room (under the cap-5),
  - otherwise the to-do goes to the backlog (and the toggle is shown disabled with
    a reason, e.g. "Today's full").
- **Contract note:** there is currently no "add to backlog" mutator
  (`NimiApp.tsx` ~L198–213 fakes it in local state). A clean fix likely needs a
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
