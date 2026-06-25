// Brand + token type contract. Platform-agnostic: this file imports nothing and
// must never reference React, React Native, the DOM, or Tailwind. Each platform
// writes its own adapter (src/web, src/native) that consumes these values.

// The brand this codebase builds. Modeled as a (currently single-member) union so a
// second brand can be reintroduced by adding an id here, a config under brands/,
// registering it in index.ts, and adding its entry to identity.json.
export type BrandId = 'mikan'

// A single colour, carried in BOTH representations so one token works everywhere:
//   - `srgb`  literal #hex or rgba() — the cross-platform fallback. React Native
//             and any non-OKLCH consumer use this directly.
//   - `p3`    OPTIONAL wide-gamut value as an oklch()/color(display-p3) string.
//             The web adapter prefers it (Chromium clamps OKLCH to the display
//             gamut, so P3 panels get wide-gamut colour and sRGB panels degrade
//             gracefully). NEVER put a web-only value (var(), oklch()) in `srgb`.
export interface ColorToken {
  srgb: string
  p3?: string
}

// The brand-variant colour surface. Only colour (and optionally a display/body
// font) differs between brands; spacing/radii/type live in brand-agnostic system
// tokens (tokens.ts), never duplicated here.
export interface ColorTokens {
  // surfaces
  bg: ColorToken
  surface: ColorToken
  surfaceMuted: ColorToken
  border: ColorToken
  // text
  text: ColorToken
  textMuted: ColorToken
  // brand
  primary: ColorToken
  primaryActive: ColorToken // web maps to :hover/:active, RN to pressed (not "hover")
  onPrimary: ColorToken
  accent: ColorToken
  // semantic
  success: ColorToken
  warning: ColorToken
  danger: ColorToken
  // focus
  ring: ColorToken
}

// One resolved theme (a single mode). Fonts are optional brand overrides.
export interface BrandTheme {
  color: ColorTokens
  fontDisplay?: string
  fontBody?: string
}

// Mode-aware shape so dark mode is just a second BrandTheme of identical shape —
// no refactor later. Brand is fixed per build; light/dark is a runtime mode
// *within* a brand.
export interface BrandThemeSet {
  light: BrandTheme
  dark?: BrandTheme
}

export type ThemeMode = keyof BrandThemeSet

export interface BrandConfig {
  // Stable internal id. Not user-visible beyond debugging.
  id: BrandId
  // Display name: window title, about box, anywhere the product is named.
  productName: string
  // Reverse-DNS bundle identifier, baked into the package at build time.
  appId: string
  // Custom deep-link scheme for the OAuth callback (e.g. `mikan` -> mikan://callback).
  scheme: string
  // One-line positioning for marketing surfaces and empty states.
  tagline: string
  // Canonical URLs for this brand (decoupled from appId).
  urls: {
    site: string
    support: string
  }
  // Path (relative to the desktop app root) to the icon used at build time.
  icon: string
  // Mode-aware colour theme injected by each platform adapter.
  theme: BrandThemeSet
}
