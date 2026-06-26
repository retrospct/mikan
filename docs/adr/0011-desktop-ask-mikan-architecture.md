# ADR 0011 — Desktop "Ask Mikan": cloud reasoning + on-device tool execution

**Status:** 📝 Proposed — Phase 2 of the agent-UI initiative (after [[0010-agent-ui-foundation]]).
**Date:** 2026-06-26
**Context owners:** jlee
**Related:** builds on [[0010-agent-ui-foundation]]; **per-surface split** with
[[0009-mobile-rn-turso-cloud-pipeline]] (mobile keeps server-side tools); reconciles
[[0003-all-typescript-on-device-pipeline]] (desktop stays on-device) with cloud reasoning;
requires auth from [[0002-authentication]] (Logto, shipped ROADMAP #9); reuses `services/mastra`
(`nimiAgent`).

## Problem

We are adding a conversational agent surface to the **desktop** app. ADR-0009 already defined a
cloud agent for **mobile** (Mastra on Vercel; `search-memories` + `add-todo` tools query the user's
Turso DB server-side) and noted "in the future the desktop renderer will call the same endpoint."

Calling it *the same way* fights desktop's nature:

- Desktop is **local-first** (ADR-0003): it has an on-device libSQL vector store; mobile does not.
- Sync to Turso is **opt-in** (ROADMAP #10). The **default desktop user has no cloud copy**, so a
  server-side `search-memories` against Turso would find **nothing**.
- Desktop's posture demands a **transparent, minimal-egress** privacy contract.

So the desktop agent needs its own data-access and trust model — not a copy of mobile's.

## Decision

### 1. Surface: the evolved global search overlay ("Ask Mikan")

"Ask Mikan" **is** the existing global search overlay (header magnifier + shortcut), not a new tab —
it fits the narrow centered-column app. **Escalation model:** instant **on-device search stays the
default**; "Ask Mikan" *escalates* the same query to the agent. No key/offline → the overlay is
plain local search (today's behavior).

### 2. Privacy contract: opt-in, transparent, no nagging

- **Default OFF**; one-time opt-in in Settings. Persistent **cloud-mode indicator** + a **"what was
  sent" disclosure**. **No per-action prompts.**
- **Only retrieved snippets + the query leave the device** — never the whole store.

### 3. Data access: cloud reasoning + **on-device tool execution**

The cloud agent **reasons**; data access stays on the device. Phased:

- **v1 — client-grounded retrieval:** the overlay's on-device search produces top-K snippets; the
  client sends **[query + snippets]** to the agent, which reasons over the supplied context.
- **v1 — `addTodo` as an approval-gated client tool:** the agent emits an `addTodo` tool call; the
  **client renders an approval UI** and, on approve, executes it locally via `window.api` against
  libSQL. (Reads need no confirmation; writes do.)
- **Later — on-device `searchMemories` tool:** let the agent call a `searchMemories` tool that the
  **renderer executes on-device** (multi-hop, still local). **Gated on a spike**: Mastra runs tool
  `execute` server-side by default; forwarding a tool call out to the client mid-loop (AI-SDK
  client-tool pattern) must be verified through Mastra.

**Mobile is unchanged** — no local store, so it keeps the **server-side** tools of ADR-0009.

### 4. Endpoint, auth, and keys

- The client talks only to an **authenticated endpoint that streams AI-SDK UI messages**
  (`@mastra/ai-sdk`). The backend **host is swappable** (Vercel/Inngest vs Cloudflare/Hono) behind
  that contract — the bake-off does not touch the client.
- **Auth:** desktop calls `/api/mastra` with its **Logto session token** (verified server-side via
  JWKS before any model spend). "Opt-in" = signed-in + feature enabled.
- **Keys never ship in the client.** Electron `asar` and RN bundles are trivially unpacked.
  - **Hosted model:** provider/AI-Gateway keys live **only** in the backend runtime's secrets.
  - **BYO-key (optional, the end-user's own):** stored in **OS secure storage** (Electron
    `safeStorage`/Keychain, RN SecureStore), forwarded to the backend per request over TLS.
- **Abuse control:** a hosted model means we pay for signed-in users' calls → `/api/mastra` needs
  **rate-limits / usage quotas**.

### 5. Threads persist in **local libSQL**

Conversation threads live **on-device** (private, offline-readable). The server agent stays
**stateless**; the client supplies prior turns as context. (Mobile may use Mastra cloud Memory.)

## Architecture diagram

```
Electron renderer ("Ask Mikan" overlay)
  │  on-device search (default) ── libSQL vector store (local) ──┐
  │                                                              │ top-K snippets
  ▼  escalate (opt-in, signed-in)                                │
  POST /api/mastra  [Logto JWT] + [query + snippets]             │
  │     (host swappable: Vercel/Inngest | CF/Hono)               │
  ▼                                                              │
  Mikan-agent (Mastra, Claude via hosted key OR forwarded BYO-key)│
  │  reasons; streams AI-SDK UI messages                         │
  │  addTodo tool-call ──────────► client approval UI ──► window.api → libSQL (local write)
  └─ (later) searchMemories tool ─► client executes on-device ───┘
  threads persisted in local libSQL · server stateless
```

## Options considered

| Axis | Chosen | Rejected alt | Why |
|---|---|---|---|
| Surface | Evolve search overlay (escalation) | New "Ask" nav tab / side panel | Fits centered column; preserves fast local search |
| Data access | On-device tool exec (client-grounded v1) | Server-side tools vs Turso | Default desktop has no cloud copy; minimal egress; sidesteps encryption gap |
| Model/keys | Hosted + optional BYO, **server-held** | Ship a provider key in the client | `asar`/bundle extraction exposes any client secret |
| Threads | Local libSQL | Mastra cloud Memory | Local-first, offline, no extra dependency |
| Consent | Opt-in + transparent, no per-action | Per-action prompts / always-on | Trust without nagging; respects ADR-0003 ethos |

## Consequences

### Positive
- Works for **every** desktop user (synced or not) because retrieval is local.
- **Minimal egress** + auditable "what was sent" — coherent with ADR-0003.
- **No company key in the client**, on either Electron or RN.
- Backend bake-off (Inngest/Vercel vs Hono/Cloudflare) proceeds **behind a stable client contract**.
- Reuses the on-device search (ADR-0010 overlay) and `window.api` write seam already shipped.

### Negative / trade-offs
- **Per-surface divergence:** desktop (client tools) vs mobile (server tools) = two agent
  configurations to keep coherent.
- **Multi-hop search is unproven via Mastra** — needs the client-tool-forwarding spike; v1 ships
  single-shot client-grounding without it.
- **Hosted-model cost/abuse:** requires rate-limiting/quota work on `/api/mastra`.
- **Encryption-at-rest is a known partial gap** (v1.1): not relied on here (data access is local),
  but server-side retrieval would have needed it — a reason the per-surface split is safer now.
- BYO-key adds a secure-storage + key-forwarding path to build and test on two platforms.

## Phase 2 checklist (not yet done)

- [ ] Build the "Ask Mikan" overlay (escalation from on-device search) on the 0010 foundation.
- [ ] Stream contract: `@mastra/ai-sdk` UI-message stream consumed by the renderer (assistant-ui).
- [ ] `/api/mastra`: verify Logto JWT (JWKS) + rate-limits/quotas before model spend.
- [ ] v1 client-grounded retrieval: send top-K local snippets + query.
- [ ] `addTodo` as an approval-gated client tool executed via `window.api`.
- [ ] Hosted-key path (backend secret) + optional BYO-key via OS secure storage, forwarded server-side.
- [ ] Persist threads in local libSQL; keep the server stateless.
- [ ] Settings opt-in (default OFF) + cloud-mode indicator + "what was sent" disclosure.
- [ ] **Spike:** can Mastra forward a tool call to the client for on-device `searchMemories`?
