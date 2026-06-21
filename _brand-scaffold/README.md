# Brand-config layer

One codebase, two installable apps (**Mikan** primary, **Momo** later). Brand
identity — name, icon, bundle id, colors, copy, URLs — lives in a thin,
swappable layer on top of one brand-neutral core. Nothing else in the app knows
the product's name.

Brand is selected **at build time** (not a runtime flag), because an installed
app's identity (bundle id, name, icon) is baked into the package and can't vary
at runtime. Adding Momo later is a config file + an icon set + a build target —
no fork, no find-and-replace.

## Layout

```
src/brand/
  identity.json        shared build identity (productName, appId, icon)
  types.ts             BrandConfig + token types
  brands/
    mikan.ts           Mikan config (mandarin-orange theme)
    momo.ts            Momo config (peach theme, placeholder)
  index.ts             resolves the active brand from BRAND env, validates
  theme.ts             tokens -> CSS variables
  BrandProvider.tsx    React provider + useBrand() hook
src/BrandExample.tsx   throwaway demo of the two access patterns
electron-builder.config.cjs   packaging, parameterized by BRAND
```

`identity.json` is the single source of truth for the build-identity fields, so
the TS configs and electron-builder can't drift. Requires
`"resolveJsonModule": true` in tsconfig.

## How the app reads brand

Two access patterns, both brand-agnostic:

- **Copy / identity:** `useBrand().productName`, `.tagline`, `.urls.site`
- **Color:** CSS variables — `var(--brand-primary)`, `var(--brand-bg)`, etc.
  (token `surfaceMuted` -> `--brand-surface-muted`)

Wrap the app once:

```tsx
import { BrandProvider } from './brand/BrandProvider';

root.render(
  <BrandProvider>
    <App />
  </BrandProvider>,
);
```

Never hardcode the product name or a hex color in a component. If you do, the
reskin leaks.

## Running

Add these to `package.json` (replace `dev:app` / `build:app` with your existing
renderer+main scripts):

```json
{
  "scripts": {
    "dev": "cross-env BRAND=mikan npm run dev:app",
    "dev:momo": "cross-env BRAND=momo npm run dev:app",
    "build:mikan": "cross-env BRAND=mikan npm run build:app && cross-env BRAND=mikan electron-builder --config electron-builder.config.cjs",
    "build:momo": "cross-env BRAND=momo npm run build:app && cross-env BRAND=momo electron-builder --config electron-builder.config.cjs"
  }
}
```

`cross-env` makes the `BRAND=x` prefix work on Windows too. `npm i -D cross-env`.

## Vite renderer note

`index.ts` reads `process.env.BRAND`, which exists in the Electron main process
but not in the Vite renderer. Inline it at build by adding to your Vite config:

```ts
// vite.config.ts (renderer)
export default defineConfig({
  define: {
    'process.env.BRAND': JSON.stringify(process.env.BRAND ?? 'mikan'),
  },
});
```

(Using electron-vite or electron-forge's Vite template? Same idea — set the
`define` on the renderer config.)

## Icons

Drop per-brand icons where `identity.json` points:

```
assets/mikan/icon.png
assets/momo/icon.png
```

Use a 1024×1024 PNG; electron-builder generates the platform variants.

## Adding a brand later (e.g. when Momo graduates)

1. Add its entry to `identity.json`.
2. Add `src/brand/brands/<id>.ts` (copy momo.ts, swap tokens + URLs).
3. Add the id to the `BrandId` union in `types.ts` and the `registry` in
   `index.ts`.
4. Add `dev:<id>` / `build:<id>` scripts.
5. Drop `assets/<id>/icon.png`.

Default brand is **mikan** — a bare `npm run dev` or `electron-builder` with no
`BRAND` set builds Mikan.
