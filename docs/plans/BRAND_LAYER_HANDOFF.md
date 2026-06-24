# Task: adapt the brand-config scaffold into this monorepo

Reference files are in `./_brand-scaffold/` (a standalone prototype generated
outside this repo). Adapt them to our actual structure — **do not copy
verbatim**. Read our existing layout and conventions first, then match them.

## What this is
A brand layer that ships a single product — **Mikan** — resolved statically.
Brand = product identity (name, appId, icon, urls, tagline) + a `theme`
(color tokens). `theme` is nested **inside** brand, not a peer of it. (The shape
stays brand-agnostic so a second product could be reintroduced later, but nothing
selects a brand today.)

## Our setup
- **Monorepo:** Turborepo + pnpm workspaces. Shared code lives in `packages/`.
- **Two apps** (likely under `apps/`):
  - a **Vite + Electron** app (the live one — wire this up fully)
  - a **React Native** app (barely started; just runs in local dev)

## Where things go
- Create a shared package under `packages/` (match our existing package naming
  and the scope used by other workspace packages — check `package.json` names).
  Suggested: `packages/brand`.
- Both apps consume it via the workspace protocol (`"@scope/brand": "workspace:*"`).
- `electron-builder.config.cjs` stays in the **Electron app**, not the shared
  package. It reads the shared `identity.json`.

## The shared token contract (platform-AGNOSTIC — this is the seam)
The shared package must hold **design tokens as primitive values only**, with
**no import** from React, React Native, the DOM, or Tailwind. Each platform
writes its own adapter that consumes these values.

Rules that make the seam real:
- **Colors = literal hex or `rgba()` strings only.** No `var(...)`, no
  `color-mix()`, no `hsl()`/`oklch()` functions, no gradients, no `currentColor`.
  Those are web encodings RN can't read.
- **Scales = unitless numbers** (`space.md = 12`, not `"12px"`). Web adapter
  appends the unit; RN uses the number directly.
- **Split brand from system.** Only *color* (and optionally a display/body font)
  is brand-specific. Spacing, radii, type scale, z-index are the shared design
  system — keep them in **brand-agnostic** system tokens, NOT duplicated inside the
  brand config (that invites drift, and keeps the door open for a second brand).
- **Neutral naming.** Rename the scaffold's `primaryHover` → `primaryActive`
  ("hover" is web-only; web maps it to hover, RN to pressed).
- **Mode-aware shape.** Wrap a brand's tokens in `{ light, dark? }` so dark mode
  later is a second `BrandTheme` of identical shape — no refactor. (Brand is
  build-time and fixed per app; light/dark is a runtime theme *within* a brand.)

Shape to implement (adapt names to our conventions):

```ts
// packages/brand/tokens.ts — imports nothing
export type ColorToken = string; // hex or rgba() ONLY
export interface ColorTokens {
  bg: ColorToken; surface: ColorToken; surfaceMuted: ColorToken; border: ColorToken;
  text: ColorToken; textMuted: ColorToken;
  primary: ColorToken; primaryActive: ColorToken; onPrimary: ColorToken; accent: ColorToken;
  success: ColorToken; warning: ColorToken; danger: ColorToken; ring: ColorToken;
}
export interface BrandTheme { color: ColorTokens; fontDisplay?: string; fontBody?: string }
export interface BrandThemeSet { light: BrandTheme; dark?: BrandTheme }

// brand-AGNOSTIC system tokens, constant across brands, unitless:
export const space    = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32 } as const;
export const radius   = { sm: 6, md: 10, lg: 16, pill: 999 } as const;
export const fontSize = { xs: 12, sm: 14, md: 16, lg: 20, xl: 28 } as const;
```

- **Enforce the contract.** Add a small test or ESLint rule asserting every
  color token matches `/^#([0-9a-f]{3,8})$|^rgba?\(/i`, so a web-only value
  (e.g. `var(--x)`) sneaking into the shared layer fails the build.

