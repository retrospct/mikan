# ADR 0010 — Component foundation: shadcn (Base UI) + Phosphor, brand-canonical

**Status:** 📝 Proposed — Phase 1 of the agent-UI initiative (foundation + redesign).
**Date:** 2026-06-26
**Context owners:** jlee
**Related:** introduces a component library where there was none; the redesign rides on it.
Sequenced before [[0011-desktop-ask-mikan-architecture]] (Ask Mikan is built on this foundation).
Touches `packages/brand` (token system) and `apps/desktop/src/renderer`.

## Problem

The desktop renderer is **hand-rolled**: bespoke components in `ui-stubs.ts`, custom `mikan.css`,
a hand-drawn SVG icon set (`icons.tsx`), and design tokens owned by `@mikan/brand`. There is **no
component library**. Two pressures converge:

1. A **significant UI/UX redesign** is in flight (Figma).
2. We need a **conversational/agent surface** ("Ask Mikan", ADR-0011) with non-trivial primitives
   (composer, streaming message list, tool-call/approval UI) that we should not build from scratch.

Building the redesign on the *old* hand-rolled base and then porting to a real library later means
doing the visual work twice. We need to pick a foundation **now** and redesign **on** it.

## Decision

### 1. Adopt shadcn/ui on **Base UI** primitives, via the Vite/pointer template

```
pnpm dlx shadcn@latest init --preset b3tgpxOpHE --base base --template vite --pointer
```

- **Copy-in** components (we own the source; no runtime-library lock-in) — fits Electron/Vite.
- **Base UI** (not Radix) as the primitive layer (`--base base`): the headless successor we want
  for accessibility + composition.
- The **preset `b3tgpxOpHE`** *seeds* shadcn's CSS variables; it is a starting point, not the
  final look — the redesign overrides it.

### 2. `@mikan/brand` stays **canonical**; the preset is bridged into it

`@mikan/brand` remains the single source of truth for design tokens. The shadcn preset's CSS vars
are **mapped into** brand tokens (brand → shadcn var bridge), so components read brand values. We
do **not** fork theming into two competing systems.

### 3. Icons: **Phosphor**, migrated incrementally

Set shadcn `iconLibrary: phosphor`. Phosphor's multiple weights (regular/bold/fill/duotone) give
the redesign more expressive range than Lucide's single weight; bundle-size delta is immaterial for
a desktop Electron app. Migrate `icons.tsx` usages **per screen**, not in a big bang. The brand
**`MikanMark`** logo is retained as-is (not a Phosphor glyph).

### 4. Redesign executed **on the foundation**, incrementally

Adopt the foundation first, then redesign screen-by-screen (Today → Feed → Task → Plan → Search →
Settings) on top of it. No parallel "old UI" redesign.

## Options considered

| Option | Own the source? | Primitives | Verdict |
|---|---|---|---|
| **A. shadcn + Base UI + Phosphor** *(chosen)* | ✅ copy-in | Base UI | ✅ control + native Ask-Mikan primitives |
| B. shadcn + Radix + Lucide (default) | ✅ | Radix | ❌ we want Base UI + Phosphor |
| C. Coss UI (Cal.com / Base UI) | ✅ copy-in | Base UI | ❌ beta + opinionated styles fight the brand |
| D. Keep hand-rolled `ui-stubs.ts` | ✅ | none | ❌ rebuilds composer/stream/tool-UI from scratch |
| E. A styled runtime lib (MUI/Mantine) | ❌ runtime dep | own | ❌ lock-in + theme fights `@mikan/brand` |

## Consequences

### Positive
- One foundation under both the redesign and Ask Mikan — visual work happens once.
- Copy-in source keeps us free of runtime-library lock-in and easy to theme via `@mikan/brand`.
- Base UI + shadcn registry gives ready primitives for the agent composer/message/tool UI (0011).
- Phosphor weights expand the redesign's expressive range.

### Negative / trade-offs
- **Token-bridge surface:** brand ↔ shadcn-var mapping is a new seam to maintain; must be defined
  before broad component adoption or the two drift.
- **Incremental period of mixed UI:** old `ui-stubs.ts` and new shadcn components coexist until the
  per-screen migration completes — accept transient inconsistency.
- **Icon migration is manual:** `icons.tsx` → Phosphor is per-usage; tracked per screen.
- `--pointer` registry/preset values may shift; pin what we copy in.

## Phase 1 checklist (not yet done)

- [ ] Run `shadcn init` with the preset; commit generated config + `components.json`.
- [ ] Define the `@mikan/brand` ↔ shadcn CSS-var bridge (brand stays canonical).
- [ ] Set `iconLibrary: phosphor`; add Phosphor; keep `MikanMark`.
- [ ] Port one screen end-to-end as the migration template; capture the pattern.
- [ ] Migrate remaining screens incrementally; retire `ui-stubs.ts` usages as they convert.
