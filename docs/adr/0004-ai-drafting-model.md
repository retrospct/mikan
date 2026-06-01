# ADR 0004 — AI drafting / chat model (the "AI-gap" layer)

**Status:** Accepted — **cloud (BYO-key) behind a `Drafter` seam.** On-device LLM is an _optional future spike_, not a committed path. Only open question: managed-key vs BYO-key.
**Date:** 2026-06-01
**Context owners:** jlee (+ Claude)
**Related:** fills the AI-gap left by the contract convergence (`docs/INTEGRATION.md`); narrows [[0003-all-typescript-on-device-pipeline]] (cloud LLM was already its carve-out); touches [[0002-authentication]] (only if we host a managed key)

## Problem

"Wire real, plain" left every AI-generated field `null`: `Task.brief`/`draft`/`note`, the
`gathering→drafted` status, `BacklogItem.conf`, the per-context "why" strings, feed-inferred
`UncoveredTodo`s, and "Ask Nimi" chat. This ADR decides **what generates that text.**

The decision is shipping-first. On-device LLM is appealing (latency, privacy, 0003's spine)
but it's the _slowest possible start_ — native addon, multi-GB model, packaging, device
variance — and the goal right now is to **get Nimi into people's hands.** So: cloud now,
local as a curiosity spike later.

## Options considered

Legend: ✅ strong · ⚠️ caveats · ❌ poor

| Option                                          | Quality    | Speed to ship               | $ to us      | Privacy                |
| ----------------------------------------------- | ---------- | --------------------------- | ------------ | ---------------------- |
| A. Cloud, we hold the key                       | ✅         | ✅                          | ❌ per-token | ⚠️                     |
| B. Cloud, **BYO-key**, behind a seam _(chosen)_ | ✅         | ✅ HTTPS call               | ✅ zero      | ✅ user opts in + keys |
| C. On-device small LLM                          | ⚠️ ceiling | ❌ weeks of native-ML setup | ✅           | ✅                     |

**B** wins on every axis that matters for shipping: frontier quality immediately, an HTTPS
call (no native deps), no token cost on us pre-revenue, and the user opts in with their own
key. The **seam** (mirrors `Embedder`'s `NIMI_EMBEDDER`) means a local impl could drop in
later with zero caller changes — so choosing cloud now forecloses nothing.

## Recommendation

**Build a `Drafter` seam and ship the cloud impl (BYO-key, default Claude).**

- Wire `brief`/`draft`/Ask-Nimi through it; opt-in, with a clear "this sends the relevant
  memories to <provider>" consent.
- The projection layer (`src/main/services/project.ts`) already isolates every AI-gap field,
  so the UI degrades gracefully when AI is off or unkeyed.
- No device-capability question → **v1 ships everywhere.**

### Sidequest (optional, unscheduled): on-device LLM spike

If/when curiosity or a privacy/latency need warrants it, run a _time-boxed spike_ behind the
same seam: a small model via `node-llama-cpp` (lazy-downloaded, cached like the embedder),
benchmarked against the cloud output as the quality bar, on capable hardware only. It's a
sidequest — not a roadmap commitment, not a launch blocker. If a device can't run it, the
graceful-null state already covers that for free.

## Consequences

- **Easier:** the experience ships in days; no native-ML packaging; the seam keeps provider +
  (future) local model swappable.
- **Harder:** a cloud dependency for the AI features (the rest of the app stays fully local +
  offline); a settings surface for the key; prompt-injection hygiene once memory feeds prompts.

## Open question

- **Managed key (we proxy — smoother UX, but cost + an auth need → re-opens [[0002]]) vs
  strict BYO-key (zero cost, no accounts, more setup friction)?** Lean BYO-key for v1 (cheap,
  no auth); revisit managed-key only if a frictionless consumer launch demands it.

## Action items

1. [x] Define the `Drafter` interface + a `NEEME_DRAFTER` env seam (mirror `embed.ts`). → `apps/desktop/src/main/pipeline/draft.ts`
2. [x] Decide managed-key vs BYO-key — **BYO-key** for v1. Env var: `NEEME_ANTHROPIC_KEY`.
3. [x] Wire the cloud impl (BYO-key, Claude) feeding all AI-gap fields end-to-end. → `draft-service.ts` + `todo-service.ts` + `project.ts`. Override model with `NEEME_DRAFTER_MODEL` (default `claude-sonnet-4-5`).
4. [ ] Settings: provider + key + the consent copy. _(front lane / #2)_
5. [ ] _(Sidequest, optional)_ on-device spike behind the same seam, benchmarked vs cloud.
