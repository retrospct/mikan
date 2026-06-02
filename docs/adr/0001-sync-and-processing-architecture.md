# ADR 0001 — Sync & processing architecture for neeme

**Status:** Proposed — sync *mechanism* decided (**Turso / libSQL embedded replicas**, aligning with [[0003-all-typescript-on-device-pipeline]] + the sync plan); supersedes this ADR's original "Exploring" Jazz/E2E lean for the *mechanism* question. **Privacy posture is NOT yet decided** — see the sign-off callout in the Update below.
**Decision status:** **proposed, awaiting sign-off.** The mechanism (Turso) is settled; the **privacy-posture trade-off (trusted-cloud at-rest vs zero-knowledge/E2E) is a human decision and is still open.** Do not treat this ADR as Accepted until that is signed off.
**Date:** 2026-06-01 (rev. 2 — 2026-06: reconciled with ADR 0003; recorded the driver shift privacy → speed/offline; chose Turso embedded replicas as the sync mechanism; flagged the privacy posture for human sign-off)
**Context owners:** jlee (+ Claude)
**Related:** reframed by [[0003-all-typescript-on-device-pipeline]]; implementation plan in [docs/plans/sync-cloud-offload.plan.md](../plans/sync-cloud-offload.plan.md); see also [[0002-authentication]]

## Update (2026-06) — Decision: Turso embedded replicas for sync (driver: speed/offline)

