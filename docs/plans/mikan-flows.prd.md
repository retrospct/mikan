# PRD — Mikan Flows (renderer redesign)

> Source: the *Mikan Flows* Claude Design handoff (`Mikan Flows.dc.html`, ~60 screens / 14 groups).
> Durable UX model: [`CONTEXT.md`](../../CONTEXT.md). This PRD is the **delivery plan** and ends
> in **spine-first slices** ready to become issues (Linear).

## 1. Problem & goal

The shipping renderer was ported from an **earlier** Claude Design handoff and has drifted from
the current design thinking. *Mikan Flows* is the evolved language: a single **task-lifecycle**
pattern, a single **multimodal input**, and a cohesive first-run/upgrade story. Today the
renderer has Today/Task/Plan/Add as separate, email-draft-shaped screens with a coarse 4-state
task model and no Auto mode, no growing-card, no onboarding/upgrade.

**Goal:** re-point the renderer onto the canonical lifecycle and component set in `CONTEXT.md`,
evolving existing screens in place, contract-first, without regressing the "wire real, plain"
backend integration already in place.

## 2. Non-goals

- Not a theme flip. The app stays **dark-first + token-driven**; the wireframes' light hexes are
  mid-fi light-mode tokens, not a directive (see Open Decision D1).
- Not a backend rewrite. New AI-driven transitions stay **AI-gapped** until the LLM layer lands.
- Not pixel-cloning the prototype's DOM — match layout/hierarchy/behavior, expressed via tokens.
- Buckets B (onboarding), C (upgrade), D (input convergence) are **phased after** the spine.

## 3. Scope — the four buckets

