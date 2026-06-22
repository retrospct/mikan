import identity from '../identity.json'
import type { BrandConfig } from '../types'

// Momo = peach. Softer and pinker than Mikan: blush ground, coral primary, a rose
// accent in place of Mikan's leaf-green. Placeholder palette until Momo graduates
// from contender to a brand we're actually shipping.
//
// Same token contract as Mikan: sRGB hex (cross-platform / RN) + OKLCH `p3` (web).
// OKLCH values are a first pass — tune against an APCA/contrast + gamut tool.
export const momo: BrandConfig = {
  id: 'momo',
  productName: identity.momo.productName,
  appId: identity.momo.appId,
  scheme: identity.momo.scheme,
  icon: identity.momo.icon,
  tagline: 'Your private, searchable memory.',
  urls: {
    site: 'https://getmomo.now',
    support: 'https://getmomo.now/support'
  },
  theme: {
    light: {
      color: {
        bg: { srgb: '#FFF8F5', p3: 'oklch(0.985 0.008 40)' },
        surface: { srgb: '#FFFFFF', p3: 'oklch(1 0 0)' },
        surfaceMuted: { srgb: '#FDEFEA', p3: 'oklch(0.957 0.014 37)' },
        border: { srgb: '#F3DDD4', p3: 'oklch(0.900 0.022 38)' },
        text: { srgb: '#241B17', p3: 'oklch(0.262 0.016 47)' },
        textMuted: { srgb: '#6E5A50', p3: 'oklch(0.503 0.024 47)' },
        primary: { srgb: '#EF7E66', p3: 'oklch(0.720 0.132 35)' },
        primaryActive: { srgb: '#D9684F', p3: 'oklch(0.648 0.140 33)' },
        onPrimary: { srgb: '#FFFFFF', p3: 'oklch(1 0 0)' },
        accent: { srgb: '#E27D9A', p3: 'oklch(0.708 0.108 4)' },
        success: { srgb: '#3F8F5B', p3: 'oklch(0.598 0.115 153)' },
        warning: { srgb: '#E0A100', p3: 'oklch(0.755 0.152 82)' },
        danger: { srgb: '#DC2626', p3: 'oklch(0.580 0.216 27)' },
        ring: { srgb: '#EF7E66', p3: 'oklch(0.720 0.132 35)' }
      }
    },
    dark: {
      color: {
        bg: { srgb: '#1E1714', p3: 'oklch(0.210 0.010 40)' },
        surface: { srgb: '#281F1B', p3: 'oklch(0.252 0.012 40)' },
        surfaceMuted: { srgb: '#322722', p3: 'oklch(0.293 0.014 40)' },
        border: { srgb: '#42342D', p3: 'oklch(0.360 0.018 40)' },
        text: { srgb: '#EFE4DE', p3: 'oklch(0.928 0.010 47)' },
        textMuted: { srgb: '#B8A599', p3: 'oklch(0.723 0.020 47)' },
        primary: { srgb: '#F4917A', p3: 'oklch(0.760 0.125 35)' },
        primaryActive: { srgb: '#E0735A', p3: 'oklch(0.690 0.138 33)' },
        onPrimary: { srgb: '#2A1410', p3: 'oklch(0.230 0.040 30)' },
        accent: { srgb: '#EC95AE', p3: 'oklch(0.770 0.100 4)' },
        success: { srgb: '#5BAE78', p3: 'oklch(0.703 0.118 153)' },
        warning: { srgb: '#F0B83A', p3: 'oklch(0.805 0.143 82)' },
        danger: { srgb: '#F05151', p3: 'oklch(0.660 0.193 27)' },
        ring: { srgb: '#F4917A', p3: 'oklch(0.760 0.125 35)' }
      }
    }
  }
}