> This section is the current decision. Everything from [## Problem](#problem) downward is the **original research** (June 1) that this Update resolves — it is preserved as the record, not overwritten. The Update *selects among* the options that research laid out, under a driver (speed/offline) that the original draft had not yet fixed.

**What changed.** This ADR opened in "Exploring," and its original *recommendation* (below) leaned **Jazz / E2E-encrypted CRDT** for a private peer-sync axis, filing **Turso/libSQL embedded replicas** only as a conditional *trusted-cloud system-of-record* "if we accept the cloud holding a readable primary." Two things have since settled the **mechanism** question:

1. **[[0003-all-typescript-on-device-pipeline]]** reframed the local-first driver from **privacy → speed / latency / offline** (privacy is a welcome side effect, not the driver), and explicitly endorsed **Turso embedded replicas** as the sync story — the *same* `@libsql/client` driver nimi already uses, so it needs **no data-layer rewrite**.
2. The **[sync / cloud-offload plan](../plans/sync-cloud-offload.plan.md)** scored five realistic sync approaches (Turso embedded replicas · self-hosted libSQL · Postgres + local cache · CRDT/sync-engine · roll-your-own oplog) against nimi's *actual* constraints — libSQL is already the local store, native vector search lives in the DB, TS-everywhere, offline-first — and landed on **Turso embedded replicas** as the default, with a **self-hosted libSQL server** as the no-lock-in fallback on the *identical* code path.

**Resolution (mechanism).** For single-user multi-device sync, nimi adopts **Turso / libSQL embedded replicas** (Option 4 in the table below), **not** Jazz/E2E (Option 2). One-line rationale: the local store *is* libSQL and the vector index *is* a libSQL-native feature chosen on purpose ([[0003-all-typescript-on-device-pipeline]]), so Turso is the **only path with zero engine/data-model change** — and because the self-hosted `sqld` fallback shares the exact code path, "managed Turso now → self-host later" is a config change, not a re-platform. Concrete shape (from the plan): opt-in `NEEME_SYNC` flag, **database-per-user** isolation (replicas mirror the whole DB, so row-scoping can't isolate across devices), the **vector index kept local-only and recomputed per device** (re-derivable, never synced), and a small TS token-broker bridging Logto identity → a DB-scoped Turso token.

### The premise that, if it flips, flips the decision

0001's *original* driver was **privacy**. Under a privacy-first premise the decision **inverts**: **Jazz / Automerge + an encrypted relay (E2E / zero-knowledge)** would lead, and Turso would drop back to a trusted-cloud fallback for re-derivable data only. The Turso decision above is correct **only while speed/offline is the driver** (per 0003). **If privacy becomes the product driver, reopen this ADR toward the E2E/CRDT track.**

> ⚠️ **PENDING HUMAN SIGN-OFF — privacy posture: trusted-cloud (at-rest) vs zero-knowledge (E2E)**
>
> Turso embedded replicas are **encryption-at-rest under a trusted cloud — NOT zero-knowledge / E2E.** The cloud holds a **readable primary** (readable *with* the at-rest `encryptionKey`); the host (Turso, or whoever runs `sqld`) can in principle read user content. **This reverses this ADR's original privacy lean** and is a genuine product decision that must not be made unilaterally — so it is flagged here rather than declared Accepted.
>
> - **Trusted-cloud (what the Turso mechanism gives us — proposed):** simplest, zero data-layer change, ships ROADMAP #10 now on infra nimi already uses. **Cost:** the host *could* read plaintext; privacy rests on operator trust + at-rest encryption, not a cryptographic guarantee.
> - **Zero-knowledge / E2E (0001's original lean):** the server only ever holds ciphertext; clients hold keys. **Cost:** abandon the libSQL/Turso sync path, adopt **Jazz** (its own cojson data model alongside libSQL for vector search) or **Automerge/Yjs + an encrypted relay** (build the encryption + transport yourself); more build + ops, younger ecosystem, weaker desktop/RN maturity story, and the on-device vector index still has to live in libSQL.
>
> **Recommended for #10 / v1 (proposed, awaiting sign-off):** accept **trusted-cloud** — scoped so the synced primary carries **items/todos** while **raw embeddings/vectors stay local-only and re-derivable**, minimizing what leaves the device — and **revisit E2E if/when privacy becomes the product driver.** This status moves to **Accepted** only after jlee signs off on the trusted-cloud posture; otherwise reopen toward the E2E track above.

## Problem

neeme is privacy-first and data-ownership-first. We want to:
1. **Process locally** as much as possible; use cloud/external only when unavoidable.
2. **Sync a user's data across *their own* devices** (single-user multi-device — not multi-user collaboration).
3. When cloud processing *is* unavoidable (embeddings, OCR, big-model inference), act as a **trusted, secure intermediary** — ideally without the server reading plaintext.

Stack today: Electron (desktop) + React Native/Expo (mobile, planned) + local libSQL/SQLite via Drizzle + a Python FastAPI backend for processing.

**User's stated lean:** prototype **peer/device-to-device first**, keep **trusted-cloud** as the known-good fallback, and **expect to need both** — because some processing simply can't run on-device.

## The key distinction (why "both" is likely correct)

Two different problems often conflated:

- **Sync** = move a user's data between *their* devices. Peer-to-peer or a dumb relay can do this with zero plaintext exposure.
- **Compute offload** = run work the device can't (embeddings on a large model, heavy OCR). This fundamentally needs *some* server to see *something* — unless you use advanced crypto (FHE/enclaves, see below).

Peer sync solves the first and does **nothing** for the second. This is why even pure local-first apps that touch AI end up with a trusted-server story. The user's "we'll need both" is the correct read.

## Options evaluated

Legend: ✅ strong fit · ⚠️ partial/caveats · ❌ poor fit

| Option | Single-user multi-device | Zero-knowledge / E2E | Conflict model | Offline | Electron + RN | Ops burden | Maturity (2026) |
|---|---|---|---|---|---|---|---|
| **1. ElectricSQL + PGlite** | ⚠️ works but built for read-path fan-out | ❌ Postgres/Electric see plaintext | Shapes (partial replicas); **read-path only**, you build writes | ✅ (PGlite local) | ⚠️ Electron yes; **RN not documented** | ⚠️ run Electric (Elixir) + Postgres | ✅ v1.1 (2025), self-built storage engine, fast |
| **2. Jazz (jazz.tools)** | ✅ designed for it | ✅ **E2E encrypted by default; sync mesh sees only ciphertext** | CRDT (cojson) | ✅ | ✅ **Expo/RN + TS** (Electron via TS; not first-class-named) | ✅ Jazz Cloud **or self-host** | ⚠️ young but real, batteries-included |
| **3. Automerge / Yjs + relay** | ✅ (CRDTs are device-agnostic) | ⚠️ possible (e.g. Matrix transport offers E2EE) but **you build it** | CRDT | ✅ | ✅ Automerge=Node/Electron; Yjs+op-sqlite on RN | ⚠️ you run/choose a sync server | ✅ mature libs; sync server is your call |
| **4. Turso / libSQL embedded replicas** | ⚠️ replica↔cloud-primary, not peer mesh | ❌ encryption *at rest*, **not** zero-knowledge (cloud holds primary) | Last-write-ish; primary is source of truth | ✅ (local replica) | ⚠️ SDKs: Node/Go/Rust; **RN support weaker** | ✅ managed Turso | ✅ **GA** (2025), we already use libSQL |
| **5. Vercel Workflows SDK / durable workflows** | ❌ not a sync engine | n/a (orchestration) | n/a | ❌ | n/a (server-side) | ⚠️ Vercel-hosted | ✅ but **wrong tool for sync** — fits *processing orchestration* |
| **6. Roll-your-own E2E sync ("we are the trusted cloud")** | ✅ exactly this | ✅ **you guarantee it** (store only encrypted blobs) | Your choice (CRDT or LWW) | ✅ | ✅ (your client code) | ❌ you build + run it all | ⚠️ most control, most work |

### Notes per option

1. **ElectricSQL/PGlite** — Elegant *read-path* sync (Postgres → local via "shapes"). But: **no E2E** (Electric and Postgres read plaintext), **writes are your problem** (4 documented patterns), and **React Native isn't a documented target**. Great for Postgres-backed apps that want fast local reads; a poor fit for "server must not see plaintext."

2. **Jazz** — The closest off-the-shelf match to the lean: **E2E encrypted by default**, the sync mesh "only sees encrypted data," **self-hostable** (Jazz Cloud *or* your own server), CRDT conflict resolution, **first-class Expo/React Native**. Caveats: younger ecosystem; it wants you to adopt *its* data model (cojson) rather than your existing libSQL schema; Electron isn't explicitly named (works via TS, needs verifying). **Best candidate for the peer-style prototype.**

3. **Automerge/Yjs + relay** — The "assemble it yourself" CRDT path. Maximum control, mature core libraries, runs on Electron (Automerge) and RN (Yjs + op-sqlite). E2E is *achievable* (the relay can be dumb/encrypted) but **you build the encryption + transport**. More wiring than Jazz, less than full roll-your-own.

4. **Turso embedded replicas** — Tempting because **we already use libSQL**. But the model is *local replica ↔ cloud primary*, so **the cloud holds a readable primary** — encryption is **at rest, not zero-knowledge**. Good for "local-first with a cloud system-of-record," **not** for "server never sees plaintext." Could serve the *trusted-cloud fallback* role, not the private-peer role.

5. **Vercel Workflows SDK** — Not a sync engine at all. It's durable orchestration — the right shape for **coordinating the *processing* side** (ingest → OCR → embed → index as a reliable, retryable pipeline), which is option 6's compute-offload half. File under "processing," not "sync."

6. **Roll-your-own E2E** — A relay/store that only ever holds ciphertext; clients hold keys. Maximum privacy and ownership, fully under our control, but we build *and operate* it (key management, conflict resolution, transport, reliability). This is the **known-good trusted-cloud fallback** the user already trusts.

## The cross-cutting hard part: processing private data server-side

When work *must* leave the device, how do we avoid handing over plaintext? Spectrum, easiest → hardest:

- **Client-side compute, encrypted upload** — do the embedding/OCR *on-device*, upload only encrypted results. Best privacy; limited by device capability (the whole reason we're offloading). *Partial fit.*
- **Split inference** — model partitioned client/server; device computes an intermediate, server finishes. Server sees activations, not raw text. Active research, fiddly. *Emerging.*
- **Confidential computing / TEEs (enclaves)** — data decrypted only inside hardware-isolated memory the host/OS can't read. **Most practical "server processes without truly seeing" path in 2025–26** (Red Hat et al. shipping this for AI inference). *Most viable advanced option.*
- **FHE (fully homomorphic encryption)** — compute directly on ciphertext (e.g. HE-LRM for embedding lookups). Strongest guarantee, still **too slow for general semantic search** today. *Not yet practical.*
- **Encrypted-search schemes (e.g. Compass, CESSE)** — purpose-built secure semantic search over encrypted vectors. Promising, research-stage. *Watch.*

**Takeaway:** for v1, the realistic privacy-preserving offload is **(a) do embeddings on-device when feasible, else (b) trusted-cloud + TEEs** for the unavoidable heavy lifting. FHE/encrypted-search aren't ready to depend on.

## Inspiration: Vercel Workflow Dev Kit (WDK) and "Worlds"

WDK is the **processing/compute-offload axis** (option 5 reframed as inspiration, not a sync tool). Patterns worth stealing for neeme:

- **"Worlds" = a backend adapter seam.** The same workflow code runs against a **Local World** (virtual infra, no cloud — dev) or a **Vercel/custom World** (prod). A World supplies exactly three things: an **event log**, **compute**, and a **queue**. This is the *same instinct* as our `src/shared/ipc.ts` boundary — define the contract, swap the implementation. It's the clean way to honor "local first, cloud only when unavoidable": **the same ingest pipeline runs locally or offloads to cloud just by switching Worlds.** Notably, the community has already published a **Jazz World** (WDK's event log on Jazz) — the processing axis and the private-sync axis connect at this exact seam.
- **Event log + deterministic replay.** Each `use step` records input/output to an event log; on crash/redeploy it replays completed steps without re-running them → idempotent, durable, resumable (pause for minutes or months). Our ingest→OCR→embed→index flow *is* this shape; adopting it (even hand-rolled) makes the pipeline crash-safe and makes "step X local, step Y cloud" a per-step choice. The event-log-of-ops model also rhymes with a CRDT op-log, which is why it bridges naturally to Jazz/Automerge.
- **Encryption posture validates the trusted-cloud direction.** WDK "encrypts all data — step inputs, outputs, stream chunks — before they leave your deployment; decryption only happens inside the deployment running the workflow." That's the **TEE-style "process without the host seeing plaintext"** pattern from the section above — shipping in a mainstream product, not just research.

**Synthesis:** **WDK = processing axis · Jazz = sync/private-data axis · "Worlds" = the conceptual bridge** that lets the same code target local-vs-cloud per environment. A strong template for neeme's "we'll need both" architecture — don't necessarily adopt WDK itself, but copy the World-seam + event-log-replay shape.

## Recommendation (for prototyping, not a final decision)

> **Superseded for the mechanism choice by the [Update (2026-06)](#update-2026-06--decision-turso-embedded-replicas-for-sync-driver-speedoffline) above.** This was the original *privacy-driver* recommendation (lean Jazz for the peer/E2E axis). Once ADR 0003 fixed the driver as **speed/offline**, the mechanism flipped to **Turso embedded replicas**; this text is kept as the record of what the privacy-first path would have been (and is the path to revive if privacy later becomes the driver).

Mapping to the user's lean — *peer first, trusted-cloud fallback, probably both*:

1. **Peer-style prototype → start with Jazz.** It's the fastest path to a real E2E-encrypted, self-hostable, multi-device, CRDT sync that runs on Expo/RN. If it fits neeme's data model, it covers the "sync between the user's devices, we never see plaintext" goal cheaply. Fallback within this lane if Jazz's model chafes: **Automerge/Yjs + a dumb encrypted relay**.
2. **Trusted-cloud fallback → it already exists in spirit.** The current FastAPI backend *is* the trusted intermediary. Harden it toward **encrypted-blob storage + TEE-based processing** when on-device isn't enough. **Turso embedded replicas** are a reasonable system-of-record here *if* we accept the cloud holding a readable primary (acceptable for non-sensitive or re-derivable data like the rebuildable vector index — **not** for raw private content).
3. **Processing orchestration is a separate axis.** Whatever sync we pick, the ingest→OCR→embed→index pipeline wants durable orchestration (Vercel Workflows / Temporal-style). Don't conflate it with sync.
4. **Keep the seam.** The IPC boundary (`src/shared/ipc.ts`) + the typed API client mean we can prototype Jazz *behind the same renderer surface* without UI rework — exactly what it's for.

### Suggested next concrete step
A throwaway spike: Jazz storing neeme "memories" across two devices, self-hosted sync server, confirm (a) it runs in Electron + Expo, (b) the server only sees ciphertext, (c) the CRDT model fits a memory note. Time-box it; if Jazz's data model fights libSQL too hard, pivot to Automerge + relay.

## Open questions
- Does Jazz coexist with our libSQL/Drizzle local store, or does adopting it mean *replacing* the local data layer? (Likely the biggest decision.)
- Electron support for Jazz — works via TS, but verify storage/persistence on desktop.
- Where's the line between "re-derivable, cloud-OK" data (vector index) and "never leaves encrypted" data (raw captures)?

## Sources
- Jazz — https://jazz.tools/ · https://jazz.tools/docs · https://jazz.tools/docs/react/core-concepts/sync-and-storage · https://jazz.tools/llms.txt
- ElectricSQL — https://electric.ax/docs/guides/writes · https://electric.ax/blog/2025/08/13/electricsql-v1.1-released · https://pglite.dev/docs/sync
- Turso/libSQL — https://docs.turso.tech/features/embedded-replicas/introduction · https://turso.tech/blog/embedded-replicas-go-ga-with-production-friendly-upgrades
- CRDTs — https://automerge.org/ · https://www.npmjs.com/package/yjs · https://docs.expo.dev/guides/local-first/
- Encrypted server-side processing — Red Hat confidential computing (https://next.redhat.com/2025/10/23/enhancing-ai-inference-security-with-confidential-computing-a-path-to-private-data-inference-with-proprietary-llms/) · Compass (https://eprint.iacr.org/2024/1255.pdf) · HE-LRM (https://arxiv.org/pdf/2506.18150)
- Vercel WDK / Worlds — https://vercel.com/blog/introducing-workflow · https://vercel.com/blog/a-new-programming-model-for-durable-execution · https://workflow-sdk.dev/ · Worlds: https://workflow-sdk.dev/worlds/vercel · custom/Jazz World referenced via https://github.com/vercel/workflow
