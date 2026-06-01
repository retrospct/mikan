# ADR 0003 — All-TypeScript stack with an on-device-first pipeline

**Status:** Proposed (recommends all-TS + on-device pipeline; go/no-go = a local-embed + libSQL-vector spike)
**Date:** 2026-06-01
**Context owners:** jlee (+ Claude); the Python pipeline's owner must sign off (it's their code)
**Related:** reframes [[0001-sync-and-processing-architecture]]; simplifies [[0002-authentication]]

## Problem

Two decisions have converged:
1. **Do we still need Python?** The backend (`/Users/jlee/src/retrospct/neeme`, FastAPI) is the
   only non-TS part of a stack that is otherwise Electron + React (+ planned Expo mobile), all
   TypeScript. The language split is already taxing us — it's why ADR 0002's auth story needed a
   cross-language JWKS dance.
2. **Run as much as possible on-device** — the stated driver is **speed / latency / offline**
   (not, primarily, privacy). That pulls compute toward the client.

The instinct "local ML ⇒ Python" makes these feel opposed. They are not.

### What the Python backend actually is (measured)

- **~2,787 LOC of glue**, not ML. Runtime deps: `upstash-redis`, `upstash-search`, `boto3`,
  `pypdf`, `python-dotenv`. Optional: `openai`, `pillow`+`pillow-heif`, `fastapi`, `psycopg`.
- **No local ML exists yet.** `embedding.py` is a `FakeEmbedder` (hashes tokens into buckets);
  its own comment says the real on-device model "lands in a follow-up." Real semantic embedding is
  currently done **server-side by Upstash Search**.
- **Zero `torch`/`transformers`/`numpy`/`cv2`/`sklearn`.** The only Python-specific import in the
  whole tree is a **lazy, optional `pytesseract`** behind a pluggable OCR seam with a vision-model
  fallback.
- Every dependency has a first-class TS equivalent, several **TS-native** (Upstash ships TS SDKs;
  `boto3`→AWS SDK for JS; `pypdf`→`unpdf`; `psycopg`→Drizzle, which the desktop already uses).

### The packaging fact that flips the intuition

Shipping **Python inside Electron** (PyInstaller/PyOxidizer, per-platform signing, size, a Node↔Py
bridge) is a distribution nightmare. Node, by contrast, has **mature native ML addons** —
`onnxruntime-node`, `node-llama-cpp`, `whisper.cpp` bindings, `sharp` (libvips), `tesseract.js`,
HF `tokenizers` (itself Rust via napi-rs) — that run in the **Electron main process** with full
**Metal/CUDA acceleration**. For *inference of existing models*, TS + native addons is the
**easier** local-first path, not a compromise. And **libSQL already in our deps has native vector
search** (DiskANN, offline, no extension) — the local vector store needs no new infrastructure.

## Options considered

Legend: ✅ strong · ⚠️ caveats · ❌ poor

| Option | One language | On-device fit | Ships in Electron | Throws away working code | Aligns with local-for-speed |
|---|---|---|---|---|---|
| **A. Status quo — Python FastAPI cloud backend** | ❌ Py + TS | ❌ server-side, network-bound | n/a (separate service) | ✅ keeps it | ❌ |
| **B. Port backend to TS, keep cloud-server shape** | ✅ TS | ⚠️ still a network hop | n/a | ⚠️ rewrite, same shape | ⚠️ partial |
| **C. All-TS + on-device pipeline in Electron main; cloud = offload/sync** *(recommended)* | ✅ TS | ✅ local-first | ✅ native addons | ⚠️ rewrite, but small + activates existing design | ✅ |
| **D. Polyglot — Python for ML, TS for app** | ❌ worst of both | ⚠️ Py-in-Electron packaging hell | ❌ | ✅ | ⚠️ |

### Notes

- **A** — Works today (verified live: S3 + Upstash + vision + todos). But it's network-bound, two
  languages, and the deferred-deploy + auth complexity all stem from it. Fine as the *fallback
  service*, not the core.
- **B** — Removes the language split but keeps a round-trip to a server; doesn't deliver the
  speed/offline goal. A way-station at best.
- **C — recommended** — The pipeline (ingest → preprocess → OCR/caption/transcribe → **embed
  locally** → index in **libSQL vector**) runs in the **main process**, surfaced to the renderer
  over the **IPC seam already built** (`window.api.*`). No HTTP server on the local path. Cloud
  demotes to **(i) offload** for what a device can't do well (large VLM caption, big chat LLM) and
  **(ii) sync** via **Turso embedded replicas** (same libSQL driver — no rewrite). This is *not*
  new architecture: ADR 0001 records that libSQL was chosen **deliberately** to enable exactly this
  ("local-first now → sync later"), with sqlite-vec/LanceDB already "planned." C **activates the
  design we already chose** and had parked.
- **D** — Rejected. Combines the language split *and* the Python-in-Electron packaging pain.

## Capability → on-device TS mapping

