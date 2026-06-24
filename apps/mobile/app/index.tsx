import { useEffect, useState, type ReactElement } from 'react'
import { Redirect } from 'expo-router'
import { restoreToken, clearStoredToken } from '../src/utils/auth'
import { bootstrapDb } from '../src/db/bootstrap'

type Target = '/(tabs)/feed' | '/(auth)/login'

/**
 * Entry route + auth gate. Restores the persisted token and opens the per-user
 * Turso replica before routing to the tabs. A token the broker rejects (e.g. a
 * stale/opaque/expired one → 401) is cleared and the user is sent to login.
 * (Replaces the old dynamic `initialRouteName`, which expo-router can't resolve
 * against a group route.)
 */
export default function Index(): ReactElement | null {
  const [target, setTarget] = useState<Target | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const token = await restoreToken()
      if (!token) {
        if (!cancelled) setTarget('/(auth)/login')
        return
      }
      try {
        await bootstrapDb(token)
        if (!cancelled) setTarget('/(tabs)/feed')
      } catch (e) {
        // Token rejected (broker 401) or sync unreachable — drop it, re-auth.
        console.warn('[nimi/db] startup bootstrap failed, clearing token:', e)
        await clearStoredToken()
        if (!cancelled) setTarget('/(auth)/login')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!target) return null
  return <Redirect href={target} />
}
