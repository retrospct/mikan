import identity from '../identity.json'
import type { BrandConfig } from '../types'

// Mikan = mandarin orange. Bright citrus rind, warm paper-white ground in light,
// a deep roasted-rind ground in dark, a single leaf-green accent. Clean, a little
// playful.
//
// Colours carry an sRGB hex (cross-platform fallback / RN) + an OKLCH `p3` value
// (web prefers it; Chromium renders wide-gamut on P3 panels, clamps on sRGB).
// NOTE: OKLCH values are a tuned first pass — refine against an APCA/contrast +
// gamut tool before GA. The hex and OKLCH for a token should read as the same hue.
export const mikan: BrandConfig = {
  id: 'mikan',
  productName: identity.mikan.productName,
  appId: identity.mikan.appId,
  scheme: identity.mikan.scheme,
  icon: identity.mikan.icon,
  tagline: 'Your private, searchable memory.',
  urls: {
    site: 'https://getmikan.com',
    support: 'https://getmikan.com/support'
  },
  theme: {
    light: {
      color: {
        bg: { srgb: '#FFFCF7', p3: 'oklch(0.992 0.006 80)' },
        surface: { srgb: '#FFFFFF', p3: 'oklch(1 0 0)' },
        surfaceMuted: { srgb: '#FBF3EA', p3: 'oklch(0.967 0.012 75)' },
        border: { srgb: '#ECE0D2', p3: 'oklch(0.905 0.016 76)' },
        text: { srgb: '#211A14', p3: 'oklch(0.252 0.018 60)' },
        textMuted: { srgb: '#6B5D50', p3: 'oklch(0.503 0.021 66)' },
        primary: { srgb: '#F2741A', p3: 'oklch(0.704 0.173 47)' },
        primaryActive: { srgb: '#D8610E', p3: 'oklch(0.633 0.172 46)' },
        onPrimary: { srgb: '#FFFFFF', p3: 'oklch(1 0 0)' },
        accent: { srgb: '#3F8F5B', p3: 'oklch(0.598 0.115 153)' },
        success: { srgb: '#3F8F5B', p3: 'oklch(0.598 0.115 153)' },
        warning: { srgb: '#E0A100', p3: 'oklch(0.755 0.152 82)' },
        danger: { srgb: '#DC2626', p3: 'oklch(0.580 0.216 27)' },
        ring: { srgb: '#F2741A', p3: 'oklch(0.704 0.173 47)' }
      }
    },
    dark: {
      color: {
        bg: { srgb: '#1C1814', p3: 'oklch(0.205 0.011 62)' },
        surface: { srgb: '#262019', p3: 'oklch(0.248 0.013 62)' },
        surfaceMuted: { srgb: '#2F2820', p3: 'oklch(0.288 0.014 62)' },
        border: { srgb: '#3D352B', p3: 'oklch(0.355 0.016 64)' },
        text: { srgb: '#ECE6DD', p3: 'oklch(0.928 0.010 80)' },
        textMuted: { srgb: '#B3A797', p3: 'oklch(0.723 0.018 76)' },
        primary: { srgb: '#F98933', p3: 'oklch(0.745 0.160 50)' },
        primaryActive: { srgb: '#E5731C', p3: 'oklch(0.680 0.168 48)' },
        onPrimary: { srgb: '#231603', p3: 'oklch(0.220 0.045 60)' },
        accent: { srgb: '#5BAE78', p3: 'oklch(0.703 0.118 153)' },
        success: { srgb: '#5BAE78', p3: 'oklch(0.703 0.118 153)' },
        warning: { srgb: '#F0B83A', p3: 'oklch(0.805 0.143 82)' },
        danger: { srgb: '#F05151', p3: 'oklch(0.660 0.193 27)' },
        ring: { srgb: '#F98933', p3: 'oklch(0.745 0.160 50)' }
      }
    }
  }
}
