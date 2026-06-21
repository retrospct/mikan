// Web/Electron adapter: project the active brand's colour tokens onto CSS custom
// properties (--brand-*). DOM-only — never import this from React Native.
//
// We prefer each token's OKLCH `p3` value: Electron's Chromium renders it
// wide-gamut on P3 displays and clamps to sRGB elsewhere, so one value covers both
// while the `srgb` hex stays the explicit fallback (and the RN source of truth).

import type { BrandTheme, ColorToken, ThemeMode } from '../types'
import { brand } from '../index'

// primary -> --brand-primary, surfaceMuted -> --brand-surface-muted
function cssVarName(token: string): string {
  return `--brand-${token.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`
}

function colorValue(token: ColorToken): string {
  return token.p3 ?? token.srgb
}

// The renderer drives light/dark via <html data-theme="…">. Read it so the brand
// vars match the active mode; default to light when unset/unknown.
export function currentMode(): ThemeMode {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

function resolveTheme(mode: ThemeMode): BrandTheme {
  return brand.theme[mode] ?? brand.theme.light
}

// Imperatively apply the active brand+mode tokens to <html>. Safe to call before
// React mounts; call again when the mode changes (BrandProvider observes it).
export function applyBrandTheme(mode: ThemeMode = currentMode()): void {
  if (typeof document === 'undefined') return
  const theme = resolveTheme(mode)
  const root = document.documentElement
  for (const [name, token] of Object.entries(theme.color)) {
    root.style.setProperty(cssVarName(name), colorValue(token))
  }
  if (theme.fontDisplay) root.style.setProperty('--brand-font-display', theme.fontDisplay)
  if (theme.fontBody) root.style.setProperty('--brand-font-body', theme.fontBody)
}
