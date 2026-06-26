# PRD — Component foundation + incremental redesign (Phase 1)

> Draft for review. Encodes [ADR-0010](../adr/0010-agent-ui-foundation.md). Sequenced **before**
> the Ask Mikan PRD (`ask-mikan-desktop.prd.md`), which builds on this foundation.
> Status: not yet published to Linear.

## Problem Statement

I'm in the middle of a significant visual/UX redesign of the Mikan desktop app, but the app is built
on hand-rolled components, a bespoke stylesheet, and a hand-drawn SVG icon set, with no component
library underneath. That means every redesigned screen is built from scratch, consistency is hard
to hold, and the upcoming conversational surface ("Ask Mikan") would need non-trivial primitives
(a composer, a streaming message list, tool-call/approval UI) built by hand. If I redesign on the
old hand-rolled base and adopt a real foundation later, I'll have done the visual work twice.

## Solution

Adopt a **copy-in component foundation** — shadcn/ui on **Base UI** primitives, with **Phosphor**
icons — and execute the redesign **on that foundation, incrementally, screen by screen**.
`@nimi/brand` stays the canonical design-token source; the shadcn preset only *seeds* the CSS
variables, which are bridged into brand tokens so there is one theming system, not two. The result:
a consistent, themeable base that makes the redesign faster and gives Ask Mikan ready primitives.

## User Stories

1. As a Mikan user, I want the redesigned screens to look and behave consistently, so that the app
   feels coherent rather than a patchwork.
2. As a Mikan user, I want the redesign to land screen by screen, so that I get improvements
   continuously instead of waiting for one big-bang release.
3. As a Mikan user, I want my existing flows (capture, search, daily todos, plan ritual) to keep
   working unchanged through the reskin, so that the new look never costs me functionality.
4. As a Mikan user, I want the app's iconography to feel intentional and expressive, so that the
   interface reads as crafted.
5. As a Mikan user, I want the Mikan brand mark to remain recognizable, so that the app's identity
   is preserved through the redesign.
6. As a maintainer, I want a component library I own the source of (copy-in), so that I'm not
   locked into a runtime dependency I can't theme or fork.
7. As a maintainer, I want Base UI primitives under the components, so that accessibility and
   composition come from a maintained headless layer rather than hand-rolled behavior.
8. As a maintainer, I want `@nimi/brand` to stay the single source of truth for tokens, so that
   the design system doesn't fragment into two competing theming systems.
9. As a maintainer, I want the shadcn preset's variables bridged into brand tokens, so that
   adopting the preset doesn't fork our theme.
10. As a maintainer, I want Phosphor wired as the shadcn icon library, so that new components pull
    icons from one expressive set with multiple weights.
11. As a maintainer, I want to migrate icon usages per screen, so that the icon swap is incremental
    and reviewable rather than a risky big-bang change.
12. As a maintainer, I want one screen ported end-to-end first as a template, so that the rest of
    the migration follows a proven pattern.
13. As a maintainer, I want the hand-rolled component stubs retired as screens convert, so that we
    don't carry two component systems forever.
14. As a maintainer, I want to accept a transient period of mixed old/new UI, so that the migration
    can proceed incrementally without blocking on a full rewrite.
15. As a developer building Ask Mikan (Phase 2), I want composer / message-list / dialog primitives
    already available, so that the agent surface is assembled, not invented.
16. As a release owner, I want the existing end-to-end behavior tests to stay green through the
    reskin, so that I have confidence the redesign didn't break core flows.
17. As a designer, I want the foundation to honor brand tokens, so that the Figma redesign maps
    onto real, themeable variables rather than one-off styles.

## Implementation Decisions

- **Foundation:** initialize shadcn with the chosen preset on **Base UI** primitives via the Vite
  template, pointer registry (`init --preset b3tgpxOpHE --base base --template vite --pointer`).
  Components are **copy-in** (we own the source); no styled runtime library.
- **Theming:** `@nimi/brand` remains canonical. Add a **brand ↔ shadcn CSS-variable bridge** so
  shadcn components read brand values. The preset is a *seed*, not the final look; the redesign
  overrides it. This bridge must be defined **before** broad component adoption to prevent drift.
- **Icons:** set shadcn `iconLibrary: phosphor`; introduce Phosphor and migrate the existing
  hand-drawn icon usages **per screen**. The brand `NimiMark` logo is retained as-is.
- **Redesign sequencing:** adopt the foundation first, then redesign **on** it, one surface at a
  time (Today → Feed → Task detail → Plan ritual → Search/overlay → Settings). No parallel redesign
  of the old hand-rolled UI.
- **Retirement:** as each screen converts, retire its hand-rolled stub usages; accept a transient
  mixed-UI period until migration completes.
- **No new data seams:** this phase is presentational. The renderer keeps driving the same
  `window.api.*` interfaces (`pipeline.*`, `todos.*`, etc.); only the component/visual layer changes.

## Testing Decisions

- **Good tests assert external behavior, not component internals** — i.e. "capture → search → todo
  still works after the reskin," not "this button renders this class."
- **Regression guard (reuse, don't author):** keep the existing deterministic **Playwright Electron
  E2E** (`test:e2e`, run in CI via `e2e-smoke.yml` under Xvfb) **green** through the reskin. Because
  the redesign doesn't change `window.api`, this is mostly a "stays green" obligation, not new test
  writing. Prior art: the committed E2E + `test:smoke` tiers.
- **Token bridge:** a small unit test for the brand ↔ shadcn variable mapping (a pure function /
  token map — external behavior is "brand token X yields shadcn var Y").
- **Visual verification (agent-driven, not hand-written):** verify each redesigned screen with a
  **Cursor Cloud GUI agent** using the `gui-smoke` skill and a new redesign runbook authored from
  `docs/testing/RUNBOOK-TEMPLATE.md`. Prior art: `docs/testing/uncovered-todos-gui-runbook.md`,
  `csp-smoke-runbook.md`. This avoids brittle per-screen Playwright authoring.

## Out of Scope

- The actual visual design specification (lives in Figma; this PRD is about the *foundation* and
  the *mechanism* of migrating onto it).
- The "Ask Mikan" agent surface and any agent/transport work — that is Phase 2
  (`ask-mikan-desktop.prd.md`, ADR-0011).
- Mobile (`apps/mobile`) reskin.
- Any new product features beyond reskinning existing surfaces.

## Further Notes

- Decisions ratified in [ADR-0010](../adr/0010-agent-ui-foundation.md); see `CONTEXT.md` for
  vocabulary.
- This is the prerequisite foundation for Phase 2 — Ask Mikan's composer/message/approval UI is
  assembled from these primitives.
- The transient mixed-UI period is an accepted trade-off of the incremental approach (ADR-0010
  "Consequences").
