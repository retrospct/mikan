// theme.ts — accent (primary color) palettes + persistence.
//
// The accent drives every `--accent*` CSS var. `:root` in nimi.css derives the
// soft/faint/line variants from `--accent` via color-mix, so applying an accent
// only needs to set --accent / --accent-ink / --accent-deep on <html>.
//
// The selected accent persists in localStorage so it survives reloads. CSS vars
// are global, so applying an accent is enough to retheme the whole app — no
// React context or prop-drilling needed; components that need the *active* id
// (e.g. the Settings picker highlight) use `useAccent`.

export type AccentId = 'rose' | 'apricot' | 'matcha' | 'iris'

export interface AccentPalette {
  id: AccentId
  label: string
  /** the swatch + solid fills (--accent) */
  solid: string
  /** text-on-dark tint (--accent-ink) */
  ink: string
  /** deeper shade for light theme (--accent-deep) */
  deep: string
}

// Ordered for the picker. Rose (red) is the product default.
export const ACCENTS: Record<AccentId, AccentPalette> = {
  rose: {
    id: 'rose',
    label: 'Rose',
    solid: 'oklch(0.76 0.12 18)',
    ink: 'oklch(0.87 0.09 18)',
    deep: 'oklch(0.60 0.12 18)'
  },
  apricot: {
    id: 'apricot',
    label: 'Apricot',
    solid: 'oklch(0.80 0.12 64)',
    ink: 'oklch(0.90 0.09 64)',
    deep: 'oklch(0.64 0.12 64)'
  },
  matcha: {
    id: 'matcha',
    label: 'Matcha',
    solid: 'oklch(0.80 0.13 142)',
    ink: 'oklch(0.90 0.09 142)',
    deep: 'oklch(0.62 0.13 142)'
  },
  iris: {
    id: 'iris',
    label: 'Iris',
    solid: 'oklch(0.74 0.12 280)',
    ink: 'oklch(0.86 0.10 280)',
    deep: 'oklch(0.58 0.13 280)'
  }
}

export const ACCENT_LIST: AccentPalette[] = Object.values(ACCENTS)

export const DEFAULT_ACCENT: AccentId = 'rose'

const STORAGE_KEY = 'nimi.accent'

/** The persisted accent, falling back to the product default. */
export function readAccent(): AccentId {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v && v in ACCENTS) return v as AccentId
  } catch {
    // localStorage can throw in locked-down contexts; fall through to default.
  }
  return DEFAULT_ACCENT
}

/** Push an accent's vars onto <html>. Safe to call before React mounts. */
export function applyAccent(id: AccentId): void {
  const a = ACCENTS[id] ?? ACCENTS[DEFAULT_ACCENT]
  const el = document.documentElement
  el.style.setProperty('--accent', a.solid)
  el.style.setProperty('--accent-ink', a.ink)
  el.style.setProperty('--accent-deep', a.deep)
  el.setAttribute('data-accent', a.id)
}

/** Persist + apply in one call. */
export function saveAccent(id: AccentId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Non-fatal — the accent still applies for this session.
  }
  applyAccent(id)
}
