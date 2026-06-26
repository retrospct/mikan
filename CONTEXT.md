# Mikan — context & glossary

Single source of shared vocabulary for the repo. Pairs with `docs/adr/` (the *why* behind
hard-to-reverse decisions) and `docs/agents/domain.md` (how agents consume this). When a term
here and an ADR disagree, the ADR wins for its scope — update this file to match.

## What Mikan is

A local-first **memory + todo** companion. You capture things (notes, files, screenshots, voice,
connector ingest); an on-device pipeline extracts → chunks → embeds them into a libSQL vector
store; the app surfaces daily focus todos and lets you search/recall. Desktop is Electron (React
19 + Tailwind v4); a React Native companion (`apps/mobile`) syncs the same data.

## Naming (disambiguation)

These collide in conversation — keep them distinct in code, docs, and UI copy:

| Term | Means | Not to be confused with |
|---|---|---|
| **Mikan** / **Mikan-app** | The product and the desktop/mobile client. | The agent. |
| **Mikan-agent** (`mikanAgent`) | The server-side Mastra agent (Claude) in `services/mastra`. | The app, or the UI surface. |
| **Ask Mikan** | The *UI surface* for conversing with Mikan-agent. On desktop it is the **evolved global search overlay** (header magnifier + shortcut), not a separate tab. | A standalone chatbot product. |

## Core domain terms

- **Capture** — the act of adding raw input (note/file/image/audio/connector). Produces a **memory**.
- **Memory** (a.k.a. `item`) — a captured artifact, content-hash de-duped.
- **Chunk** — an embedded slice of a memory; the unit of vector (cosine) search.
- **On-device pipeline** — capture → extract → chunk → embed → libSQL vector search, run in a
  Node `utilityProcess` on desktop (ADR-0003). Mobile offloads this to the cloud (ADR-0009).
- **Todo / backlog** — daily-focus tasks (cap-5 + finish-the-list latch); each has a **context pool**
  (surface / pin / dismiss).
- **Drafter** — the AI seam for `brief`/`draft`/`note` and uncovered-todos; BYO-key
  (`NEEME_ANTHROPIC_KEY`), degrades to null without a key.
- **Sync** — opt-in Turso embedded-replica, database-per-user via the **broker** (ADR-0008);
  shipped (ROADMAP #10). At-rest field encryption is a known partial gap (v1.1).
- **Broker** — mints per-user `{ syncUrl, authToken }` from a Logto `sub`.

## Surfaces (desktop)

Today · Feed · Task detail · Plan ritual · **Search → Ask Mikan** (overlay) · Settings.
The app is a narrow, centered single column over a wallpaper margin.

## Ask Mikan — design contract (see ADR-0011)

- **Opt-in, default OFF**, transparent ("what was sent" + persistent cloud-mode indicator), no
  per-action nagging. Requires sign-in (Logto, shipped #9) + network.
- **Escalation model:** instant on-device search stays the default; "Ask Mikan" *escalates* the
  same query to the agent. No key/offline → the overlay is just local search (today's behavior).
- **Cloud reasoning + on-device tool execution:** the cloud agent reasons; data access stays on
  the device. v1 = client-grounded retrieval (send top-K local snippets + query) + `addTodo` as an
  approval-gated client-executed tool. Multi-hop on-device `searchMemories` is a later enhancement
  (pending a Mastra client-tool spike). **Mobile differs** — it has no local store, so it keeps the
  server-side tools (ADR-0009).
- **Keys never ship in the client.** Hosted model keys live in the backend runtime's secrets;
  optional BYO-key lives in OS secure storage and is forwarded server-side. Host (Vercel/Inngest
  vs Cloudflare/Hono) is swappable behind the AI-SDK-stream + Logto boundary.
- **Threads persist in local libSQL** (private/offline); the server agent stays stateless and the
  client supplies prior turns.

## Where to look

- `docs/adr/` — decisions. Most relevant here: 0002 (auth), 0003 (on-device pipeline),
  0008 (sync broker), 0009 (mobile cloud pipeline), **0010** (UI foundation), **0011** (Ask Mikan).
- `docs/ROADMAP.md` — punch list + v1.1 wire-up/hardening.
- `services/mastra/` — the Mikan-agent + Inngest pipeline (the cloud lane).
- `apps/desktop/src/renderer/src/mikan/` — the client surfaces and current hand-rolled UI.
