# PRD — "Ask Mikan" desktop agent surface (Phase 2)

> Draft for review. Encodes [ADR-0011](../adr/0011-desktop-ask-mikan-architecture.md).
> **Depends on** the Phase 1 foundation (`agent-ui-foundation.prd.md`, ADR-0010).
> Status: not yet published to Linear.

## Problem Statement

My Mikan memory store keeps growing, but I can only *search* it — I can't have a conversation with
it or ask Mikan to act on what it finds (e.g. "turn this into a to-do"). I want a conversational
"Ask Mikan" that can reason over my memories and take simple actions — but Mikan is a local-first
app, and I don't want my private memory store silently leaving my device to get that. Today there
is no conversational surface at all, and the cloud agent that exists (`services/mastra`) was
designed for mobile, which has no on-device data.

## Solution

Evolve the existing global search overlay into **"Ask Mikan"** with an **escalation model**: instant
on-device search stays the default, and — only when I opt in — I can *escalate* a query into a
conversation with the cloud **Mikan-agent**. The agent does the **reasoning in the cloud** but
**data access stays on my device**: retrieval runs on-device and only the query plus the retrieved
snippets leave; when the agent wants to add a to-do, it proposes one I **approve**, executed
locally. It's **off by default**, transparent about what was sent, and **never ships any API key in
the app**. Offline or signed-out, the overlay is simply local search — exactly as today.

## User Stories

1. As a Mikan user, I want to ask my memory store questions in natural language, so that I can
   recall and synthesize what I've captured without crafting search terms.
2. As a Mikan user, I want instant on-device search to remain the default when I open the overlay,
   so that the fast local path I rely on never gets slower.
3. As a Mikan user, I want to *escalate* a query into a conversation with Ask Mikan, so that I move
   from "find" to "ask" without leaving the surface.
4. As a privacy-conscious user, I want Ask Mikan off by default, so that nothing leaves my device
   until I explicitly choose it.
5. As a privacy-conscious user, I want a one-time opt-in in Settings, so that I enable cloud
   reasoning deliberately and once, not per action.
6. As a privacy-conscious user, I want a persistent "cloud mode" indicator while Ask Mikan is
   active, so that I always know when reasoning is happening in the cloud.
7. As a privacy-conscious user, I want a "what was sent" disclosure, so that I can see exactly which
   query and which snippets left my device.
8. As a privacy-conscious user, I want assurance that only retrieved snippets — never my whole
   store — are sent, so that enabling the agent doesn't mean uploading everything.
9. As a Mikan user, I don't want per-action confirmation prompts for cloud calls, so that the
   experience isn't naggy once I've opted in.
10. As a Mikan user, I want Ask Mikan to ground its answers in my actual memories, so that responses
    are about my data, not generic.
11. As a Mikan user, I want Ask Mikan to cite or reference the snippets it used, so that I can trust
    and verify its answers.
12. As a Mikan user, I want Ask Mikan to propose a to-do when it makes sense, so that a conversation
    can turn into action.
13. As a Mikan user, I want to approve a proposed to-do before it's created, so that the agent never
    writes to my data without my consent.
14. As a Mikan user, I want approved to-dos written locally just like manual ones, so that
    agent-created and hand-created to-dos are indistinguishable in my backlog.
15. As a Mikan user, I want my Ask Mikan conversations to persist between sessions, so that I can
    return to an earlier thread.
16. As a privacy-conscious user, I want my conversation threads stored on my device, so that my
    chats stay private and available offline.
17. As a Mikan user offline or signed out, I want the overlay to degrade gracefully to local search,
    so that the surface is always useful even without the agent.
18. As a Mikan user, I want Ask Mikan to require sign-in, so that the cloud feature is tied to my
    account.
19. As a cost-conscious user, I want the option to bring my own API key, so that I can control
    cost and provider.
20. As a security-conscious user, I want assurance that no provider key is bundled in the app, so
    that unpacking the Electron/RN binary can't leak a key.
21. As a BYO-key user, I want my key stored in my OS secure storage and used server-side, so that
    my key isn't exposed in the client and isn't bundled.
22. As the operator, I want the agent endpoint to verify my session token before spending model
    tokens, so that only authenticated users incur cost.
23. As the operator, I want rate-limits/usage quotas on the hosted model, so that abuse or runaway
    usage is bounded.
24. As the operator, I want the backend host (Vercel/Inngest vs Cloudflare/Hono) to be swappable
    behind a stable streaming contract, so that the platform bake-off doesn't touch the client.
25. As a maintainer, I want the agent's tool execution to reuse existing on-device interfaces
    (search, add-to-do), so that I add the smallest possible new surface.
26. As a maintainer, I want desktop to differ from mobile by design (client-side vs server-side
    tools), so that each surface uses the data path that fits it.
27. As a future-facing maintainer, I want a path to multi-hop on-device search, so that the agent
    can iteratively refine retrieval later without changing the privacy model.

## Implementation Decisions

- **Surface:** "Ask Mikan" *is* the evolved global search overlay (header magnifier + shortcut), not
  a new nav destination. **Escalation model:** on-device search is the default; an explicit action
  escalates the query to the agent.
