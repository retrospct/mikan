import { useMemo } from 'react'
import { useColorScheme } from 'react-native'
import type { ThemeMode } from '@nimi/brand'
import { nativeTheme, type NativeTheme } from '@nimi/brand/native'
import { fonts, type Fonts } from './fonts'

export interface Theme extends NativeTheme {
  mode: ThemeMode
  fonts: Fonts
}

// Provider-free theme hook: derive the active theme from the OS colour scheme +
// the brand's native token adapter (@nimi/brand/native). nativeTheme() is a cheap
// pure flatten, memoised per mode, so screens can call this directly with no
// context provider — which keeps us out of the shared root app/_layout.tsx while
// the data-path branch is in flight. A centralising ThemeProvider can layer on
// later without changing this call site.
export function useTheme(): Theme {
  const scheme = useColorScheme()
  const mode: ThemeMode = scheme === 'dark' ? 'dark' : 'light'
  return useMemo(() => ({ ...nativeTheme(mode), mode, fonts }), [mode])
}
