import { useEffect, useState, type ReactElement } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { initApiClient } from '../src/utils/api'
import { restoreToken } from '../src/utils/auth'

// Initialize the shared API client with the mobile base URL (t3-turbo pattern).
initApiClient()

export default function RootLayout(): ReactElement | null {
  const [ready, setReady] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    restoreToken()
      .then(setToken)
      .finally(() => setReady(true))
  }, [])

  if (!ready) return null

  return (
    <>
      <StatusBar style="auto" />
      <Stack initialRouteName={token ? '(tabs)' : '(auth)'}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  )
}
