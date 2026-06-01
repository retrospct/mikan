# Runbook: Uncovered Todos — GUI Test (PR #6)

Branch under test: `claude/strange-bassi-9974c1`

This runbook covers the full end-to-end GUI verification for the **uncovered-todos** feature:
Nimi infers candidate to-dos from the recent capture feed via the Claude API, displays them
in the Feed tab with confidence rings, and lets the user add them to backlog.

---

## Test pyramid

Run these tiers in order. Stop if an earlier tier fails.

| Tier | Command | Needs secret? | Needs display? | Covers |
|---|---|---|---|---|
| **1 — Static** | `pnpm typecheck && pnpm build` | No | No | Types, build integrity |
| **2 — Service tests** | `pnpm --filter @nimi/desktop test` | No | No | NullDrafter path, cache write/hit/invalidation, pipeline, todos |
| **3 — GUI test** | This runbook (§4–§7) | `NEEME_ANTHROPIC_KEY` | Yes | CloudDrafter inference, UI rendering, Backlog button, meta-cache |

Tiers 1 and 2 run in any CI environment without secrets and without a display. Tier 3 is the
only part that requires a cloud agent with an X11 display and an Anthropic key.

**Expected test counts for Tier 2 (as of this PR):**
- 9 test files, 158 tests (including 6 new `uncover-service` tests)
- `NEEME_EMBEDDER=hash NEEME_DRAFTER=off` — no model download, no API calls

---

## Prerequisites

| Requirement | Minimum | Notes |
|---|---|---|
| Node.js | ≥ 20 | `node --version` |
| pnpm | 10.x | `pnpm --version`; install via `npm i -g pnpm@10` if missing |
| X11 display | any | Cloud VMs expose `DISPLAY=:1`; macOS/Windows need no setup |
| Anthropic API key | `sk-ant-...` | **Required** for the feature under test. See §3 below. |

---

## 1. Checkout and install

```bash
git clone https://github.com/retrospct/nimi.git   # skip if already cloned
cd nimi
git checkout claude/strange-bassi-9974c1
pnpm install
```

> `pnpm install` runs `electron-builder install-app-deps` as a postinstall hook to rebuild
> native deps for the local Electron ABI.

---

## 2. One-time: ensure the Electron binary is present

In cloud / headless VMs the Electron binary download sometimes does not complete during
`pnpm install`. Verify and fix with:

```bash
pnpm exec electron --version   # should print e.g. "v42.3.0"
```

If you see `Error: Electron uninstall` or a blank line, run once:

```bash
node node_modules/electron/install.js
pnpm exec electron --version   # must print a version now
```

---

## 3. Environment variables

### Required to test the feature

| Variable | How to supply |
|---|---|
| `NEEME_ANTHROPIC_KEY` | Inline on the launch command (§4), a repo-root `.env` file, or a shell `export`. |

**Without this key** the app still runs and all existing features work, but
`NullDrafter` is instantiated and the "I spotted these to-dos" section will never appear in
the Feed tab. That is the correct graceful-degradation behavior, tested separately in §7.

### Optional tunables

| Variable | Default | Purpose |
|---|---|---|
| `NEEME_EMBEDDER` | *(real model)* | Set to `hash` to skip the MiniLM model download. **Always use `hash` in cloud VMs** where the HuggingFace model isn't cached. |
| `NEEME_DRAFTER_MODEL` | `claude-sonnet-4-5` | Override the Claude model used for inference. |
| `NEEME_DRAFTER` | *(unset)* | Set to `off` to force `NullDrafter` even when a key is present. |

### Do NOT set manually

| Variable | Reason |
|---|---|
| `NEEME_USER_DATA` | Set automatically by Electron main when it forks the worker. Manual override is only for headless scripts. |

### Turbo passthrough

`turbo.json` declares `globalEnv: ["NEEME_*", "VITE_*"]`, so any variable matching those
prefixes passes through turbo to the dev/build tasks whether you inline it, export it from
your shell, or put it in a repo-root `.env` file.

---

## 4. Start the app

**Standard launch (recommended for cloud VMs):**

```bash
NEEME_ANTHROPIC_KEY=sk-ant-... NEEME_EMBEDDER=hash pnpm dev
```

**Alternative — put the key in `.env` first:**

```bash
cp .env.example .env
echo "NEEME_ANTHROPIC_KEY=sk-ant-..." >> .env
NEEME_EMBEDDER=hash pnpm dev
```

Wait for the Vite HMR line and the Electron window to appear before proceeding.
The renderer is also accessible at `http://localhost:5173/` during dev (no `window.api` there,
but useful for layout checks).

> **dbus warnings** in the terminal (`Failed to connect to socket /run/dbus/system_bus_socket`)
> are normal in headless VMs — non-fatal, ignore.

---

## 5. Feature test: uncovered todos (happy path)

### 5a. Capture action-oriented notes

Use the **+ button** (centre of the bottom nav) to open the AddSheet, then type each note
and confirm. **Do not use the quick-feed buttons** (Note / Voice / Link in the Feed tab) —
those are a non-persisting demo affordance (`feedOne()` builds a fake local `FedItem` and
never calls `captureText`). Only the AddSheet and real file drops write to the `items` table
that `uncoverTodos()` reads from.

Recommended test inputs (use as-is for reproducibility):

```
Priya needs the Q3 one-pager by Friday — board reads Monday.
```

```
Sarah's free the 18th or 25th for the cabin — pick one so she can book it.
```

