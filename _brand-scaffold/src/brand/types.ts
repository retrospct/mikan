// The set of brands this codebase can build. Add a new id here, add a config
// file under brands/, and register it in index.ts + identity.json. That's it.
export type BrandId = 'mikan' | 'momo';

// Design tokens. The renderer consumes these as CSS custom properties
// (primary -> --brand-primary), so the app never hardcodes a color.
export interface BrandThemeTokens {
  // surfaces
  bg: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  // text
  text: string;
  textMuted: string;
  // brand
  primary: string;
  primaryHover: string;
  onPrimary: string;
  accent: string;
  // semantic
  success: string;
  warning: string;
  danger: string;
  // focus
  ring: string;
}

export interface BrandConfig {
  // Stable internal id. Not user-visible beyond debugging.
  id: BrandId;
  // Display name: window title, about box, anywhere the product is named.
  productName: string;
  // Reverse-DNS bundle identifier, used when packaging the app.
  appId: string;
  // One-line positioning for marketing surfaces and empty states.
  tagline: string;
  // Canonical URLs for this brand.
  urls: {
    site: string;
    support: string;
  };
  // Path (relative to project root) to the icon used at build time.
  icon: string;
  // Tokens injected as CSS variables by the renderer.
  theme: BrandThemeTokens;
}
