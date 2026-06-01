# ADR 0004 — AI drafting / chat model (the "AI-gap" layer)

**Status:** Proposed (recommends a provider seam + hybrid: on-device default, cloud offload by BYO-key)
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

Pragmatic v1: wire the **cloud BYO-key path first** (fastest route to the actual experience;
local-LLM packaging is heavy), with the seam in place so the local impl is a fast-follow.

## Consequences

- **Easier:** the magic ships; privacy story is honest (local default, cloud opt-in); no
  per-token cost on us; the seam keeps model choice swappable.
- **Harder:** two code paths to maintain; `node-llama-cpp` is another native addon in the
  packaging matrix (we already carry `onnxruntime-node`); a settings surface for the key +
  the local/cloud toggle; prompt-injection hygiene once memory content feeds prompts.

## Open questions

- Which local model (size vs quality vs download) — and do we even ship local in v1 or
  seam-only + cloud-first?
- Managed key (we proxy, simplest UX, but cost + an auth need → re-opens [[0002]]) vs strict
  BYO-key (zero cost, more friction)?
- Streaming "Ask Nimi" over IPC — chunked events on the existing `window.api` seam.
- Does `gathering`/`drafted` status become real only when the Drafter runs, or do we infer
  `gathering` structurally (open + empty context)?

## Action items

1. [ ] Define the `Drafter` interface + a `NIMI_DRAFTER` env seam (mirror `embed.ts`).
2. [ ] Wire one path end-to-end (cloud BYO-key) feeding `brief` + `draft` for one task.
3. [ ] Settings: provider + key + local/cloud toggle + the consent copy.
4. [ ] Decide local model + lazy-download story (or defer local to a follow-up).
