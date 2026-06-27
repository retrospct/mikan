import type { UpdateStatus } from '@mikan/contract/ipc'
import { useCallback, useEffect, useState } from 'react'
import { isElectron } from '../mikan/api'

const DEFAULT: UpdateStatus = {
  stage: 'idle',
  version: null,
  progress: null,
  error: null
}

/**
 * Bridges the renderer to the auto-updater state (window.api.update).
 * Subscribes to the push channel so state updates arrive immediately —
 * no polling needed. Also seeds from getStatus() on mount so the
 * Settings page shows the correct state when opened mid-download.
 */
export function useUpdate(): {
  status: UpdateStatus
  checkNow: () => void
  quitAndInstall: () => void
} {
  const [status, setStatus] = useState<UpdateStatus>(DEFAULT)

  useEffect(() => {
    if (!isElectron) return
    let active = true

    window.api.update
      .getStatus()
      .then((s) => {
        if (active) setStatus(s)
      })
      .catch(() => {})

    const unsub = window.api.update.onChanged((s) => {
      if (active) setStatus(s)
    })

    return () => {
      active = false
      unsub()
    }
  }, [])

  const checkNow = useCallback(() => {
    if (!isElectron) return
    window.api.update.checkNow().catch(() => {})
  }, [])

  const quitAndInstall = useCallback(() => {
    if (!isElectron) return
    void window.api.update.quitAndInstall()
  }, [])

  if (!isElectron) return { status: DEFAULT, checkNow: () => {}, quitAndInstall: () => {} }

  return { status, checkNow, quitAndInstall }
}
