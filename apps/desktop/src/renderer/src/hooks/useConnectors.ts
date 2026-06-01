import { useEffect, useState } from 'react'
import type { ConnectorsState, ConnectorId } from '@nimi/contract/ipc'
import { isElectron } from '../nimi/api'

const EMPTY: ConnectorsState = {
  configured: false,
  gmail: { connected: false, lastSyncAt: null, itemCount: 0 },
  gcal: { connected: false, lastSyncAt: null, itemCount: 0 }
}

/**
 * Bridges the renderer to the main-process Google connector flow.
 * Outside Electron (browser preview) returns a static unconfigured state
 * and no-op actions — mirrors the `useAuth` pattern.
 */
export function useConnectors(): {
  state: ConnectorsState
  connect: (provider: ConnectorId) => void
  disconnect: (provider: ConnectorId) => void
  syncNow: (provider: ConnectorId) => void
  syncing: ConnectorId | null
} {
  const [state, setState] = useState<ConnectorsState>(EMPTY)
  const [syncing, setSyncing] = useState<ConnectorId | null>(null)

  useEffect(() => {
    if (!isElectron) return
    let active = true

    window.api.connectors.getState().then((s) => { if (active) setState(s) })

    const unsubscribe = window.api.connectors.onChanged((s) => {
      if (active) setState(s)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  if (!isElectron) {
    return { state: EMPTY, connect: () => {}, disconnect: () => {}, syncNow: () => {}, syncing: null }
  }

  return {
    state,
    syncing,
    connect: (provider) =>
      void window.api.connectors
        .connect(provider)
        .then(() => window.api.connectors.getState())
        .then(setState)
        .catch((e) => console.error(`connector connect failed (${provider})`, e)),
    disconnect: (provider) =>
      void window.api.connectors
        .disconnect(provider)
        .then(() => window.api.connectors.getState())
        .then(setState)
        .catch((e) => console.error(`connector disconnect failed (${provider})`, e)),
    syncNow: (provider) => {
      if (syncing) return
      setSyncing(provider)
      window.api.connectors
        .syncNow(provider)
        .then(() => window.api.connectors.getState())
        .then(setState)
        .catch((e) => console.error(`connector syncNow failed (${provider})`, e))
        .finally(() => setSyncing(null))
    }
  }
}
