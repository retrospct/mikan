import { useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { initApiClient } from '../src/utils/api'
import { restoreToken } from '../src/utils/auth'

// Initialize the shared API client with the mobile base URL (t3-turbo pattern).
initApiClient()

export default function RootLayout() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    restoreToken().finally(() => setReady(true))
  }, [])

  if (!ready) return null

  return (
    <>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  )
}
