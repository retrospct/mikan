import type { SyncSettings, SyncStatus } from '@mikan/contract/ipc'
import { useCallback, useEffect, useRef, useState } from 'react'
import { isElectron } from '../mikan/api'

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

const DEFAULT_SETTINGS: SyncSettings = { enabled: false, hasKey: false, available: false }

/**
 * Settings-side companion to useSync: the main-owned sync *settings* (toggle
 * intent, key presence, broker availability) plus the actions that mutate them.
 * Each action restarts the data worker in main and resolves with fresh settings.
 */
export function useSyncSettings(): {
  settings: SyncSettings
  busy: boolean
  setEnabled: (enabled: boolean) => Promise<void>
  importKey: (hex: string) => Promise<void>
  revealKey: () => Promise<string | null>
} {
  const [settings, setSettings] = useState<SyncSettings>(DEFAULT_SETTINGS)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isElectron) return
    let active = true
    window.api.sync
      .getSettings()
      .then((s) => active && setSettings(s))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const setEnabled = useCallback((enabled: boolean): Promise<void> => {
    if (!isElectron) return Promise.resolve()
    setBusy(true)
    return window.api.sync
      .setEnabled(enabled)
      .then((s) => setSettings(s))
      .catch((e) => console.error('sync setEnabled failed', e))
      .finally(() => setBusy(false))
  }, [])

  // Errors propagate so the caller can surface an "invalid key" message.
  const importKey = useCallback((hex: string): Promise<void> => {
    if (!isElectron) return Promise.reject(new Error('not available'))
    setBusy(true)
    return window.api.sync
      .setRecoveryKey(hex)
      .then((s) => setSettings(s))
      .finally(() => setBusy(false))
  }, [])

  const revealKey = useCallback((): Promise<string | null> => {
    if (!isElectron) return Promise.resolve(null)
    return window.api.sync.getRecoveryKey()
  }, [])

  if (!isElectron) {
    return {
      settings: DEFAULT_SETTINGS,
      busy: false,
      setEnabled: () => Promise.resolve(),
      importKey: () => Promise.reject(new Error('not available')),
      revealKey: () => Promise.resolve(null)
    }
  }

  return { settings, busy, setEnabled, importKey, revealKey }
}
