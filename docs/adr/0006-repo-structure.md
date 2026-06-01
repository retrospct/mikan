# ADR 0006 — Repo structure: flat now, monorepo when mobile lands

**Status:** Accepted (flat single-app repo now; migrate to a workspace monorepo when the Expo app starts)
**Date:** 2026-06-01
**Context owners:** jlee (+ Claude)
**Related:** corrects the timing in [[0003-all-typescript-on-device-pipeline]] (which pencilled in a turborepo "now"); gates roadmap #14 (RN/Expo)

## Problem

0003 pencilled in a turborepo monorepo (`apps/desktop`, `apps/expo`, `packages/*`) and said
"this repo becomes `apps/desktop`." Since then the app shipped a lot of surface flat, was
renamed to **`nimi`**, and a mobile (RN/Expo) app is on the roadmap (#14). So: do we
restructure into a monorepo now, or stay flat and migrate when mobile actually starts?

The thing 0003 got right: an all-TS desktop **+** mobile future _wants_ shared code. The
thing to correct: its **timing**. There's exactly one app today, and the shared seam already
exists as `src/shared` (the IPC + view-model contract). Premature monorepo tooling is pure
overhead until there's a second consumer of that seam.

## Options considered

Legend: ✅ strong · ⚠️ caveats · ❌ poor

| Option                                                 | Overhead now                       | Ready for mobile     | Code sharing                                          | Churn                          |
| ------------------------------------------------------ | ---------------------------------- | -------------------- | ----------------------------------------------------- | ------------------------------ |
| A. Flat now, monorepo when mobile lands _(chosen)_     | ✅ none                            | ⚠️ migrate on demand | ✅ via `src/shared` today → `packages/contract` later | ✅ deferred to when it pays    |
| B. Monorepo now (preemptive)                           | ❌ tooling + restructure for 1 app | ✅                   | ✅                                                    | ❌ now, for no current benefit |
| C. Two separate repos sharing a published contract pkg | ⚠️ publish/version a package       | ✅                   | ⚠️ duplicate/publish friction                         | ⚠️                             |

## Decision

**A — stay flat.** Keep `nimi` as a single-app repo. The contract already lives in
`src/shared` and is the compiler-enforced seam between lanes; that's enough sharing for one
app. **Migrate to a workspace monorepo when the Expo app is actually started (#14)** — not
before.

### Target layout (when we migrate)

```
nimi/                      ← repo root (already renamed)
  apps/
    desktop/               ← today's Electron app moves here wholesale
    mobile/                ← RN + Expo
  packages/
    contract/              ← lifted from src/shared (views + ipc types)
    pipeline/  (maybe)     ← if the on-device pipeline is shared with mobile
  package.json             ← workspace root
```

- **pnpm workspaces** is the floor (we already use pnpm); **turborepo** layers task
  caching/orchestration on top — add it if/when build times or task graphs justify it, not
  reflexively.
- `packages/contract` is just `src/shared` promoted — the move is mechanical because the
  contract was already isolated there.

### Migration trigger

The first commit of real Expo work. Doing it _with_ that work means the monorepo earns its
keep immediately (two real consumers of `packages/contract`), and the desktop app moves in
one clean `git mv` of `src → apps/desktop/src`.

### Agent-context hygiene (the real monorepo risk)

Per 0003: once split, use **per-app/per-package `CLAUDE.md`**, root agents at the package
under work, and worktrees — so a desktop task isn't polluted by mobile context. The root
`CLAUDE.md` stays the shared spine; lane scoping happens per-package.

## Consequences

- **Easier:** zero tooling tax today; the rename already put us at the would-be monorepo root
  name; the contract seam means the eventual split is mechanical, not a rewrite.
- **Harder:** a known future migration sits on the books (cheap, but non-zero); until then,
  any "shared with mobile" instinct has to wait or be faked via `src/shared`.

## Open questions

- pnpm workspaces alone, or turborepo from the migration moment?
- Does the **on-device pipeline** become a shared `packages/pipeline`, or is mobile's capture
  path different enough (RN native modules) that it doesn't share? (Likely diverges → keep
  `contract` shared, not `pipeline`, until proven.)
- Does the legacy Python `neeme` backend ever enter this repo, or stay separate until retired
  (0003 says separate — unchanged here)?
