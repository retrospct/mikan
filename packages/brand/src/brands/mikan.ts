import identity from '../identity.json'
import type { BrandConfig } from '../types'

// Mikan — deep teal primary on a warm paper ground, with a clay accent. Calm and
// editorial rather than loud. Light is paper/ink; dark is a warm near-black with a
// brightened teal. The diamond mark + every --accent surface pick up `primary`.
//
// Colours carry an sRGB hex (cross-platform / RN) + an OKLCH `p3` value (web prefers
// it; Chromium renders wide-gamut on P3 panels, clamps on sRGB). OKLCH values are a
// tuned first pass — refine against an APCA/contrast tool before GA.
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
        bg: { srgb: '#F5F5F1', p3: 'oklch(0.965 0.004 95)' },
        surface: { srgb: '#FCFCFA', p3: 'oklch(0.990 0.002 95)' },
        surfaceMuted: { srgb: '#ECEAE3', p3: 'oklch(0.930 0.007 92)' },
        border: { srgb: '#E3E1D9', p3: 'oklch(0.900 0.008 92)' },
        text: { srgb: '#17191D', p3: 'oklch(0.225 0.008 265)' },
        textMuted: { srgb: '#565C63', p3: 'oklch(0.460 0.013 255)' },
        primary: { srgb: '#0F5E57', p3: 'oklch(0.430 0.082 184)' },
        primaryActive: { srgb: '#0B4A44', p3: 'oklch(0.360 0.072 184)' },
        onPrimary: { srgb: '#FBFBF8', p3: 'oklch(0.985 0.003 95)' },
        accent: { srgb: '#9A5316', p3: 'oklch(0.500 0.110 56)' },
        success: { srgb: '#2E8B6F', p3: 'oklch(0.565 0.088 165)' },
        warning: { srgb: '#B5701A', p3: 'oklch(0.605 0.115 62)' },
        danger: { srgb: '#C0392B', p3: 'oklch(0.515 0.165 28)' },
        ring: { srgb: '#0F5E57', p3: 'oklch(0.430 0.082 184)' }
      }
    },
    dark: {
      color: {
        bg: { srgb: '#16181C', p3: 'oklch(0.225 0.006 265)' },
        surface: { srgb: '#1D2025', p3: 'oklch(0.270 0.007 262)' },
        surfaceMuted: { srgb: '#262A2F', p3: 'oklch(0.320 0.008 260)' },
        border: { srgb: '#323740', p3: 'oklch(0.380 0.010 258)' },
        text: { srgb: '#ECEAE3', p3: 'oklch(0.925 0.006 95)' },
        textMuted: { srgb: '#9BA1A8', p3: 'oklch(0.705 0.012 250)' },
        primary: { srgb: '#35A697', p3: 'oklch(0.665 0.088 180)' },
        primaryActive: { srgb: '#2B8C7F', p3: 'oklch(0.580 0.082 181)' },
        onPrimary: { srgb: '#06211E', p3: 'oklch(0.215 0.038 184)' },
        accent: { srgb: '#C77B33', p3: 'oklch(0.665 0.110 62)' },
        success: { srgb: '#4FB389', p3: 'oklch(0.720 0.098 165)' },
        warning: { srgb: '#D89A3A', p3: 'oklch(0.745 0.110 70)' },
        danger: { srgb: '#E06A5A', p3: 'oklch(0.660 0.150 28)' },
        ring: { srgb: '#35A697', p3: 'oklch(0.665 0.088 180)' }
      }
    }
  }
}
