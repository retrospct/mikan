import { useEffect, useState, type ReactElement } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { initApiClient } from '../src/utils/api'
import { restoreToken } from '../src/utils/auth'
import { openDb } from '../src/db'

// Initialize the shared API client with the mobile base URL (t3-turbo pattern).
initApiClient()

const BROKER_URL = process.env.EXPO_PUBLIC_BROKER_URL ?? 'https://token-broker.vercel.app'

export default function RootLayout(): ReactElement | null {
  const [ready, setReady] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    restoreToken()
      .then(async (accessToken) => {
        setToken(accessToken)
        // Spike: if we have an access token, exchange it with the broker for
        // a per-user Turso DB token and open the local embedded-replica DB.
        // This mirrors exactly what the desktop worker does at startup.
        if (accessToken) {
          try {
            const res = await fetch(`${BROKER_URL}/token`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${accessToken}` },
            })
            if (res.ok) {
              const { syncUrl, authToken } = await res.json() as {
                syncUrl: string
                authToken: string
                expiresAt: number
              }
              await openDb({ syncUrl, authToken })
            }
          } catch (e) {
            // Non-fatal for spike: app still works with API-only fallback
            console.warn('[db-spike] broker error:', e)
          }
        }
      })
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
