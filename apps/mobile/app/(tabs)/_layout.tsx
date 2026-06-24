import type { ReactElement } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { Tabs } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useAppFonts } from '../../src/theme/fonts'
import { useTheme } from '../../src/theme/useTheme'

// Tabs route-group layout. Gates on the brand typefaces, then themes the tab bar
// + headers from the Mikan tokens (active = primary, mono-uppercase labels echo
// the desktop bottom nav).
export default function TabsLayout(): ReactElement {
  const [fontsLoaded] = useAppFonts()
  const t = useTheme()

  if (!fontsLoaded) {
    return (
      <View style={[styles.splash, { backgroundColor: t.color.bg }]}>
        <ActivityIndicator color={t.color.primary} />
      </View>
    )
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.color.primary,
        tabBarInactiveTintColor: t.color.textMuted,
        tabBarStyle: { backgroundColor: t.color.surface, borderTopColor: t.color.border },
        tabBarLabelStyle: {
          fontFamily: t.fonts.mono.medium,
          fontSize: 9,
          letterSpacing: 1,
          textTransform: 'uppercase'
        },
        headerStyle: { backgroundColor: t.color.bg },
        headerTitleStyle: { fontFamily: t.fonts.sans.semibold, color: t.color.text },
        headerTintColor: t.color.text
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, size }) => <Feather name="inbox" color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="capture"
        options={{
          title: 'Capture',
          tabBarIcon: ({ color, size }) => <Feather name="plus-square" color={color} size={size} />
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center' }
})
