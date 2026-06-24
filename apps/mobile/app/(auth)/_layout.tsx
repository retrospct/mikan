import type { ReactElement } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { Slot } from 'expo-router'
import { useAppFonts } from '../../src/theme/fonts'
import { useTheme } from '../../src/theme/useTheme'

// Auth route-group layout. Gates first paint on the brand typefaces (so login
// renders in Hanken/JetBrains, not a fallback) without touching the shared root
// app/_layout.tsx.
export default function AuthLayout(): ReactElement {
  const [fontsLoaded] = useAppFonts()
  const t = useTheme()

  if (!fontsLoaded) {
    return (
      <View style={[styles.splash, { backgroundColor: t.color.bg }]}>
        <ActivityIndicator color={t.color.primary} />
      </View>
    )
  }
  return <Slot />
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center' }
})
