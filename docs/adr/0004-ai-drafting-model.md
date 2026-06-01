# ADR 0004 — AI drafting / chat model (the "AI-gap" layer)

**Status:** Accepted direction — **on-device happy path, benchmark-gated; cloud as the measured worst-case cutover** (per-capability). Open: local model choice, managed-vs-BYO key (below).
**Date:** 2026-06-01
**Context owners:** jlee (+ Claude)
**Related:** fills the AI-gap left by the contract convergence (`docs/INTEGRATION.md`); extends [[0003-all-typescript-on-device-pipeline]] (cloud = offload); touches [[0002-authentication]] (only if we host a managed key)

## Problem

"Wire real, plain" shipped the structural data and left every AI-generated field `null`:
`Task.brief`/`draft`/`note`, the `gathering→drafted` status, `BacklogItem.conf`, the
per-context "why" strings, feed-inferred `UncoveredTodo`s, and "Ask Nimi" chat. This ADR
decides **what generates that text** — and how it squares with on-device-first.

The honest tension: Nimi is a **personal-memory** app, so drafting prompts carry the user's
private content (emails, notes, calendar). And on-device-first (0003) is the spine. But
small local models draft markedly worse than frontier cloud models — and 0003 already
carved out "big chat LLM" as a legitimate **cloud-offload** case.

## Options considered

Legend: ✅ strong · ⚠️ caveats · ❌ poor

| Option                                                                   | Draft quality      | Offline     | Privacy                      | $ to us                 | Ships in Electron          |
| ------------------------------------------------------------------------ | ------------------ | ----------- | ---------------------------- | ----------------------- | -------------------------- |
| A. Cloud frontier API only (we hold the key)                             | ✅                 | ❌          | ⚠️ sends memory to 3rd party | ❌ per-token, we eat it | ✅ trivial                 |
| B. On-device small LLM only (`node-llama-cpp`, Llama-3.2-3B/Qwen2.5/Phi) | ⚠️ ceiling         | ✅          | ✅                           | ✅ free                 | ⚠️ native addon + GB model |
| C. Hybrid behind a seam: local default, cloud offload _(recommended)_    | ✅ when it matters | ✅ degraded | ✅ by default                | ✅ user-keyed           | ✅                         |
| D. BYO-key, provider-agnostic (user supplies Claude/OpenAI/local)        | ✅                 | ⚠️          | ✅ user's choice             | ✅ zero                 | ✅                         |

### Notes

- **A** — fastest to ship the magic, but it breaks the offline promise, makes us pay per
  user, and routes private memory to a vendor by default. Fine as _an_ option, wrong as the
  _only_ one for this app.
- **B** — purest 0003 fit, but a 3B-class model writes mediocre replies and a multi-GB
  download + device variance is real. Great for the _cheap_ generations (status, short
  briefs, todo inference), not for the headline draft.
- **C + D (recommended together)** — mirror the **Embedder seam** that already worked: a
  `Drafter` interface with a local impl (default: private, free, offline, good enough for
  structured/short output) and a cloud impl the user enables **with their own key** (BYO)
  for quality-sensitive drafting + "Ask Nimi". This is exactly 0003's "cloud = offload for
  the big chat LLM," and BYO-key means we don't eat token cost pre-revenue.

## Recommendation

**Build a `Drafter` seam (like `Embedder`) and ship hybrid:**

- **Local default** (`node-llama-cpp`, small instruct model, lazy-downloaded + cached in
  userData like the embedder) handles the always-on, privacy-sensitive, cheap generations:
  task `note`/`noteKind`, `brief` summaries over the context pool, `BacklogItem.conf`, and
  feed→`UncoveredTodo` inference.
- **Cloud offload, opt-in + BYO-key** (default provider: Claude) for the quality bar:
  long `draft` bodies and the "Ask Nimi" conversation. Off by default; enabling it shows a
  clear "this sends the relevant memories to <provider>" consent.
- The projection layer (`src/main/services/project.ts`) already isolates every AI-gap field
  — the Drafter feeds exactly those, so the UI keeps degrading gracefully when AI is off.

### Sequencing — happy path first, measure, cut over only if needed

The call (consistent with 0003's "spike + measure before committing"): **build the on-device
path first and benchmark it.** Local is not just the principled default — it's _quicker_ for
the common case (no network round-trip; 0003's speed/latency/offline driver). Only build the
cloud path and cut over **where the numbers say local isn't good enough** — and that cutover
is **per-capability, not wholesale**.

**The "good enough" bar (define before building):** acceptable draft quality on real tasks
(reply-to-email, one-pager brief) + a latency target on a **low-end device**, not just Apple
Silicon. Measure each capability against it.

Likely outcome by capability (to be confirmed by benchmark, not assumed):

- **Cheap/structured — stays local:** `note`/`noteKind`, `brief` over the context pool,
  `BacklogItem.conf`, feed→`UncoveredTodo` inference. Short, templated, latency-sensitive.
- **Long-form `draft` + "Ask Nimi" — the most likely to fail the bar** → the first/only
  capability that cuts over to cloud offload (opt-in, BYO-key) if local can't clear it.

So: ship local, benchmark, and let the bar — per capability — decide what (if anything)
graduates to cloud. Worst case is "long drafts go cloud"; best case is "all local."

## Consequences

- **Easier:** the magic ships; privacy story is honest (local default, cloud opt-in); no
  per-token cost on us; the seam keeps model choice swappable.
- **Harder:** two code paths to maintain; `node-llama-cpp` is another native addon in the
  packaging matrix (we already carry `onnxruntime-node`); a settings surface for the key +
  the local/cloud toggle; prompt-injection hygiene once memory content feeds prompts.

## Open questions

- Which local model (size vs quality vs download), and what's the per-capability bar that
  triggers a cloud cutover? (Decided: local ships first and gets benchmarked — this is the
  one to actually measure.)
- Managed key (we proxy, simplest UX, but cost + an auth need → re-opens [[0002]]) vs strict
  BYO-key (zero cost, more friction)?
- Streaming "Ask Nimi" over IPC — chunked events on the existing `window.api` seam.
- Does `gathering`/`drafted` status become real only when the Drafter runs, or do we infer
  `gathering` structurally (open + empty context)?

## Action items

1. [ ] Define the `Drafter` interface + a `NIMI_DRAFTER` env seam (mirror `embed.ts`).
2. [ ] Set the "good enough" bar: real-task quality + a latency target on a low-end device.
3. [ ] Build the **on-device** Drafter first (`node-llama-cpp`, lazy model) → benchmark
       `brief` + `draft` against the bar, per capability.
4. [ ] Only for capabilities that miss the bar: add the cloud offload (opt-in, BYO-key) +
       the consent/settings surface, and cut those over.
