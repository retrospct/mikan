import { useCallback, useEffect, useState } from 'react'
import { type AccentId, applyAccent, readAccent, saveAccent } from '../nimi/theme'

/**
 * The active accent (primary color) + a setter that persists and applies it.
 * Accent CSS vars are global, so the setter retheme's the whole app immediately;
 * the returned `accent` is only needed for UI that highlights the current choice.
 */
export function useAccent(): { accent: AccentId; setAccent: (id: AccentId) => void } {
  const [accent, setAccentState] = useState<AccentId>(() => readAccent())

  // Keep <html> in sync with state (covers the initial mount too).
  useEffect(() => {
    applyAccent(accent)
  }, [accent])

  const setAccent = useCallback((id: AccentId): void => {
    setAccentState(id)
    saveAccent(id)
  }, [])

  return { accent, setAccent }
}