- **Consent / privacy:** **default OFF**; one-time opt-in in Settings. While active: persistent
  **cloud-mode indicator** + **"what was sent" disclosure**. **No per-action prompts.** Only the
  query + retrieved snippets leave the device.
  - Consent states: `OFF` (default; overlay = local search only) → opt-in → `ON`; `ON` while
    offline/signed-out degrades to local search (no egress).
- **Data access — cloud reasoning + on-device tools (phased):**
  - **v1 retrieval (client-grounded):** the overlay's on-device retrieval (the existing
    `window.api.pipeline.search` interface) produces top-K snippets; the client sends
    **query + snippets** to the agent, which reasons over the supplied context.
  - **v1 write (`addTodo`, approval-gated client tool):** the agent emits an `addTodo` tool call;
    the client renders an **approval UI** and, on approve, executes it locally via the existing
    `window.api.todos.add` interface. Reads need no confirmation; writes do.
  - **Later (multi-hop):** expose an on-device `searchMemories` tool the renderer executes locally.
    **Gated on a spike**: confirm Mastra can forward a tool call to the client mid-loop (the AI-SDK
    client-tool pattern); Mastra runs tool `execute` server-side by default.
- **Transport / endpoint:** the renderer talks only to an **authenticated endpoint that streams
  AI-SDK UI messages** (`@mastra/ai-sdk`) at `/api/mastra`. The backend **host is swappable**
  (Vercel/Inngest vs Cloudflare/Hono) behind that contract.
- **Auth:** desktop authenticates with its **Logto session token** (the existing
  `window.api.auth.getAccessToken` interface), **verified server-side (JWKS)** before any model
  spend. "Opt-in" = signed-in + feature enabled.
- **Keys:** **never in the client.** Hosted-model keys live only in the backend runtime's secrets.
  Optional **BYO-key** (the end-user's own) is stored in **OS secure storage** and forwarded to the
  backend per request over TLS.
- **Abuse control:** hosted model requires **rate-limits / usage quotas** on `/api/mastra`.
- **Threads:** persist in **local libSQL** (on-device); the server agent stays **stateless** and the
  client supplies prior turns as context.
- **Per-surface split:** mobile (no local store) keeps the **server-side** `search-memories` /
  `add-todo` tools of ADR-0009; this PRD only changes desktop.

## Testing Decisions

- **Good tests assert external behavior** — the contract at the seam, not the agent's wording or
  component internals.
- **One new deterministic test at the one new seam — the stream transport — with a *fake* agent**
  (never live Claude). Assert: (a) the request carries the query + on-device snippets; (b) an
  `addTodo` tool-call raises an approval and, on approve, invokes `todos.add`; (c) the thread is
  persisted in local libSQL; (d) with consent OFF / signed-out, the overlay performs local search
  and **emits no network egress**.
- **Reuse existing integration-test style** (vitest against a temp libSQL with `NEEME_EMBEDDER=hash`)
  for the tool-execution interfaces — `pipeline.search` and `todos.add` are already covered by the
  existing pipeline-service / todo-service tests, so the agent's tool execution rides tested seams.
- **Endpoint:** test that `/api/mastra` rejects unauthenticated/invalid Logto tokens and enforces
  rate-limits before model spend (server-side, with a stubbed model).
- **Live end-to-end (agent-driven, not hand-written):** the real Ask Mikan path (real Claude + auth +
  display) is verified by a **Cursor Cloud GUI agent** running a new
  `docs/testing/ask-mikan-gui-runbook.md` authored from `RUNBOOK-TEMPLATE.md`. Prior art:
  `uncovered-todos-gui-runbook.md` (also needs an AI key + a display) and the `gui-smoke` skill.

## Out of Scope

- **Multi-hop on-device `searchMemories` tool** — deferred pending the Mastra client-tool-forwarding
  spike; v1 ships single-shot client-grounding.
- **Mobile Ask Mikan** — covered by ADR-0009 (server-side tools); unchanged here.
- **Server-side retrieval against Turso for desktop** — explicitly rejected (default desktop has no
  cloud copy; minimal-egress).
- **At-rest encryption changes** — not modified by this PRD; the design deliberately doesn't depend
  on server-side decryption.
- **The component foundation / redesign** — Phase 1 (`agent-ui-foundation.prd.md`).
- **The Figma visual spec** for the overlay.

## Further Notes

- Decisions ratified in [ADR-0011](../adr/0011-desktop-ask-mikan-architecture.md); vocabulary in
  `CONTEXT.md`; reconciles ADR-0003 (on-device) with ADR-0009 (cloud agent) via a per-surface split.
- **Dependencies:** Phase 1 foundation (composer/message/approval primitives); the Mastra
  client-tool spike is a prerequisite only for the *multi-hop* enhancement, not for v1.
- The `services/mastra` `nimiAgent` already exists (ADR-0009 Phase-0 spike validated the
  tool-calling loop); this PRD repurposes it for desktop with client-executed tools.
- Hosted-model cost is a real operating concern → rate-limits/quotas are part of v1, not an
  afterthought.