## Platform split — IMPORTANT
The scaffold's `theme.ts` and `BrandProvider.tsx` use the DOM (`document`, CSS
custom properties). **Those are web/Electron only — React Native cannot use
them.**
- **Shared / neutral** (`packages/brand`, default export): `types.ts`,
  `tokens.ts`, `identity.json`, `brands/*.ts`, `index.ts` (resolver).
- **Web-only** (behind a separate `./web` export so RN can't import `document`):
  the CSS-variable theme adapter + `BrandProvider`.
- **React Native:** do **NOT** build an RN theme system now. RN theming is
  undecided (Tamagui is a candidate, not chosen). Just ensure the neutral tokens
  are consumable later. Leave a clean seam; don't couple to anything yet.

## Styling — Electron app: Tailwind v4+ (consume the brand variables)
- The Electron app **should use Tailwind, version 4 or later** (NOT v3). Heads
  up: it may **not currently be set up** even if it looks like it should be —
  **verify**, and if Tailwind is absent, set up Tailwind v4 as part of this work.
- **Do not create a second color system.** Tailwind must read *from* the brand
  layer, not hardcode hex. Wiring:
  1. The web theme adapter / `BrandProvider` writes the brand tokens as runtime
     CSS variables on `:root` (use the imperative apply-to-`document.documentElement`
     path, not only a wrapper div, so utilities resolve everywhere): `--brand-primary`,
     `--brand-bg`, etc.
  2. Tailwind maps its color utilities onto those runtime vars with `@theme inline`:

     ```css
     @import "tailwindcss";
     @theme inline {
       --color-brand: var(--brand-primary);
       --color-brand-active: var(--brand-primary-active);
       --color-on-brand: var(--brand-on-primary);
       --color-bg: var(--brand-bg);
       --color-surface: var(--brand-surface);
       --color-surface-muted: var(--brand-surface-muted);
       --color-border: var(--brand-border);
       --color-fg: var(--brand-text);
       --color-fg-muted: var(--brand-text-muted);
       --color-accent: var(--brand-accent);
       --color-success: var(--brand-success);
       --color-warning: var(--brand-warning);
       --color-danger: var(--brand-danger);
       --color-ring: var(--brand-ring);
     }
     ```

     `@theme inline` makes utilities like `bg-brand` reference the runtime
     variable, so a theme change (e.g. dark mode) re-points every utility with no
     recompile — the same indirection shadcn uses.
- **`packages/brand` must NOT depend on Tailwind** or any framework. It stays
  pure values; the Tailwind mapping lives in the Electron app only.
- **RN styling stays unchosen.** Do not add NativeWind/Tamagui now.

## Turborepo specifics — don't miss these
- Confirm the app build depends on the brand package (`dependsOn: ["^build"]` or
  our equivalent) so changes propagate.

## Non-negotiable rules
1. Nothing user-facing hardcodes the product name or a hex color. Identity from
   the brand config; color from tokens/utilities that resolve to brand vars.
2. The brand is resolved **statically** — `@nimi/brand` exports Mikan directly.
3. `identity.json` is the single source of truth for build-identity fields
   (productName, appId, icon) — both the TS config and electron-builder read it.
4. Internal namespace (mneme/nimi/neeme) stays untouched. Brand lives only at
   the client edge.

## Electron app wiring (do this fully)
- `BrandProvider` wraps the renderer root; brand vars applied to `:root`.
- Tailwind v4 set up and wired to the brand vars as above.
- `electron.vite.config.ts` and electron-builder read identity from the shared
  `identity.json` (`identity.mikan`).
- Icons at `assets/mikan/icon.png` (1024×1024) so packaging works.

## Process — propose before building
Before writing everything, **propose**: (a) the shared package's name/location
and its export map (neutral default vs `./web` entry), and (b) the Tailwind v4
setup plan (since it may not exist yet). Let me confirm it fits our conventions,
THEN implement. Don't guess the structure and write it all at once.

## Definition of done
- `pnpm --filter <electron-app> dev` boots as Mikan.
- Electron app uses Tailwind v4 and utilities resolve through `--brand-*` vars,
  with no hardcoded hex in components.
- RN app still builds and imports the shared package without pulling in any DOM
  or Tailwind code.
- The color-token format test/lint rule passes and would fail on a `var()` value.
