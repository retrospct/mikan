---
todos:
  - id: adr
    status: pending
    content: 'Write an ADR ("On-device pipeline on React Native") capturing the three load-bearing decisions: (1) embeddings via react-native-executorch useTextEmbeddings ALL_MINILM_L6_V2 (384-dim, matches desktop EMBED_DIM); (2) store + vector search via @op-engineering/op-sqlite (libsql/turso backend + embedded replicas; sqlite-vec as the fallback vector API); (3) share the pipeline orchestration via a new platform-neutral packages/pipeline consumed by both apps/desktop and apps/mobile. Gate the build on the Phase 1 spike. Cross-reference ADR 0003 (all-TS on-device pipeline) and ADR 0006 (monorepo).'
  - id: spike-store
    status: pending
    content: 'Spike A — store + vector on a real iOS device/dev-client: stand up @op-engineering/op-sqlite, enable the libsql (and turso) + sqliteVec build flags, and verify which vector API is available on the libsql backend. Test path: create the chunks schema, insert vector32()-style embeddings, run a nearest-neighbour query, and confirm results. Determine whether libSQL native vector funcs (vector32 / vector_distance_cos / libsql_vector_idx) work through op-sqlite''s libsql build, or whether mobile must use the sqlite-vec vec0 virtual-table API. Record the answer — it decides whether the search SQL is portable or needs a per-platform VectorStore adapter.'
  - id: spike-embed
    status: pending
    content: 'Spike B — embeddings on a real iOS device/dev-client: run react-native-executorch useTextEmbeddings with ALL_MINILM_L6_V2, embed a few strings, and measure cold-load + per-embed latency and app-size delta (~110MB iOS model). Critically, compare the output vectors against desktop''s transformers.js Xenova/all-MiniLM-L6-v2 export for the SAME input text — quantify cosine similarity between the two exports to decide whether cross-device vectors are directly comparable (needed for sync) or whether each device must re-embed.'
  - id: extract-pipeline-pkg
    status: pending
    content: 'Extract the platform-neutral pipeline orchestration from apps/desktop/src/main into a new packages/pipeline (@nimi/pipeline), consumed from .ts source like @nimi/contract. Move the orchestration of capture → chunk → embed → index → search (the logic in services/pipeline-service.ts) behind explicit seams: Embedder (already exists in pipeline/embed.ts), a new VectorStore/Db seam (currently raw libSQL SQL inline in pipeline-service.ts), a BlobStore seam (currently pipeline/raw-store.ts uses node fs), and the existing Extractor seams (pipeline/ocr.ts, pipeline/asr.ts). Keep @nimi/contract free of runtime deps; pipeline package holds runtime logic with platform deps injected.'
  - id: desktop-adapter
    status: pending
    content: 'Refactor apps/desktop to consume @nimi/pipeline via desktop adapters (the existing @libsql/client store, onnxruntime-node/transformers.js embedder, node-fs blob store). This is a behavior-preserving refactor — the existing vitest suite (158 tests, NEEME_EMBEDDER=hash) and the e2e/smoke tiers must stay green with no functional change. Land this BEFORE mobile adapters so the seams are proven on the platform that already works.'
  - id: mobile-adapters
    status: pending
    content: 'Implement the mobile adapters behind @nimi/pipeline seams: op-sqlite VectorStore (libsql native vector or sqlite-vec vec0, per Spike A), executorch Embedder (useTextEmbeddings ALL_MINILM_L6_V2, per Spike B), and an expo-file-system BlobStore. Requires an Expo dev-client / EAS build (op-sqlite + executorch are native modules — no Expo Go), which #14 already needs for Logto. Reuse @nimi/contract/views projection (the analog of services/project.ts) so mobile renders the same view-models.'
  - id: mobile-ui-localfirst
    status: pending
    content: 'Rewire the apps/mobile Feed + capture screens to read/write the LOCAL pipeline first (capture-a-note → local index → local semantic search), demoting @nimi/contract/api (neeme FastAPI) from "only data path" to an optional sync/offload path. Mirror the desktop renderer seam pattern (apps/desktop/src/renderer/src/nimi/api.ts) so the same view-model surface backs both local and remote.'
  - id: sync-convergence
    status: pending
    content: 'Converge with ROADMAP #10: use op-sqlite openSync (Turso embedded replicas) as the mobile sync transport — the same libSQL embedded-replica model desktop already builds in apps/desktop/src/main/db/index.ts. Reconcile the encryption-at-rest + content-encryption story (op-sqlite supports local encryption + offline writes) with the desktop sync seam, and decide the cross-device vector strategy from Spike B (ship shared vectors vs re-embed on each device, since the vector index is a rebuildable artifact derived from items.text).'
  - id: verify-docs
    status: pending
    content: 'Verify end-to-end on a physical iOS device: capture on phone → local embed → local vector search returns relevant results fully offline (airplane mode), then sync surfaces the same item on desktop. Update apps/mobile/CLAUDE.md (drop the "no local libSQL / remote-only" framing), docs/INTEGRATION.md, and (human) add a ROADMAP item for the on-device-mobile track distinct from the #14 companion.'
