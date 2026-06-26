# @mikan/brand

The **brand layer**: a single brand, **Mikan**, resolved statically by `@mikan/brand`.
A brand = product identity (name, appId, deep-link scheme, icon, URLs, tagline) + a
colour theme. The architecture (a `BrandConfig` type + platform adapters) stays
brand-agnostic, so a second product could be reintroduced later from git history
without rearchitecting — but today nothing selects a brand. Consumed **from `.ts`
source** (no build step), like `@mikan/contract`.

## Layout

```
src/
  identity.json     SSOT for build identity (productName, appId, scheme, icon, publish)
  types.ts          BrandConfig + colour/token type contract (platform-agnostic)
  tokens.ts         brand-agnostic system tokens (space/radius/fontSize, unitless)
  brands/*.ts       brand identity + mode-aware { light, dark } colour palettes (mikan.ts)
  index.ts          exports the Mikan `brand` + tokens (NO DOM/Tailwind)
  web/              DOM adapter: applyBrandTheme (CSS vars) + BrandProvider/useBrand
  native/           RN seam: token -> JS object (srgb only, NO DOM)
  tokens.test.ts    contract test: srgb must be literal hex/rgba (fails on var()/oklch leak)
```

## Exports (the platform seam)

| Entry                       | Use from                      | Contains                                     |
| --------------------------- | ----------------------------- | -------------------------------------------- |
| `@mikan/brand`               | anywhere (main, renderer, RN) | the `brand`, tokens, types — no DOM          |
| `@mikan/brand/tokens`        | anywhere                      | system tokens + colour token types           |
| `@mikan/brand/identity.json` | TS configs + electron-builder | build identity SSOT                          |
| `@mikan/brand/web`           | Electron renderer only        | CSS-var adapter, `BrandProvider`, `useBrand` |
| `@mikan/brand/native`        | React Native only             | `nativeTheme()` JS-object adapter            |

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

The current layer establishes the **token seam**. These are the
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
  tokens stay brand-neutral. **Decision pending:** whether the brand should also drive
  surfaces (more brand-saturated chrome) or keep the shared glass treatment.
- **Assistant persona name.** User-facing copy ("Ask Mikan", "Welcome to Mikan",
  "Add to Mikan") now uses `brand.productName` for the in-app assistant. **Decision
  pending:** confirm the assistant should share the product name vs. carry its own.
- **Mobile app identity wiring.** `apps/mobile` imports `@mikan/brand` (login screen
  reads `brand.productName`/`brand.tagline`), but the Expo app identity is **not yet
  wired to it**: `app.json` is still static (`name: Mikan`, `scheme: nimi`,
  `bundleIdentifier cool.jlee.nimi`). When mobile graduates, align `app.json` (or a
  dynamic `app.config.js`) with `identity.mikan` — name/scheme `mikan`, bundleId
  `dev.retro.mikan` — mirroring the desktop wiring.
- **Logto Account API stays off (revisit later).** nimi doesn't use Logto's Account
  Center / Account API: sign-out is local, identity comes from the verified id_token
  claims, and Google connector tokens are managed by the app's own OAuth
  (`src/main/connectors/google-auth.ts`), not Logto's Secret Vault. Revisit only if
  we build native **in-app account management** (change email/password, MFA, passkeys,
  session revocation) instead of a Logto-hosted page, or decide to move Google token
  storage into Logto's Secret Vault — both are deliberate, security-scoped changes.

## Reintroducing a brand later

The layer ships a single brand (Mikan), resolved statically — there's no brand
selection. The shape that made it brand-agnostic still holds, though: identity lives
in `identity.json`, palettes in `brands/*.ts`, and the platform adapters
(`./web`, `./native`) consume tokens without caring how many brands exist. If a second
product is ever needed, the prior multi-brand wiring (a `BrandId` union, a `brands`
registry, and a build-time selector) is recoverable from git history rather than
something to design from scratch.
