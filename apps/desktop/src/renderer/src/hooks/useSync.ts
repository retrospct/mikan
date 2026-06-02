import { useCallback, useEffect, useRef, useState } from 'react'
import type { SyncStatus } from '@nimi/contract/ipc'
import { isElectron } from '../nimi/api'

const DEFAULT: SyncStatus = {
  enabled: false,
  lastSyncAt: null,
  lastSyncDurationMs: null,
  syncing: false,
  error: null
}

/** How often to re-poll worker sync status. There's no push event yet, so we poll. */
const POLL_MS = 5000

const NOOP = (): void => {}

/**
 * Bridges the renderer to the worker's Turso sync status (window.api.sync).
 * Polls `getStatus` on an interval — paused when the document is hidden to avoid
 * needless IPC when the window is minimised. Outside Electron (browser preview)
 * returns a static disabled state + stable no-op, mirroring the useConnectors pattern.
 */
export function useSync(): { status: SyncStatus; syncNow: () => void } {
  const [status, setStatus] = useState<SyncStatus>(DEFAULT)
  const syncNowInFlight = useRef(false)

  useEffect(() => {
    if (!isElectron) return
    let active = true

    const poll = (): void => {
      if (document.hidden) return
      window.api.sync
        .getStatus()
        .then((s) => {
          if (active) setStatus(s)
        })
        .catch(() => {}) // best-effort; never surface a poll error
    }

    poll()
    const id = setInterval(poll, POLL_MS)
    const onVisible = (): void => {
      if (!document.hidden) poll()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      active = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const syncNow = useCallback(() => {
    if (!isElectron || syncNowInFlight.current) return
    syncNowInFlight.current = true
    setStatus((current) => ({ ...current, syncing: true }))
    window.api.sync
      .now()
      .then(() => window.api.sync.getStatus())
      .then(setStatus)
      .catch((e) => console.error('sync now failed', e))
      .finally(() => {
        syncNowInFlight.current = false
        setStatus((current) => ({ ...current, syncing: false }))
      })
  }, [])

  if (!isElectron) return { status: DEFAULT, syncNow: NOOP }

  return { status, syncNow }
}
