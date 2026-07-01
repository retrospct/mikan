# ADR 0010 — Canonical task lifecycle supersedes `TaskStatus`

**Status:** Implemented (2026-07-01) — `TaskState` landed in `@mikan/contract` (S0), renderer
slices migrated onto it (S1–S5), `TaskStatus` retired and `state`/`mode` flipped to required (S6).
**Date:** 2026-06-30
**Context owners:** jlee (+ Claude)
**Related:** implements the *Mikan Flows* design (`CONTEXT.md`, `docs/plans/mikan-flows.prd.md`);
evolves the view-model contract from [[0006-repo-structure]] (`@mikan/contract`); the AI-driven
transitions stay gated behind [[0003-all-typescript-on-device-pipeline]] / [[0004-ai-drafting-model]].

## Problem

The *Mikan Flows* handoff defines the product as **one task-lifecycle pattern** viewed at six
zoom levels (canvas Groups 01/02/03/07/12/14). The current contract models a task with a coarse,
email-draft-shaped status:

```ts
export type TaskStatus = 'gathering' | 'gathered' | 'drafted' | 'done'
```

That conflates *deciding what to do* (planning) with *doing it* (working), has no explicit
human approval gate, and no done/report receipt — all of which the design treats as distinct,
load-bearing states. It's also reply-specific (`drafted`), whereas the lifecycle must cover any
task type (plan, act, draft, book…). We need a single source of truth the growing-card morph
(Group 07) and Auto mode (Group 03) both render.

## Decision

Adopt a six-state, task-type-agnostic lifecycle as the canonical model, plus an orthogonal mode:

```ts
type TaskState = 'listed' | 'planning' | 'planned' | 'working' | 'awaiting' | 'done'
type TaskMode  = 'plan' | 'auto'          // per-task, set on the list
type StepRun   = 'auto' | 'ask'           // per plan step
interface PlanStep   { id; title; run: StepRun; tool?; status }   // drives the orb fill
interface RunReceipt { ranOnDevice; durationMs; touched[]; sentAnything }
```

- **State** = where the task is; **mode** = how it runs (orthogonal). Planning is the *default*,
  not a mode you start.
- **Roll out additively to keep the build green.** S0 adds `TaskState`/`TaskMode`/`PlanStep`/
  `RunReceipt` and adds optional `state`/`mode`/`steps`/`receipt` to `Task` **without removing
  `status`**. The projector (`services/project.ts` → `toTask`) derives `state` from `status`
  today. Renderer slices (S1–S6) migrate onto `state`; `status` retires in S6 once unused.
- **"Wire real, plain" preserved.** `state`/`mode` are real (structural/derived); `steps`/
  `receipt` are AI-gap (`undefined`/null) until the planner + run-loop land (S4/S5).
- Group-01 presentation states (done / in-progress / delegated / deferred) are **derived in the
  renderer** from `(state, mode)`, not stored.

## Options considered

Legend: ✅ strong · ⚠️ caveats · ❌ poor

| Option | Build safety | Fidelity to design | Churn |
| --- | --- | --- | --- |
| A. Additive `TaskState` now, retire `TaskStatus` in S6 _(chosen)_ | ✅ green throughout | ✅ full six-state model | ✅ spread across slices |
| B. Hard replace `TaskStatus` → `TaskState` in one change | ❌ breaks projector + every renderer consumer + mocks at once | ✅ | ❌ one giant change |
| C. Keep `TaskStatus`, bolt design states onto the renderer only | ✅ | ❌ no single source of truth; Auto/plan diverge | ⚠️ debt |

## Consequences

- **+** One contract truth for the lifecycle; growing-card and Auto mode render the same `state`.
- **+** Each renderer slice migrates independently; CI stays green between slices.
- **−** Transient redundancy: `status` and `state` coexisted until S6 (mitigated — `status` was
  frozen with no new writers, then removed).
- **Resolved (S6):** `steps`/`receipt`/`mode` gained real backing (S4's plan-review UI, S5's run
  loop); `docs/INTEGRATION.md`'s real-vs-AI-gap table is updated; `Task.state`/`Task.mode` are
  required and `TaskStatus` is deleted from `@mikan/contract`.
