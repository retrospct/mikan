# ADR 0004 — AI drafting / chat model (the "AI-gap" layer)

**Status:** Accepted direction — `Drafter` seam; **cloud-first to ship the experience, on-device as the benchmarked fast-follow** (the latency/privacy win). Device-breadth deferred. Open: managed-vs-BYO key, local model choice (below).
**Date:** 2026-06-01
**Context owners:** jlee (+ Claude)
**Related:** fills the AI-gap left by the contract convergence (`docs/INTEGRATION.md`); extends [[0003-all-typescript-on-device-pipeline]] (cloud = offload); touches [[0002-authentication]] (only if we host a managed key)

## Problem

"Wire real, plain" shipped the structural data and left every AI-generated field `null`:
`Task.brief`/`draft`/`note`, the `gathering→drafted` status, `BacklogItem.conf`, the
per-context "why" strings, feed-inferred `UncoveredTodo`s, and "Ask Nimi" chat. This ADR
decides **what generates that text**, and **in what order we build it**.

The honest tension: Nimi is a **personal-memory** app, so drafting prompts carry the user's
private content, and on-device-first (0003) is the spine — which argues for a local model.
But for _speed to ship the experience_, a local LLM is the slowest possible start (native
addon, multi-GB download, packaging), while cloud is an HTTPS call. The resolution is a
**seam** that lets us start fast and graduate, not pick one forever.

## Options considered

Legend: ✅ strong · ⚠️ caveats · ❌ poor

| Option                                                                   | Draft quality           | Offline             | Privacy                      | $ to us                 | Ships in Electron          |
| ------------------------------------------------------------------------ | ----------------------- | ------------------- | ---------------------------- | ----------------------- | -------------------------- |
| A. Cloud frontier API only (we hold the key)                             | ✅                      | ❌                  | ⚠️ sends memory to 3rd party | ❌ per-token, we eat it | ✅ trivial                 |
| B. On-device small LLM only (`node-llama-cpp`, Llama-3.2-3B/Qwen2.5/Phi) | ⚠️ ceiling              | ✅                  | ✅                           | ✅ free                 | ⚠️ native addon + GB model |
| C. Seam: cloud first, on-device fast-follow _(recommended)_              | ✅ now → ✅ local later | ✅ once local lands | ✅ (cloud opt-in/keyed)      | ✅ BYO-key              | ✅                         |
| D. BYO-key, provider-agnostic (user supplies Claude/OpenAI/local)        | ✅                      | ⚠️                  | ✅ user's choice             | ✅ zero                 | ✅                         |

### Notes

- **A** — fastest to _ship_, but offline-breaking, we pay per user, and routes private memory
  to a vendor by default. Right as _phase 1 behind a seam_, wrong as the permanent only-path.
- **B** — purest 0003 fit and the latency end-goal, but the _slowest start_: a 3B model is
  mediocre at long drafts, multi-GB download + device variance is real, and it's weeks of
  native-ML yak-shaving before the first drafted reply.
- **C + D (recommended)** — a `Drafter` seam (mirrors the `Embedder` seam) with BYO-key so we
  eat no token cost. Ship the cloud impl first to validate the UX; slot the local impl in
  later behind the same interface. Exactly 0003's "cloud = offload for the big chat LLM,"
  just sequenced for dev speed.

## Recommendation

Build a **`Drafter` seam** (like `Embedder`) and **sequence cloud → local**:

**Phase 1 — cloud, BYO-key (ship the experience, fast).** Wire `brief`/`draft`/Ask-Nimi
through a cloud provider (default Claude) the user keys. An HTTPS call — hours, not weeks; no
native addon, no model download, frontier quality immediately. This validates the product UX.
BYO-key = zero token cost on us pre-revenue; opt-in with a clear "this sends the relevant
memories to <provider>" consent. No device-capability question → **v1 ships everywhere.**

**Phase 2 — on-device, benchmarked fast-follow (the latency/privacy win).** Add a local impl
(`node-llama-cpp`, lazy model cached in userData like the embedder) behind the _same_ seam,
**measured against the cloud output as the quality + latency bar**. Per-capability graduation:
short/structured generations (`note`/`noteKind`, `brief`, `BacklogItem.conf`,
feed→`UncoveredTodo`) move local first — cheap, latency-sensitive, easiest to clear the bar;
long-form `draft` + Ask-Nimi stay cloud until/unless local is good enough. Best case "all
local," worst case "long drafts stay cloud."

The projection layer (`src/main/services/project.ts`) isolates every AI-gap field, so the UI
degrades gracefully whenever AI is off or unkeyed.

### Why this order

Ease-of-dev + speed-to-begin is the axis that matters to _start_, and on it cloud wins
decisively: an API call vs a native addon + multi-GB download + packaging matrix. The **seam**
keeps it non-throwaway — local drops in later with zero caller changes (same pattern as
`NIMI_EMBEDDER`), and the cloud output becomes the **benchmark** for local. On-device
latency/privacy (0003's driver — skipping the record→upload→process→respond loop) is a
_runtime_ optimization applied once the experience is proven worth it.

### v1 scope — defer the device problem

Cloud-first has no device-capability question, so v1 just ships. When on-device lands later,
"device too weak to run local" is handled **free** by the graceful-null state we already built
("wire real, plain"). Min-spec probes, device tiers, quantized models — all a **success
problem**: if we ever have so many users that some can't run local, we'll have earned the
right to solve it. Not now.

### No chatty hybrid

When local lands, keep each capability end-to-end on **one** side. A split that ferries
embeddings/intermediate state across the network re-adds the very round-trip latency on-device
is meant to kill — a capability is fully local or fully cloud, never half mid-pipeline.

## Consequences

- **Easier:** the experience ships in days, not weeks; no native-ML packaging to _start_;
  privacy stays honest (cloud opt-in + keyed; local later); the seam keeps model + provider
  swappable.
- **Harder:** eventually two impls to maintain; `node-llama-cpp` enters the packaging matrix
  when phase 2 starts (we already carry `onnxruntime-node`); a settings surface for the key +
  provider; prompt-injection hygiene once memory content feeds prompts.

## Open questions

- **Managed key (we proxy — simplest UX, but cost + an auth need → re-opens [[0002]]) vs
  strict BYO-key (zero cost, more friction)? — the phase-1 fork to decide first.**
- Which local model + the per-capability bar for phase 2 (the thing to actually benchmark).
- Streaming "Ask Nimi" over IPC — chunked events on the existing `window.api` seam.
- Does `gathering`/`drafted` status become real only when the Drafter runs, or do we infer
  `gathering` structurally (open + empty context)?

## Action items

1. [ ] Define the `Drafter` interface + a `NIMI_DRAFTER` env seam (mirror `embed.ts`).
2. [ ] Decide managed-key vs BYO-key (phase 1's one real fork).
3. [ ] **Phase 1:** wire the cloud impl (BYO-key, Claude) feeding `brief` + `draft` for one
       task end-to-end through the seam → validate the UX.
4. [ ] Settings: provider + key + the consent copy.
5. [ ] **Phase 2 (later):** on-device impl behind the same seam, benchmarked per-capability
       against the cloud output.
