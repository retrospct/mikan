# CONTEXT — Mikan product & UX model

> Single-context domain doc (per `CLAUDE.md` → "Domain docs"). Durable truth about
> *what Mikan is* and *how its UX is shaped*. Initiative-specific delivery plans live
> in `docs/plans/`; architectural decisions in `docs/adr/`.

Mikan is an all-TypeScript, **on-device-first** personal-memory desktop app (Electron):
capture multi-modal input → surface it (semantic search + a daily focus list) and **do
the work** (draft, plan, act) to get things done. The product personality: *a warm, quiet
system that comes alive when it matters* — minimalist resting states that expand into rich,
multimodal AI surfaces, greyscale with **one restrained live accent** (matcha) marking only
what is AI-active or actionable.

---

## The design source of record

The product UX is defined by a Claude Design handoff: **`Mikan Flows.dc.html`** — a mid-fi
wireframe canvas of ~60 screens across 14 groups. The current `apps/desktop` renderer was
**already ported from an earlier handoff** (`mikan.css` header notes "Ported from the Claude
Design handoff bundle"); *Mikan Flows* is the **evolved, more complete iteration** of that
same language. The bundle's design system (`tokens.css`) is near-identical to the tokens
already in `apps/desktop/src/renderer/src/mikan/mikan.css`.

The canvas decomposes into **four buckets** (not 14 independent groups):

| Bucket | Canvas groups | Essence | Reduces to |
|---|---|---|---|
| **A · Task-lifecycle spine** | 01, 02, 03, 07, 12, 14 | Six views of *one* flow | **one** lifecycle + **one** card-morph + a mode system |
| **B · Onboarding** | 09, 10, 13 | First-run belief + model download | a tunable 4-window cadence (variants to choose) |
| **C · Upgrade** | 11 | Free → Pro, contextual CTAs | paywall surfaces (no timer/wall) |
| **D · Multimodal input** | 04, 05, 08 | Capture / jot / input | **one** input component used everywhere |

A is the spine; D embeds inside it; B frames it; C monetizes it.

---

## The canonical task lifecycle (bucket A)

Every task is **one state machine**. Groups 01/02/03/07/12/14 are this machine viewed at
different zoom levels (Group 14 is the explicit end-to-end; Group 07 is its visual mechanism;
Group 03 is the same spine with human gates collapsed; Group 12 zooms the plan-review states).

### States

| # | State | What's happening | The human's job |
|---|---|---|---|
| 1 | **listed** (on the list) | resting todo; carries a **mode** badge | — |
| 2 | **planning** | Mikan decides the steps (searches memory, gathers context) | wait / steer |
| 3 | **planned** (the plan) | plan ready; each step marked **Auto** or **Ask** | glance → accept, or edit a step |
| 4 | **working** | executing steps; card expanded (reasoning, sources, tools) | watch / steer / pause |
| 5 | **awaiting** (awaiting you) | hit an approval gate — *"nothing sent yet"* | approve & send/merge, or iterate |
| 6 | **done** (report) | receipt: what it did, where it ran, what stayed on device | done, or iterate |

**Planning is the default, not a mode you start** — by the time the user looks, the plan
already exists, so the decision is small (glance → accept). The current contract's 4-state
`TaskStatus` (`gathering|gathered|drafted|done`) is a coarser, email-draft-shaped ancestor of
this; the canonical model **splits planning (decide) from working (execute)** and adds an
explicit approval gate + a report receipt. It is task-type-agnostic, not reply-specific.

### Mode (orthogonal to state)

A **per-task switch**, set on the list — no separate hand-off screen:

- **Plan** (default) — Mikan plans, the human reviews the plan and approves at gates.
- **Auto** — Mikan runs the plan autonomously **on device**, pausing only at approval gates
  (*steer anytime · pause*); every run closes with a plain-language **on-device receipt**.
- Input-time modes also include **Save** and **Todo** (the input "mode menu", Group 5E).
- Within a plan, **each step** independently runs `auto` or `ask`.

### The card-morph (Group 07 — the visual mechanism)

The same task card is the atomic unit everywhere. It **morphs** through the lifecycle while
its **header stays pixel-stable** (avatar · title · orb hold position; only the body grows/
shrinks):

`collapsed → searching → running → reasoning → summary → complete`

- **Tallest mid-run** (peaks at *reasoning*), then collapses back to a one-line header once
  done — biggest when you most need to watch it.
- **One orb = the whole state machine**: a ring that fills as steps complete, then flips to a
  check. No separate status badges.
- A good run offers **"Save as a skill"** — turning it into a reusable action.

### The expanded workspace (Group 02)

Opening a task line reveals a workspace Mikan **pre-filled while you slept**: a brief (with
subtle citations), a collapsible **reasoning** card, a **Sources** component, and a **dock**
of the skills/tools/connectors Mikan set up. The guided workflow is a stepper
(`gathered → your voice → drafting → approve & send`) ending in an editable draft with
**tap-don't-type refine** chips (Warmer / Shorter / Attach photos). **Chat ("Ask Mikan") is
built from the same parts** — reasoning, tool-result cards, citations, sources — and is the
escape hatch, not the main event.

---

## The one multimodal input (bucket D)

One calm input bar, used everywhere (home composer, capture, jot, task composer). **Suggestions
lead** so most days you tap, not type. Text, photo, file, voice, and tools all collapse back
into the single bar. It carries the **mode chip** (Plan/Save/Todo/Auto) and a `+` menu. Voice
and capture run **on device** ("listening · on device", "reading it in"). Adding a to-do sizes
inline and lands on Today or in Next.

---

## Visual system (how it's expressed)

- **Token-driven, dual-theme.** The shipping app is **dark-first** with a full token system
  (`mikan.css`); a warm **cream light mode** is a first-class peer. The *Mikan Flows* wireframes
  are drawn in **light/greyscale because they are mid-fi** — their literal hexes (`#faf9f6` bg,
  `#1a1a1a` ink, `#6f7d63` accent, `#e7e6e2` hairline) are the existing **light-mode token
  values**. Implement against the token vars (`--bg`, `--ink`, `--accent`, `--hairline`, …) for
  *both* themes; **never hard-code the wireframe hexes**, and don't flip the app to light-first.
- **One accent, spent sparingly** — accent marks only what is *alive or actionable*, never
  decoration. Greyscale does the rest.
- **Type:** Hanken Grotesk (human) + JetBrains Mono (the `.ovr` overline: uppercase, wide-tracked
  status/labels/numerics, joined by the middot `·`). Sentence case for everything human.
- **Motion is the personality**, restrained until a moment earns it: `pop/settle`, `breathe`
  (idle-live mark), `pulse` (live orb), `sheen`, and **morph / stack / slide** for long-running
  work. All motion gated by `prefers-reduced-motion` / `data-ambient="off"`.
- **Cards** = `--surface-2` + 1px `--hairline` + `--r-card` + soft shadow, lifting on hover; an
  inset **context strip** (pulsing orb + mono status) is the recurring "what's happening" pattern.
- Icons: **Lucide** (light, single-weight line; round caps; 24px grid). Brand mark = rotated
  rounded-square diamond framing a 5-dot node cluster, with the `breathe` animation when idle-live.

---

## How the canvas maps to the existing renderer

`apps/desktop/src/renderer/src/mikan/` already implements an earlier cut. This redesign
**evolves these in place** (they are already wired to `window.api` via `api.ts`):

| Canvas | Existing file | Net-new? |
|---|---|---|
| 01 Today / Stack | `today.tsx` | evolve |
| 02 Expand / Workspace / Guided / Ask | `task.tsx` | evolve |
| 12 Plan mode | `plan.tsx` | evolve |
| 04/05/08 Capture / Jot / Input | `add.tsx`, `voice.tsx`, `capture-file.ts` | converge to one input |
| 07 Growing card | — | **new shared component** |
| 03 Auto mode | — | **new** (front + run loop) |
| 09/10/13 Onboarding + model download | — | **new** |
| 11 Upgrade | — | **new** |
| 14 Lifecycle | (integration of the above) | integration |

The view-model contract is `@mikan/contract` (`packages/contract/src/views.ts`). The lifecycle
above **supersedes `TaskStatus`** and is **contract-first work** — it lands in `@mikan/contract`
(and `docs/INTEGRATION.md`) before any renderer change. Per "wire real, plain": structural
fields are served for real; AI-driven transitions (planning/drafting/working) stay AI-gapped
(`null`/empty, UI degrades gracefully) until the LLM layer lands.

---

## Pointers

- Delivery plan + slices: [`docs/plans/mikan-flows.prd.md`](docs/plans/mikan-flows.prd.md)
- Contract: [`packages/contract/src/views.ts`](packages/contract/src/views.ts) · [`docs/INTEGRATION.md`](docs/INTEGRATION.md)
- Design source: the *Mikan Flows* handoff bundle (`Mikan Flows.dc.html` + `_ds/.../tokens.css`)
