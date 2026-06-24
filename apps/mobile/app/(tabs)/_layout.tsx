import type { ReactElement } from 'react'
import { Tabs } from 'expo-router'

export default function TabsLayout(): ReactElement {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#18181b' }}>
      <Tabs.Screen name="feed" options={{ title: 'Feed' }} />
      <Tabs.Screen name="capture" options={{ title: 'Capture' }} />
      {/* Dev-only spike screen — keep off the tab bar. */}
      <Tabs.Screen name="_spike-db" options={{ href: null }} />
    </Tabs>
  )
}
