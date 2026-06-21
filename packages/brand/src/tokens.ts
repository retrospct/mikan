// Brand-AGNOSTIC system tokens: the shared design system, constant across all
// brands. Unitless numbers so each platform applies units its own way (the web
// adapter appends `px`; React Native uses the number directly). Spacing, radii,
// and the type scale do NOT belong inside a brand config — that invites drift.
//
// Only colour (tokens.ColorTokens, per brand) varies between Mikan and Momo.

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32 } as const

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const

export const fontSize = { xs: 12, sm: 14, md: 16, lg: 20, xl: 28 } as const

export type SpaceToken = keyof typeof space
export type RadiusToken = keyof typeof radius
export type FontSizeToken = keyof typeof fontSize

// Re-export the colour token shape here so consumers can pull the whole token
// contract from `@nimi/brand/tokens` without reaching into types.
export type { ColorToken, ColorTokens } from './types'