| Pipeline stage | On-device TS |
|---|---|
| Raw/file store | local filesystem (content-hash) |
| Metadata + todos | **libSQL** (already in main process) |
| Vector index + search | **libSQL native vector** (DiskANN, offline) |
| Embeddings | `transformers.js` / `onnxruntime-node` (e.g. EmbeddingGemma, bge-small) |
| OCR | `tesseract.js` (WASM) or native binding; vision-model fallback |
| Image prep (EXIF/dims/**HEIC**) | `sharp` (libvips) — ⚠️ HEIC decode is the one "verify" item |
| Audio transcription | `whisper.cpp` node bindings / `transformers.js` whisper |
| Vision caption / chat | `node-llama-cpp` (small VLM/LLM) **or cloud offload** |
| PDF text | `unpdf` / `pdfjs-dist` |

## Performance strategy / native escape hatch

- **Default: TypeScript** for app, orchestration, IPC, UI, glue.
- **Consume native freely.** The perf-critical work is already compiled native (ONNX/C++,
  libvips/C, llama.cpp/C++, HF `tokenizers`/Rust). "Rust-class performance behind a TS API" is the
  native-addon ecosystem — we get it without writing Rust.
- **Hand-written Rust only behind a *profiled* bottleneck**, per-function, never as a pillar:
  **napi-rs** when it's main-process/server-only (prebuilt binaries, slots into our existing
  `electron-builder` native-addon rebuild; async bridges to JS Promises); **WASM** (`wasm-bindgen`/
  `wasm-pack`) when the same code must also run in the renderer or mobile. `Tokio` only if that
  Rust does concurrent async I/O — CPU-bound work wants a thread pool (`rayon`), not an async
  runtime. Candidate hot paths *if profiled*: bulk file hashing (`blake3`), custom vector
  quantization — likely **none needed at current scale**.
- ⚠️ **Naming collision:** the Rust→Node binding crate **Neon** (neon-bindings) is *not* **Neon**
  the database / Neon Auth. Never write bare "Neon" for the binding in this codebase.

## Consequences

- **Easier:** one language across desktop + future mobile + any backend; the auth story collapses
  (see below); local-first speed/offline; shared types/validation (zod); the typed API client can
  become a shared package or tRPC instead of OpenAPI codegen; **libSQL vector means no new infra**.
- **Harder / risks:**
  - **Device variance** — Apple Silicon flies; old Intel / GPU-less Windows will crawl on
    embeddings/ASR/LLM. "Everything local" really means "everything the device can handle, cloud
    fallback otherwise" → we still build the offload path.
  - **App size / model downloads** — don't bundle multi-GB models; lazy-download on first use + cache.
  - **Native-addon packaging** — `onnxruntime-node`/`node-llama-cpp`/`sharp` need per-platform
    prebuilt binaries + `electron-rebuild` (muscle exists — we already rebuild `better-sqlite3`),
    but the CI matrix grows.
  - **Model quality** — on-device models < cloud frontier models; the offload path covers
    quality-sensitive cases.
  - **Ownership** — it's the other contributor's pipeline; this is a coordination decision, and a
    rewrite (even a small one) discards working, tested code.

## Effect on the other ADRs

- **[[0002-authentication]] gets easier and later.** If the local path is the source of truth and
  single-user, auth is only needed for the **sync/cloud** path — so it **defers until sync is
  turned on**, and Better Auth (TS) becomes the backend's **in-process** auth then. The
  managed-vs-self-hosted / cross-language JWKS fork largely dissolves.
- **[[0001-sync-and-processing-architecture]] is activated, not contradicted.** Its libSQL +
  Turso-embedded-replica plan *is* the sync story here. Its "compute offload via TEEs/trusted
  cloud" axis *is* the offload path. Note the **motivation shift**: 0001 framed local-first as
  *privacy*; here it's *speed/latency/offline* (privacy is a welcome side effect, not the driver).

## Recommendation

**Adopt Option C: go all-TypeScript and move the pipeline on-device into the Electron main process,
with cloud as an optional offload + sync layer.** Retire Python from the core (it may live on
briefly as the offload service until that's also TS, or be replaced by direct provider calls).
**Gate on a spike** (below) to prove the local embed + vector path and measure real per-device
latency before committing the rewrite. Coordinate with the pipeline's owner first.

## Action items

1. [ ] **Spike (go/no-go):** in the Electron **main process**, fully offline — capture a note →
       embed locally (`transformers.js`/`onnxruntime-node`) → store vector in **libSQL** →
       semantic search locally, surfaced via the existing IPC seam. Measure cold-start + query
       latency on a target low-end device, not just Apple Silicon.
2. [ ] **HEIC decode check** — confirm `sharp` (or `heic-convert`) handles iPhone HEIC in our
       Electron build (the one image-prep risk).
3. [ ] **Coordinate** with the Python pipeline's owner on ownership + sequencing.
4. [ ] **Pick the backend shape for offload/sync** — Hono service vs. Next/Vercel functions vs.
       direct-from-client provider calls; decide what (if anything) the cloud still runs.
5. [ ] **Port incrementally** behind the IPC seam: local store + search first (highest speed win),
       then ingest/extract, then offload fallback. Re-point/retire `VITE_NEEME_API_URL` per stage.

## Open questions

- Real on-device **latency on weak hardware** — where's the line that triggers cloud fallback?
- **Which models** (embedder, ASR, OCR, optional VLM/LLM) and their **download sizes** — bundled vs
  lazy?
- Does "everything local" include a **local chat LLM** (heavy, `node-llama-cpp`) or is that always
  cloud-offload?
- Migration of **existing cloud data** (Upstash/S3) to local stores, or start fresh on-device?
- Does the offload service stay **Python** short-term, or is the rewrite atomic?

## Sources

- libSQL native vector (DiskANN, on-device, offline) — https://turso.tech/vector · https://turso.tech/blog/turso-brings-native-vector-search-to-sqlite · https://turso.tech/blog/local-first-ai-assistant-kin-leverages-tursos-libsql-for-on-device-native-vector-search
- On-device TS inference — https://huggingface.co/blog/transformersjs-v3 · https://developers.googleblog.com/introducing-embeddinggemma/ · https://vpawar.hashnode.dev/offline-first-react-apps-local-ai
- Rust-in-Node — napi-rs (https://napi.rs) · Neon bindings (https://neon-bindings.com) · node-bindgen · wasm-bindgen/wasm-pack
- Backend inventory — measured from `/Users/jlee/src/retrospct/neeme` (deps, `embedding.py`, `ocr.py`, import scan), 2026-06-01
