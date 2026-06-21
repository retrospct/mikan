// The neutral entry point — the one place the rest of the app imports the active
// brand from. Imports NOTHING from React, the DOM, or Tailwind, so it's safe in
// the Electron main process, the renderer, and a future React Native app alike.
// Platform-specific application lives in ./web (CSS vars) and ./native (JS object).

import type { BrandConfig, BrandId } from './types'
import { mikan } from './brands/mikan'
import { momo } from './brands/momo'

// Every brand this codebase can build. Exported so tooling (e.g. the token
// contract test) can iterate all brands regardless of the active BRAND.
export const brands: Record<BrandId, BrandConfig> = { mikan, momo }

export const DEFAULT_BRAND: BrandId = 'mikan'

// Typed for tsc only (this package carries no @types/node, to stay platform-pure).
// At runtime: `process` is real in the Electron main process / Node / React Native;
// `__BRAND__` is inlined by electron-vite `define` in the sandboxed renderer, which
// has no Node `process` at all.
declare const process: { env?: Record<string, string | undefined> } | undefined
declare const __BRAND__: string | undefined

function resolveBrandId(): BrandId {
  // Renderer: electron-vite `define` replaces __BRAND__ with a string literal at
  // build (the only way in — the sandboxed renderer has no process). Main / Node /
  // RN: read process.env.BRAND. Default to mikan when neither is set. The guards
  // must wrap the env reads so an undefined global is never dereferenced.
  const fromDefine = typeof __BRAND__ !== 'undefined' ? __BRAND__ : undefined
  const fromProcess = typeof process !== 'undefined' ? process.env?.BRAND : undefined
  const raw = fromDefine ?? fromProcess ?? DEFAULT_BRAND

  if (!(raw in brands)) {
    throw new Error(
      `[brand] Unknown BRAND="${raw}". Expected one of: ${Object.keys(brands).join(', ')}.`
    )
  }
  return raw as BrandId
}

export const BRAND_ID = resolveBrandId()
export const brand: BrandConfig = brands[BRAND_ID]

export { space, radius, fontSize } from './tokens'
export type {
  BrandConfig,
  BrandId,
  BrandTheme,
  BrandThemeSet,
  ThemeMode,
  ColorToken,
  ColorTokens
} from './types'