| Bucket | Groups | Phase |
|---|---|---|
| **A · Task-lifecycle spine** | 01, 02, 03, 07, 12, 14 | **Phase 1 (this PRD's focus)** |
| **D · One multimodal input** | 04, 05, 08 | Phase 2 |
| **B · Onboarding (+ model download)** | 09, 10, 13 | Phase 3 (design-tune first — variants to choose) |
| **C · Upgrade CTAs** | 11 | Phase 3 |

## 4. The canonical model (normative — full detail in `CONTEXT.md`)

- **States:** `listed → planning → planned → working → awaiting → done(report)`.
- **Mode (orthogonal):** per-task `plan` (default) | `auto`; per-step `auto` | `ask`; input
  modes `plan|save|todo|auto`.
- **Card-morph:** one stable-header / morphing-body card; `collapsed→searching→running→reasoning→summary→complete`; **one orb = the state machine** (ring fills → check); tallest at *reasoning*.
- **Workspace:** brief + reasoning + Sources + tool/connector dock; guided stepper → editable
  draft + tap-don't-type refine chips; **Ask Mikan = same parts**.
- **Auto mode:** runs on device, steer/pause, approval gate ("nothing sent yet"), on-device receipt.

## 5. Contract changes (land first, in `@mikan/contract`)

Evolve `packages/contract/src/views.ts` (+ `docs/INTEGRATION.md` in the same change). **Proposed**
shape — confirm in Open Decision A1:

```ts
// supersedes TaskStatus
export type TaskState =
  | 'listed' | 'planning' | 'planned' | 'working' | 'awaiting' | 'done'

export type TaskMode = 'plan' | 'auto'
export type StepRun  = 'auto' | 'ask'

export interface PlanStep {
  id: string
  title: string          // "Checked your calendar"
  run: StepRun           // auto | ask (the per-step switch, Group 12E)
  tool?: string          // "CALENDAR" / "MAPS" — connector/tool label
  status: 'pending' | 'running' | 'done' | 'blocked'   // drives the orb fill
}

export interface RunReceipt {              // AI-gap until the run loop lands
  ranOnDevice: boolean
  durationMs: number | null
  touched: string[]      // source/connector ids the run read/wrote
  sentAnything: boolean  // "nothing sent yet" vs "sent · 2:14pm"
}

// Task gains (additive where possible):
//   state: TaskState         (replaces status; map old → new at the projector)
//   mode: TaskMode
//   steps?: PlanStep[]       (the plan; AI-gap)
//   receipt?: RunReceipt     (AI-gap)
// Group-01 presentation states (done/in-progress/delegated/deferred) are DERIVED:
//   delegated = mode:auto & working;  deferred = planning/queued;  in-progress = working;  done = done.
```

Projector: `apps/desktop/src/main/services/project.ts` maps the data model → this view model
(the AI-gap). Old `TaskStatus` → `TaskState`: `gathering→planning|working`, `gathered→planned`,
`drafted→awaiting`, `done→done`. An **ADR** should record the lifecycle supersession once A1 is
confirmed (proposed `docs/adr/0010-task-lifecycle.md`).

## 6. Slices (spine-first, independently grabbable)

Lanes per `CLAUDE.md`: **back** = `apps/desktop/src/main/**` + `packages/contract/**`; **front**
= `apps/desktop/src/renderer/**`. Contract slice lands before the front slices that consume it.

| # | Slice | Lane | Depends on | Real vs shell |
|---|---|---|---|---|
| **S0** | **Contract: lifecycle + mode + PlanStep + RunReceipt** (§5) + `INTEGRATION.md` + ADR 0010 | back | — | real types; projector maps old→new |
| **S1** | **Growing-card component** (Group 07): stable header, morphing body, orb state machine, the six render states, `Save as a skill` affordance. Mock-driven, token-themed, reduced-motion safe. | front | S0 | shell (mock) |
| **S2** | **Today / Stack** (Group 01): status-carrying checkbox, the stack of S1 cards, cap row (`N done · M left`, `Plan my day`), mode badges. Evolve `today.tsx`. | front | S1 | wire real (existing Today data) |
| **S3** | **Task expand → workspace** (Group 02): line → workspace (brief, reasoning, Sources, dock), guided stepper → editable draft + refine chips, Ask-Mikan thread (same parts). Evolve `task.tsx`. | front | S1 | real structural + AI-gap |
| **S4** | **Plan mode** (Group 12): planning-as-default, the plan (edit/accept), edit-step (auto/ask). Evolve `plan.tsx`; consumes `PlanStep`. | front | S0, S3 | real structural + AI-gap |
| **S5** | **Auto mode** (Group 03): per-task auto switch on the list, running/steer/pause, awaiting-approval gate, on-device receipt. | front + back | S3, S4 | new run loop (AI-gap) + receipt |
| **S6** | **Lifecycle integration** (Group 14): one task end-to-end `listed→report` across S2–S5; reconcile transitions, empty/edge states. | front | S2–S5 | integration |

Phase 2+ (separate PRD slices later): **D** one-input convergence (`add.tsx`/`voice.tsx`/capture →
single component); **B** onboarding variants (design-tune 09/10/13, then build the chosen one);
**C** upgrade CTAs (11).

Each slice: start a fresh session, pass this PRD + the single slice, run the implement flow,
verify with `pnpm typecheck && pnpm build && pnpm lint` (worker/native changes need a live
`pnpm dev` smoke test — no Electron in CI).

## 7. Success criteria

- `@mikan/contract` exposes the canonical lifecycle; renderer renders all six states from it.
- Today, Task, Plan evolved to the *Mikan Flows* layout via tokens (both themes), no hard-coded hexes.
- Auto mode runs a task to an on-device receipt with a working approval gate.
- No regression in existing real-data wiring; AI-gapped fields degrade gracefully.
- `prefers-reduced-motion` / `data-ambient="off"` fully read with motion off.

## 8. Open decisions (need your call before S1 starts)

| id | Decision | Recommendation |
|---|---|---|
| **A1** | Lifecycle states + `TaskState` supersedes `TaskStatus`? | **Yes** — adopt the six states (§4/§5). |
| **D1** | Light/greyscale wireframes = theme flip, or mid-fi light-mode tokens? | **Mid-fi** — keep dark-first + dual-theme, map hexes → vars, never hard-code. |
| **R1** | Evolve existing screens in place, or parallel rebuild? | **Evolve in place** — they're already wired to `window.api`. |
| **M1** | Mode model: `mode` per-task + `run` per-step, both orthogonal to state? | **Yes** (§5). |
| **F1** | Fidelity bar: pixel-clone vs faithful layout/hierarchy via tokens? | **Faithful via tokens**, not DOM-clone. |

## 9. Next steps

1. Confirm/adjust Open Decisions §8 (esp. **D1** — it shapes every front slice).
2. Land **S0** (contract + ADR 0010) — contract-first.
3. Fan **S1–S6** into Linear issues (one per slice, lane-tagged), grab spine-first.
