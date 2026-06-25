# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the
codebase. This repo is **single-context**.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root (the domain glossary / ubiquitous language).
- **`docs/adr/`** — read the ADRs that touch the area you're about to work in. The current set
  covers sync/processing (0001), auth (0002), the all-TS on-device pipeline (0003), AI drafting
  (0004), image/audio extraction (0005), monorepo structure (0006), connectors ingest (0007),
  and the sync auth-token broker (0008).

If any of these files don't exist, **proceed silently**. Don't flag their absence or suggest
creating them upfront. (`CONTEXT.md` does not exist yet — the `/domain-modeling` skill, reached
via `/grill-with-docs` and `/improve-codebase-architecture`, creates it lazily when terms
actually get resolved.) Note that the monorepo's narrower guides — root `CLAUDE.md`,
`apps/desktop/CLAUDE.md`, `docs/INTEGRATION.md`, `docs/SECURITY.md` — already carry a lot of the
shared vocabulary in the meantime.

## File structure

Single-context repo:

```
/
├── CONTEXT.md          ← (not created yet)
├── docs/adr/
│   ├── 0001-sync-and-processing-architecture.md
│   ├── 0002-authentication.md
│   └── … through 0008-sync-auth-token-broker.md
├── apps/desktop/
└── packages/contract/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a
test name), use the term as defined in `CONTEXT.md` (and the existing CLAUDE.md guides). Don't
drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing
language the project doesn't use (reconsider) or there's a real gap (note it for
`/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently
overriding:

> _Contradicts ADR-0003 (all-TypeScript on-device pipeline) — but worth reopening because…_
