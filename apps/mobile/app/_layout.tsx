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

  useEffect(() => {
    restoreToken()
      .then(async (accessToken) => {
        // Exchange the Logto access token with the token broker for a per-user
        // Turso DB credential, then open the local embedded-replica. This mirrors
        // what the desktop worker does at startup (ADR 0008 + 0009).
        if (accessToken) {
          try {
            const res = await fetch(`${BROKER_URL}/token`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${accessToken}` },
            })
            if (!res.ok) throw new Error(`Broker ${res.status}`)
            const { syncUrl, authToken } = (await res.json()) as {
              syncUrl: string
              authToken: string
              expiresAt: number
            }
            await openDb({ syncUrl, authToken })
          } catch (e) {
            // Non-fatal: screens degrade to "Log in" empty state.
            // Covers: broker env unset, network offline at launch, first-ever login.
            console.warn('[nimi/db] broker or openDb failed:', e)
          }
        }
      })
      .finally(() => setReady(true))
  }, [])

  if (!ready) return null

  // Routing is file-based: app/index.tsx redirects to (auth) or (tabs) based on
  // the persisted token. (A dynamic `initialRouteName` on a group route is not
  // supported by expo-router and crashed the app — use an index redirect instead.)
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  )
}
