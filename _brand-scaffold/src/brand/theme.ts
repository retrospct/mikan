import type { BrandThemeTokens } from './types';
import { brand } from './index';

// primary -> --brand-primary, surfaceMuted -> --brand-surface-muted
function cssVarName(token: string): string {
  return `--brand-${token.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
}

// Inline style object of every brand CSS variable. Spread onto a wrapper
// element (the BrandProvider does this) or :root.
export function brandCssVars(
  tokens: BrandThemeTokens = brand.theme,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tokens).map(([key, value]) => [cssVarName(key), value]),
  );
}

// Imperatively apply tokens to <html>. Use this if you'd rather set the
// variables globally on :root than scope them to a provider wrapper.
// Call once at renderer startup.
export function applyBrandTheme(tokens: BrandThemeTokens = brand.theme): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(cssVarName(key), value);
  }
}
