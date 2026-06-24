import { useEffect, useState, type ReactElement } from 'react'
import { Redirect } from 'expo-router'
import { restoreToken } from '../src/utils/auth'

/**
 * Entry route. Redirects to the tabs (if a token is persisted) or the login
 * screen. Replaces the old dynamic `initialRouteName` on the root Stack, which
 * expo-router can't resolve against a group route.
 */
export default function Index(): ReactElement | null {
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    restoreToken().then((token) => setAuthed(!!token))
  }, [])

  if (authed === null) return null
  return authed ? <Redirect href="/(tabs)/feed" /> : <Redirect href="/(auth)/login" />
}
