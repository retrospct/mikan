// React Native adapter SEAM. Imported via `@mikan/brand/native`. Contains NO DOM
// and NO Tailwind — just flattens the active brand+mode tokens into a plain JS
// object RN styles can consume (StyleSheet, and later Unistyles, the recorded
// future RN styling layer). RN uses the `srgb` value today; wide-gamut (DisplayP3)
// can layer in later without changing this contract.
//
// This is intentionally minimal: it leaves a clean seam so brand tokens are
// consumable on mobile, without committing the RN app to a styling system yet.

import type { ThemeMode } from '../types'
import { brand, space, radius, fontSize } from '../index'

export interface NativeTheme {
  color: Record<string, string>
  space: typeof space
  radius: typeof radius
  fontSize: typeof fontSize
}

export function nativeTheme(mode: ThemeMode = 'light'): NativeTheme {
  const theme = brand.theme[mode] ?? brand.theme.light
  const color = Object.fromEntries(
    Object.entries(theme.color).map(([name, token]) => [name, token.srgb])
  )
  return { color, space, radius, fontSize }
}

export { brand, space, radius, fontSize }
