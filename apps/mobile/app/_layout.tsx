import type { ReactElement } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { initApiClient } from '../src/utils/api'

// Initialize the shared API client with the mobile base URL (t3-turbo pattern).
initApiClient()

export default function RootLayout(): ReactElement {
  // Auth + DB bootstrap and the initial redirect live in app/index.tsx; this
  // layout just mounts the file-based navigator.
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  )
}
