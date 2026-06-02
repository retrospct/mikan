import { useEffect, useState } from 'react'
import type { SyncStatus } from '@nimi/contract/ipc'
import { isElectron } from '../nimi/api'

const DEFAULT: SyncStatus = { enabled: false, lastSyncAt: null, syncing: false, error: null }

/** How often to re-poll worker sync status. There's no push event yet, so we poll. */
const POLL_MS = 5000

/**
 * Bridges the renderer to the worker's Turso sync status (window.api.sync).
 * Polls `getStatus` on an interval since there's no change event yet. Outside
 * Electron (browser preview) returns a static disabled state + no-op — mirrors
 * the useConnectors pattern.
 */
export function useSync(): { status: SyncStatus; syncNow: () => void } {
  const [status, setStatus] = useState<SyncStatus>(DEFAULT)

  useEffect(() => {
    if (!isElectron) return
    let active = true
    const poll = (): void => {
      window.api.sync
        .getStatus()
        .then((s) => {
          if (active) setStatus(s)
        })
        .catch(() => {}) // status polling is best-effort; never surface a poll error
    }
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [])

  if (!isElectron) return { status: DEFAULT, syncNow: () => {} }

  return {
    status,
    syncNow: () => {
      window.api.sync
        .now()
        .then(() => window.api.sync.getStatus())
        .then(setStatus)
        .catch((e) => console.error('sync now failed', e))
    }
  }
}
