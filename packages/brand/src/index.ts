// The neutral entry point — the one place the rest of the app imports the active
// brand from. Imports NOTHING from React, the DOM, or Tailwind, so it's safe in
// the Electron main process, the renderer, and the React Native app alike.
// Platform-specific application lives in ./web (CSS vars) and ./native (JS object).

import type { BrandConfig } from './types'
import { mikan } from './brands/mikan'

// Single brand: Mikan. The dual-brand concept was dropped, so the selection
// machinery it required — a `BRAND` env var, the electron-vite `__BRAND__`
// build-time define, and a brands registry keyed by id — is gone too. Every
// consumer imports `brand`; reintroducing a second brand would mean restoring a
// registry + resolver here (see git history).
export const brand: BrandConfig = mikan

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