Also capture one non-actionable note to confirm it is not surfaced:

```
the lake at sunset was unreal
```

### 5b. Navigate to the Feed tab

Open the **Feed** tab (bottom navigation bar).

### 5c. Verify the "I spotted these to-dos" section

**Expected result:**

- A section headed **"I spotted these to-dos"** (with a sparkle icon ✦) appears **above** the
  "Lately fed" list.
- Each inferred to-do card shows:
  - A **confidence ring** (SVG arc, labelled with a percentage like "87").
  - A **title** — short, imperative (e.g. "Send Q3 one-pager to Priya by Friday").
  - A **why** line — plain, ≤14 words grounding the inference in source text.
  - A **Backlog** button.
- The lake note should produce **no** card.
- At most 5 cards are shown (highest-confidence first).

**If the section does not appear:**
- Confirm `NEEME_ANTHROPIC_KEY` is set (check with `echo $NEEME_ANTHROPIC_KEY` in the same
  terminal before launching).
- Check the Electron DevTools console (`View → Toggle Developer Tools`) for
  `[drafter] Anthropic API error` or `[drafter] uncover parse error` messages.

### 5d. Add a to-do to backlog

Click the **Backlog** button on one of the inferred cards.

**Expected result:**
- The button label changes from "Backlog" to "**Added**" (with a check icon) and becomes
  disabled.
- The item appears in the **Today** tab (if fewer than 5 tasks are already there; cap = 5),
  otherwise it lands in the backlog visible inside the Plan overlay. Switch to the **Today**
  tab to confirm. (Plan is an overlay launched from Today, not a separate bottom-nav tab.)

### 5e. Verify the meta-cache (instant re-load)

Switch to a different tab (e.g. Today), then switch back to **Feed**.

**Expected result:**
- The "I spotted these to-dos" section reappears **instantly** with the same cards — no
  network call is made, because the feed content hash has not changed.
- The "Backlog" button state **resets** on remount — this is correct. The `added` set is
  local React component state (`useState`) that does not persist across tab switches. The
  to-do was already written to the database on the first click; the button reset does not
  undo that. The section re-rendering instantly without a spinner or API call is the
  cache behaviour this step verifies.

### 5f. Verify re-inference after new capture

Capture another action-y note **using the + button** (§5a), then switch tabs away and back
to **Feed**.

**Expected result:**
- The section re-renders, potentially with updated or additional cards, because the feed
  content hash changed and a new Claude call was issued.

Two things to note:
- Re-inference is triggered by `FeedView` **remounting** — the fetch lives in a
  `useEffect(..., [])`. Simply scrolling or waiting in the Feed tab is not enough; you must
  switch away and back to trigger a remount.
- Only real captures (AddSheet / file drop) change the feed hash. Clicking the quick-feed
  buttons (Note / Voice / Link) adds a fake local `FedItem` that is never written to the
  `items` table, so the hash does not change and no re-inference occurs.

---

## 6. Visual checklist

Review the layout of the Feed tab:

- [ ] "I spotted these to-dos" section appears **above** "Lately fed" with visible spacing
      between the two `.fed-list` blocks.
- [ ] Confidence rings are not clipped or overflowing their card boundaries.
- [ ] Long `why` text wraps cleanly without overlapping the Backlog button.
- [ ] "Added" state (button disabled, check icon) is visually distinct from "Backlog" state.

> If the cards look cramped, adjust `.unc` and `.fed-list` padding in
> `apps/desktop/src/renderer/src/nimi/nimi.css`.

---

## 7. Graceful-degradation test (no key)

Restart the app **without** setting `NEEME_ANTHROPIC_KEY`:

```bash
NEEME_EMBEDDER=hash pnpm dev
```

Repeat the capture steps (§5a) and open the Feed tab.

**Expected result:**
- The "I spotted these to-dos" section is **absent** — the `NullDrafter` returns `[]`.
- The "Lately fed" list, capture flow, and all other features work normally.
- No errors in the console.

---

## 8. Static verification (optional, no Electron required)

Run from the repo root — these are fast and do not require a display or API key:

```bash
pnpm typecheck   # must pass clean (0 errors)
pnpm build       # electron-vite production bundles — must succeed
pnpm lint        # expect exactly 34 errors, ALL in packages/contract/src/api/generated/**
                 # (pre-existing hey-api debt, not introduced by this PR)
```

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "I spotted" section absent despite captures | Used quick-feed buttons (Note/Voice/Link) instead of + button | Capture via the **+ button** (AddSheet) — quick-feed buttons are a non-persisting demo affordance and do not write to the `items` table |
| `Error: Electron uninstall` on `pnpm dev` | Electron binary not downloaded | `node node_modules/electron/install.js` |
| App window never opens | X11/display not set | Ensure `DISPLAY` is set (e.g. `export DISPLAY=:1`) |
| "I spotted" section absent with key set | Key not reaching the worker process | Verify turbo passthrough: inline the var on the same command, not just in a separate `export` |
| `[drafter] Anthropic API error 401` in DevTools | Invalid or expired key | Use a valid `sk-ant-...` key |
| `[drafter] uncover parse error` | Model returned malformed JSON | Usually self-healing on retry; strip-fence logic in `draft.ts` handles common cases |
| Section appears but cards are blank | `title` field empty in model response | Enable DevTools, check `[drafter]` logs; try `NEEME_DRAFTER_MODEL=claude-opus-4-5` |
| dbus warnings in terminal | No session bus in VM | Non-fatal — ignore |