name: mobile on-device pipeline (RN + iOS parity with desktop)
overview: 'Bring nimi''s on-device-first pipeline (local libSQL store + native vector search + local MiniLM embeddings) to React Native / iOS, so the mobile app is not permanently a thin remote client of the neeme FastAPI. The two pieces that blocked this on desktop''s exact stack now have first-class RN answers: @op-engineering/op-sqlite gives a local SQLite/libSQL store with embedded replicas (Turso) and on-device vectors (sqlite-vec), and react-native-executorch''s useTextEmbeddings ships all-MiniLM-L6-v2 at the same 384 dims desktop uses. The plan is seam-first: extract the platform-neutral pipeline orchestration into a shared packages/pipeline, prove it on desktop (behavior-preserving refactor under the existing vitest suite), then add mobile adapters for the store, embedder, and blob storage. This reframes the #14 companion''s assumption that mobile needs the cloud — on-device mobile + Turso embedded replicas IS the #10 sync architecture, not a dependency on a cloud-only API. Gated on a two-part on-device spike (store + embedder) on a real iOS device, and on an accompanying ADR.'
isProject: false
---
# Mobile on-device pipeline — RN + iOS parity with desktop

> **Companion to [`mobile-rn-expo.plan.md`](./mobile-rn-expo.plan.md) (ROADMAP #14), not a replacement.**
> #14 stands up the mobile *surface* as a thin remote client (auth + feed + capture-a-note over
> the neeme FastAPI), explicitly "no local libSQL worker." This plan covers the *next* question:
> can mobile run the same **on-device-first** pipeline desktop runs, and what would it take. The
> answer is **yes** — and it converges with [ROADMAP #10](../ROADMAP.md) (Turso sync) rather than
> depending on a cloud-only backend.

## Why now / what changed

[ADR 0003](../adr/0003-all-typescript-on-device-pipeline.md) chose an all-TypeScript on-device
pipeline for desktop: capture → content-hash store → extract → chunk → **embed locally** → index in
**libSQL native vector** → semantic search, all in the Electron `utilityProcess`. Two pieces of that
stack are environment-bound and were the reason mobile was scoped remote-only:

1. **The embedder.** Desktop's `LocalEmbedder` ([`pipeline/embed.ts`](../../apps/desktop/src/main/pipeline/embed.ts))
   runs `@huggingface/transformers` on **`onnxruntime-node`** — a Node-native addon. `transformers.js`
   + `onnxruntime-node` target Node/browser, **not** React Native.
2. **The process model.** The `utilityProcess` worker and `window.api.*` IPC
   ([`apps/desktop/src/main/**`](../../apps/desktop/src/main)) are Electron constructs with no RN
   equivalent — `@nimi/contract/ipc` has "no runtime meaning" on RN.

Both now have mature RN answers (verified current as of 2026-06):

| Desktop piece | RN / iOS answer | Parity note |
|---|---|---|
| Local store (`@libsql/client`, `file:` db) | **`@op-engineering/op-sqlite`** — iOS/Android/macOS; build flags `libsql: true`, `turso: true` | Same libSQL family; embedded replicas via `openSync`/`openRemote` |
| **Native vector search** (`vector32` / `vector_distance_cos` / `libsql_vector_idx`, `F32_BLOB(384)`) | op-sqlite `sqliteVec: true` (sqlite-vec `vec0`), or libSQL-native vector if exposed by the libsql build | ⚠️ **vector-API parity is the #1 thing the spike must settle** (see Risks) |
| Embeddings (`Xenova/all-MiniLM-L6-v2`, 384-dim, `EMBED_DIM = 384`) | **`react-native-executorch`** `useTextEmbeddings({ model: ALL_MINILM_L6_V2 })` | **Same model, same 384 dims**; ~7ms/embed iPhone 17 Pro; ~110MB model on iOS |
| `utilityProcess` + `window.api.*` IPC | n/a — runs on RN JS thread + native modules (executorch runs off-thread natively) | No worker/IPC layer to port; orchestration becomes a shared library call |
| Content-hash blob store ([`pipeline/raw-store.ts`](../../apps/desktop/src/main/pipeline/raw-store.ts), node `fs`) | `expo-file-system` | Behind a `BlobStore` seam |

The headline: **on-device mobile is no longer blocked by missing primitives** — it's blocked by the
fact that the pipeline currently lives *inside* `apps/desktop`, not in a shareable package. That's
the real work.

## Architecture: seam-first, shared core

Today the orchestration is coupled to Electron/Node: [`services/pipeline-service.ts`](../../apps/desktop/src/main/services/pipeline-service.ts)
issues **raw libSQL SQL** inline (e.g. `INSERT ... vector32(?)` and
`vector_distance_cos(c.embedding, vector32(?))`), [`pipeline/raw-store.ts`](../../apps/desktop/src/main/pipeline/raw-store.ts)
hashes bytes to the node filesystem, and [`pipeline/embed.ts`](../../apps/desktop/src/main/pipeline/embed.ts)
imports `onnxruntime-node`. The capture/index/search *logic* is platform-neutral; its *dependencies*
are not.

**Proposal: extract a `packages/pipeline` (`@nimi/pipeline`)** consumed from `.ts` source (same model
as `@nimi/contract`), parameterized over four seams:

```
@nimi/pipeline  (platform-neutral orchestration: capture → chunk → embed → index → search)
  ├─ Embedder      seam — EXISTS today in pipeline/embed.ts (interface is already clean)
  ├─ VectorStore   seam — NEW; hides the vector SQL (libSQL-native vs sqlite-vec vec0)
  ├─ BlobStore     seam — NEW; content-hash raw store (node fs ↔ expo-file-system)
  └─ Extractor     seam — EXISTS (pipeline/ocr.ts, pipeline/asr.ts)

apps/desktop adapters:  @libsql/client + onnxruntime-node + node fs   (already works)
apps/mobile  adapters:  op-sqlite      + executorch       + expo-file-system
```

`@nimi/contract` stays exactly as-is — pure types + the HTTP client, **no runtime/native deps**.
`@nimi/pipeline` is where runtime logic with injected platform deps lives. The view-model projection
([`services/project.ts`](../../apps/desktop/src/main/services/project.ts)) is reused so both apps emit
the same `@nimi/contract/views` shapes.

### Why extract-then-port (not port-then-extract)

The desktop refactor (consume `@nimi/pipeline` via desktop adapters) is **behavior-preserving** and
guarded by the existing test suite — `pnpm --filter @nimi/desktop test` (158 tests, `NEEME_EMBEDDER=hash`)
plus the smoke/e2e tiers. Proving the seams on the platform that already works de-risks the whole
effort before any RN code exists. If the desktop refactor can't stay green, the seam boundaries are
wrong and we learn it cheaply.

## Phasing

- **Phase 0 — ADR + decisions.** Lock the three load-bearing choices (embedder, store/vector, shared
  package) and the open questions below. Gate implementation on the Phase 1 spike.
- **Phase 1 — De-risk spikes (on a real iOS device).** Two standalone spikes, independent of nimi:
  - **A. Store + vector** — op-sqlite with `libsql`/`turso` + `sqliteVec`; answer the vector-API
    parity question (libSQL-native vs `vec0`).
  - **B. Embeddings** — executorch `useTextEmbeddings(ALL_MINILM_L6_V2)`; measure latency/size **and**
    cross-check vector similarity against desktop's transformers.js export for identical input.
- **Phase 2 — Extract `@nimi/pipeline` + desktop adapter.** Hoist seams, refactor desktop to consume
  them, keep all tests green. No functional change.
- **Phase 3 — Mobile adapters.** op-sqlite VectorStore, executorch Embedder, expo-file-system
  BlobStore. Requires an Expo dev-client / EAS build (native modules; #14 already needs this for Logto).
- **Phase 4 — Local-first mobile UI.** Capture/feed/search read the local pipeline first; FastAPI
  demotes to an optional sync/offload path.
- **Phase 5 — Sync convergence with #10.** op-sqlite `openSync` (Turso embedded replicas) as the
  mobile transport; reconcile encryption + the cross-device vector strategy.

## How this reframes #14 and #10

The #14 plan states mobile has a *"hard dependency on ROADMAP #10"* because it has no local store, so
its only data path is the cloud. **On-device mobile inverts that:** with a local libSQL store, mobile
is local-first like desktop, and #10's **Turso embedded replicas are the sync transport, not a
prerequisite for having any data at all.** op-sqlite's `openSync` is the same embedded-replica model
desktop already wires in [`db/index.ts`](../../apps/desktop/src/main/db/index.ts) (`syncUrl` +
`authToken` + `syncInterval`). So sync and on-device mobile are **parallel tracks that meet**, not a
strict dependency chain — worth surfacing to whoever owns the roadmap sequencing.

## Risks / open questions

1. **Vector-API parity (highest risk).** Desktop relies on libSQL **native** vector functions
   (`vector32`, `vector_distance_cos`, `libsql_vector_idx`). op-sqlite exposes a libsql backend *and*
   a separate `sqlite-vec` (`vec0` virtual table) API — a **different** SQL surface. If op-sqlite's
   libsql build surfaces the native functions, the search SQL is portable and the `VectorStore` seam
   is thin. If not, mobile uses `vec0` and the seam absorbs the difference. **Spike A must answer
   this before any schema is committed.**
2. **Cross-device embedding comparability (correctness, gates sync).** Desktop embeds with
   `Xenova/all-MiniLM-L6-v2` (transformers.js ONNX); mobile with executorch's MiniLM export. Same
   architecture/dims, but different exports may not produce byte-identical vectors. A query embedded
   on mobile must rank desktop-embedded chunks correctly once synced. **Spike B must quantify the
   cosine gap.** Safe fallback: treat the vector index as a **rebuildable artifact** (desktop already
   reindexes via `pipelineService.syncEmbedder()` when the embedder changes) and **re-embed per
   device** rather than shipping shared vectors — text syncs, vectors are derived locally.
3. **Native modules ⇒ no Expo Go.** op-sqlite and executorch are native; mobile needs a **dev-client /
   EAS build**. Already on #14's radar for Logto, but confirm before committing.
4. **App size + model download.** executorch MiniLM is ~110MB on iOS — lazy-download on first use +
   cache (desktop already lazy-downloads its model), don't bundle.
5. **Threading.** No `utilityProcess` on RN. executorch runs inference natively (off the JS thread);
   op-sqlite has both sync and async APIs — use **async** for indexing/search so the UI thread never
   blocks.
6. **Extractors (OCR/ASR) are out of first scope.** Desktop's `ocr`/`asr` seams have native fast
   paths (macOS Vision/Speech). Mobile extraction (e.g. executorch OCR, on-device speech) is a later
   slice; first-cut mobile capture is text → embed → index → search, mirroring #14's text-note scope.

## Decisions for a human

- **Shared package vs duplication.** Extract `@nimi/pipeline` (recommended — single source of truth,
  desktop tests guard the seams) or accept a parallel mobile reimplementation (faster to start, drifts
  over time)?
- **executorch vs alternatives.** `react-native-executorch` is the cleanest fit (hook + the exact
  MiniLM, Software Mansion-maintained, active). Alternative: `onnxruntime-react-native` (reuse the
  same ONNX export as desktop → better vector parity, but more wiring, no batteries-included hook).
  The parity question (#2 above) may tip this.
- **Vector API.** Prefer libSQL-native (portable SQL with desktop) if op-sqlite's libsql build exposes
  it; else sqlite-vec `vec0` behind the seam. Decided by Spike A.
- **Sequencing vs #10.** Build on-device mobile in parallel with #10 and meet at Turso embedded
  replicas, or serialize behind #10? (Recommend parallel — Phases 2–4 don't need the cloud.)
- **Roadmap entry.** This is a distinct track from the #14 companion; add a new ROADMAP item (human).

## Verify (definition of done for the spike + first slice)

- **Spike A:** a vector nearest-neighbour query returns correct results from op-sqlite on a physical
  iOS device; the available vector API (native vs `vec0`) is recorded.
- **Spike B:** executorch `ALL_MINILM_L6_V2` embeds on-device; latency/size measured; cosine gap vs
  desktop's export quantified with a go/no-go on shared-vector sync.
- **Phase 2:** `pnpm --filter @nimi/desktop test` + smoke/e2e stay green after the `@nimi/pipeline`
  extraction (zero behavior change).
- **First mobile slice:** capture a note on the phone, embed + index locally, and get a relevant
  semantic-search hit **fully offline (airplane mode)**; after sync, the same item appears on desktop.

## Sources

- op-sqlite (iOS/Android/macOS; `libsql`/`turso`/`sqliteVec` build flags; `openSync` embedded
  replicas) — https://op-engineering.github.io/op-sqlite/docs/installation
- sqlite-vec support in op-sqlite (`vec0` virtual table, `float[N]` embeddings) —
  https://github.com/OP-Engineering/op-sqlite/issues/138 · https://github.com/OP-Engineering/op-sqlite/pull/216
- Turso official mobile SDKs + RN/libSQL embedded replicas —
  https://turso.tech/blog/turso-goes-mobile-with-official-ios-and-android-sdks
- react-native-executorch `useTextEmbeddings` (ALL_MINILM_L6_V2, 384-dim; size/latency tables) —
  https://docs.swmansion.com/react-native-executorch/docs/hooks/natural-language-processing/useTextEmbeddings ·
  https://github.com/software-mansion/react-native-executorch
- Desktop baseline — [ADR 0003](../adr/0003-all-typescript-on-device-pipeline.md),
  [`pipeline/embed.ts`](../../apps/desktop/src/main/pipeline/embed.ts),
  [`db/index.ts`](../../apps/desktop/src/main/db/index.ts),
  [`services/pipeline-service.ts`](../../apps/desktop/src/main/services/pipeline-service.ts)
