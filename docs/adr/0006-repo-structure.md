# ADR 0006 — Repo structure: migrate to a monorepo now, before parallel workstreams

**Status:** Accepted **and implemented** (2026-06-01) — migrated to a **pnpm-workspace +
turborepo** monorepo in the quiet window (0 open PRs, pre-agent-ramp), _ahead_ of Expo.
Supersedes the original "defer until Expo starts" timing (see Decision). Layout shipped:
`apps/desktop` + `packages/contract` (`@mikan/contract`); see ROADMAP "Shipped".
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

**Migrate to a pnpm-workspace monorepo _now_** — before the parallel workstreams ramp back up,
even though Expo hasn't started.

The original "defer until Expo" call (option A) weighed tooling-overhead vs later-churn and
missed the decisive factor: the migration is a repo-wide `git mv src → apps/desktop/src` that
rewrites nearly **every path**, so it conflicts with **every open branch**. Done amid parallel
agent work it's a merge nightmare — the same one the Neeme→Nimi rename would have been mid-flight.
Done **now** (0 open PRs, single worktree) it's a clean one-shot reshuffle. The quiet window is
worth far more than a few weeks of "premature" workspace tooling. (`nimi` is already at the
would-be root name, so this is a pure structural reshuffle, not a re-identity.)

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

### When — now, the pre-ramp quiet window

**Before** restarting the parallel workstreams, not at the first Expo commit. `apps/mobile` is
added later when Expo actually starts; this migration just stands up the _structure_
(`apps/desktop` + `packages/contract` + workspace root) into the empty window, so all future
work — desktop, mobile, parallel agents — branches off an already-monorepo'd `main`.

### Migration checklist (the fiddly bits)

The `git mv` is the easy part; the config rewiring is where it bites. Rough order:

1. `pnpm-workspace.yaml` (`apps/*`, `packages/*`); split the root `package.json` (workspace
   scripts) from `apps/desktop/package.json` (the app's deps + scripts).
2. `git mv src apps/desktop/src`, and move `electron.vite.config.ts`, `electron-builder.yml`,
   `dev-app-update.yml`, `tsconfig*.json`, `index.html`, `resources/`, `build/`, `scripts/` →
   `apps/desktop/`.
3. **Lift `src/shared` → `packages/contract`** (own `package.json` + `tsconfig`), make it a
   workspace dep of desktop, and repoint the `@shared` alias (electron-vite renderer + tsconfig
   `paths`) at the package (`@mikan/contract`).
4. **electron-vite:** the multi-entry `input` (main + worker `index.ts`) paths are now relative
   to `apps/desktop`; confirm the worker fork path (`out/main/worker.js`) still resolves at runtime.
5. **tsconfig project references** between `desktop` and `contract` (composite).
6. **electron-builder** `directories`/`files`/`appId` paths from the new app root.
7. Per-package `CLAUDE.md` (root spine stays; `apps/desktop` gets its own) — see hygiene below.
8. **Verify:** `pnpm -r typecheck` + full `electron-vite build` green, `pnpm dev` boots and the
   worker forks. `NEEME_*` env vars are unaffected.

Do it in a worktree on one branch, merged before anything else branches.

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

- ~~pnpm workspaces alone, or turborepo from the migration moment?~~ **Resolved: turborepo
  from the migration moment.** `turbo.json` orchestrates `build`/`typecheck`/`dev` across the
  workspace (strict env mode, with `NEEME_*`/`VITE_*` declared in `globalEnv`).
- Does the **on-device pipeline** become a shared `packages/pipeline`, or is mobile's capture
  path different enough (RN native modules) that it doesn't share? (Likely diverges → keep
  `contract` shared, not `pipeline`, until proven.)
- Does the legacy Python `neeme` backend ever enter this repo, or stay separate until retired
  (0003 says separate — unchanged here)?
