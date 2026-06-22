# @nimi/brand

The build-time **brand layer**: one neutral core ships as two installable products
— **Mikan** (primary) and **Momo** (later) — selected by the `BRAND` env var at
build time. A brand = product identity (name, appId, deep-link scheme, icon, URLs,
tagline) + a colour theme. Consumed **from `.ts` source** (no build step), like
`@nimi/contract`.

## Layout

```
src/
  identity.json     SSOT for build identity (productName, appId, scheme, icon, publish)
  types.ts          BrandConfig + colour/token type contract (platform-agnostic)
  tokens.ts         brand-agnostic system tokens (space/radius/fontSize, unitless)
  brands/*.ts       per-brand identity + mode-aware { light, dark } colour palettes
  index.ts          resolver: BRAND_ID, brand, brands registry (NO DOM/Tailwind)
  web/              DOM adapter: applyBrandTheme (CSS vars) + BrandProvider/useBrand
  native/           RN seam: token -> JS object (srgb only, NO DOM)
  tokens.test.ts    contract test: srgb must be literal hex/rgba (fails on var()/oklch leak)
```

## Exports (the platform seam)

| Entry                       | Use from                      | Contains                                     |
| --------------------------- | ----------------------------- | -------------------------------------------- |
| `@nimi/brand`               | anywhere (main, renderer, RN) | resolver, tokens, types — no DOM             |
| `@nimi/brand/tokens`        | anywhere                      | system tokens + colour token types           |
| `@nimi/brand/identity.json` | TS configs + electron-builder | build identity SSOT                          |
| `@nimi/brand/web`           | Electron renderer only        | CSS-var adapter, `BrandProvider`, `useBrand` |
| `@nimi/brand/native`        | React Native only             | `nativeTheme()` JS-object adapter            |

`./web` is the only DOM-dependent entry — RN must never import it.

## Colour tokens

Each colour is `{ srgb: string; p3?: string }`:

- **`srgb`** — literal `#hex`/`rgba()`. The cross-platform fallback and the value
  React Native consumes. Never a web-only encoding (`var()`, `color-mix()`, `oklch()`).
- **`p3`** — optional OKLCH (or `color(display-p3 …)`) string. The web adapter
  prefers it; Electron's Chromium renders it wide-gamut on P3 panels and clamps to
  sRGB elsewhere, so one value covers both gamuts with `srgb` as the explicit floor.

Themes are mode-aware (`{ light, dark }`) so dark mode is a second theme of identical
shape — no refactor.

## Path to GA — accessibility & colour checklist

The current layer establishes the **token seam and brand selection**. These are the
production goals we're driving toward; tick them off as the renderer styling lands
(mostly in the desktop Tailwind/CSS wiring) before GA:

- [ ] 1. **Semantic tokens only** — no hard-coded hex in components; colour comes
     from brand-mapped utilities/vars. _(seam in place; component migration ongoing)_
- [ ] 2. **OKLCH + `color-mix()` for state derivation**, chroma capped for UI
     legibility. _(palettes authored in OKLCH; state derivation TBD in renderer)_
- [ ] 3. **sRGB fallbacks defined; P3 gated with `@supports`**; no contrast
     regression in P3. _(today: `srgb` floor + JS-applied OKLCH, valid in Electron's
     Chromium; add `@supports` CSS gating when a non-Electron web target appears)_
- [ ] 4. **Dark/light via `prefers-color-scheme`**; text/bg ≥ 4.5:1 (3:1 large).
     _(mode-aware themes exist; wire to `prefers-color-scheme` + verify contrast)_
- [ ] 5. **`prefers-contrast`** — strengthen contrast + hover/focus affordances.
- [ ] 6. **`forced-colors: active`** — use system colours, drop decorative bgs.
- [ ] 7. **`color-scheme` + `accent-color`** set for native form UI.
- [ ] 8. **Non-colour cues** — underlines, icons, dashes, patterns (not colour alone).
- [ ] 9. **Runtime contrast guard** only where content is dynamic/uncontrolled.
- [ ] 10. **QA in grayscale, print preview, and Windows High Contrast.**

OKLCH values in `brands/*.ts` are a tuned first pass — refine against an APCA/contrast
tool (items 2–4) before GA.

## Open follow-ups (stakeholder acceptance)

- **Surface bridge depth.** The desktop renderer currently bridges only the
  _palette-level_ tokens (`--accent`/`-ink`/`-deep`, `--bg`, `--ink`/`-2`) to
  `--brand-*`; the translucent `--surface`/`--hairline`/`--shadow` "glass" craft
  tokens stay brand-neutral. **Decision pending:** whether brands should also drive
  surfaces (more brand-saturated chrome) or keep the shared glass treatment. Needs
  a visual review of Mikan vs Momo before committing either way.
- **Assistant persona name.** User-facing copy ("Ask Mikan", "Welcome to Mikan",
  "Add to Mikan") now uses `brand.productName` for the in-app assistant. **Decision
  pending:** confirm the assistant should share the product name vs. carry its own.

## Adding a brand later (e.g. when Momo graduates)

1. Add its entry to `identity.json`.
2. Add `src/brands/<id>.ts` (copy `momo.ts`, swap palette + URLs).
3. Add the id to the `BrandId` union in `types.ts` and the `brands` registry in
   `index.ts`.
4. Add the `dev:<id>` / build + release wiring in the desktop app.
5. Drop `assets/<id>/icon.png` in the desktop app.

Default brand is **mikan**: a build with no `BRAND` set builds Mikan.
