import {
  useFonts,
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold
} from '@expo-google-fonts/hanken-grotesk'
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold
} from '@expo-google-fonts/jetbrains-mono'

// Mirrors the desktop's typefaces (apps/desktop/src/renderer/src/main.tsx):
// Hanken Grotesk for UI text, JetBrains Mono for the tracked uppercase labels.
// The map values are the fontFamily strings RN resolves once useAppFonts() has
// loaded them — the keys passed to useFonts() below become those family names.
export const fonts = {
  sans: {
    regular: 'HankenGrotesk_400Regular',
    medium: 'HankenGrotesk_500Medium',
    semibold: 'HankenGrotesk_600SemiBold',
    bold: 'HankenGrotesk_700Bold'
  },
  mono: {
    regular: 'JetBrainsMono_400Regular',
    medium: 'JetBrainsMono_500Medium',
    semibold: 'JetBrainsMono_600SemiBold'
  }
} as const

export type Fonts = typeof fonts

// Route-group layouts call this to hold first paint until the brand typefaces are
// loaded (RN renders nothing for an unknown fontFamily). Returns expo-font's
// [loaded, error] tuple. expo-font caches across callers, so gating in both the
// (auth) and (tabs) layouts is cheap.
export function useAppFonts(): [boolean, Error | null] {
  return useFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold
  })
}
