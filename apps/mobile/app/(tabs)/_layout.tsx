import type { ReactElement } from 'react'
import { Tabs } from 'expo-router'

export default function TabsLayout(): ReactElement {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#18181b' }}>
      <Tabs.Screen name="feed" options={{ title: 'Feed' }} />
      <Tabs.Screen name="capture" options={{ title: 'Capture' }} />
      {__DEV__ && <Tabs.Screen name="_spike-db" options={{ title: 'DB Spike' }} />}
    </Tabs>
  )
}
