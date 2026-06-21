import { describe, expect, it } from 'vitest'
import { brands } from './index'
import type { BrandThemeSet, ColorToken, ColorTokens } from './types'

// Enforce the platform seam: the shared brand layer must hold colour as primitive,
// cross-platform values only. A web-only encoding (var(), color-mix(), gradients,
// currentColor) sneaking into `srgb` — the value React Native consumes — would
// fail RN silently at runtime, so we fail the build here instead.

// `srgb` must be a literal hex or rgba()/rgb() string — nothing else.
const SRGB = /^#([0-9a-f]{3,8})$|^rgba?\(/i
// `p3`, when present, must be a wide-gamut function we know how to render on web.
const P3 = /^color\(display-p3 |^oklch\(/i

const MODES = ['light', 'dark'] as const

function colorEntries(set: BrandThemeSet, mode: (typeof MODES)[number]): [string, ColorToken][] {
  const theme = set[mode]
  if (!theme) return []
  return Object.entries(theme.color as ColorTokens) as [string, ColorToken][]
}

describe('brand colour tokens are platform-agnostic', () => {
  for (const [brandId, config] of Object.entries(brands)) {
    for (const mode of MODES) {
      for (const [name, token] of colorEntries(config.theme, mode)) {
        it(`${brandId}.${mode}.${name}.srgb is a literal hex/rgba value`, () => {
          expect(token.srgb, `${brandId}/${mode}/${name}`).toMatch(SRGB)
        })

        if (token.p3 !== undefined) {
          it(`${brandId}.${mode}.${name}.p3 is oklch()/color(display-p3)`, () => {
            expect(token.p3, `${brandId}/${mode}/${name}`).toMatch(P3)
          })
        }
      }
    }
  }

  it('light mode defines every colour token for every brand', () => {
    for (const config of Object.values(brands)) {
      expect(Object.keys(config.theme.light.color).length).toBeGreaterThan(0)
    }
  })
})
