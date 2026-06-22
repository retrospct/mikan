import type { BrandConfig, BrandId } from './types';
import { mikan } from './brands/mikan';
import { momo } from './brands/momo';

const registry: Record<BrandId, BrandConfig> = { mikan, momo };

const DEFAULT_BRAND: BrandId = 'mikan';

function resolveBrandId(): BrandId {
  // Build-time selection. In the Electron main process this reads
  // process.env.BRAND. In the Vite renderer, wire the same value through
  // `define` (see README) so it's inlined at build instead of read at runtime.
  const raw =
    (typeof process !== 'undefined' ? process.env?.BRAND : undefined) ??
    DEFAULT_BRAND;

  if (!(raw in registry)) {
    throw new Error(
      `[brand] Unknown BRAND="${raw}". Expected one of: ${Object.keys(registry).join(', ')}.`,
    );
  }
  return raw as BrandId;
}

// The one place the rest of the app imports from.
export const BRAND_ID = resolveBrandId();
export const brand: BrandConfig = registry[BRAND_ID];

export type { BrandConfig, BrandId, BrandThemeTokens } from './types';
