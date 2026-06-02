// connectors.tsx — Gmail + Google Calendar connector controls.
//
// Self-contained: drives its own `useConnectors` hook (connectors live outside
// the `data` seam, straight on `window.api.connectors`). Renders nothing until
// MAIN_VITE_GOOGLE_CLIENT_ID is set — matching the "inert until configured" contract.
import type { JSX } from 'react'
import { NIcon } from './icons'
import { useConnectors } from '../hooks/useConnectors'
import { relativeTime } from './time'
import type { ConnectorId } from '@nimi/contract/ipc'

interface ProviderRowProps {
  id: ConnectorId
  label: string
  icon: 'mail' | 'calendar'
  connected: boolean
  lastSyncAt: string | null
  itemCount: number
  syncing: boolean
  onConnect: () => void
  onDisconnect: () => void
  onSync: () => void
}

function formatSync(lastSyncAt: string | null): string {
  if (!lastSyncAt) return 'never synced'
  return relativeTime(new Date(lastSyncAt).getTime())
}

function ProviderRow({
  label,
  icon,
  connected,
  lastSyncAt,
  itemCount,
  syncing,
  onConnect,
  onDisconnect,
  onSync
}: ProviderRowProps): JSX.Element {
  return (
    <div className="connector-row" data-connected={connected}>
      <span className="connector-icon">
        <NIcon name={icon} size={15} />
      </span>
      <div className="connector-info">
        <span className="connector-label">{label}</span>
        {connected && (
          <span className="connector-meta">
            {itemCount > 0 ? `${itemCount} captured` : 'connected'} · {formatSync(lastSyncAt)}
          </span>
        )}
      </div>
      <div className="connector-actions">
        {connected ? (
          <>
            <button
              className="hdr-btn"
              title={syncing ? 'Syncing…' : 'Sync now'}
              disabled={syncing}
              onClick={onSync}
              aria-label={`Sync ${label}`}
            >
              <NIcon name="refresh" size={14} />
            </button>
            <button
              className="hdr-btn connector-disconnect"
              title={`Disconnect ${label}`}
              onClick={onDisconnect}
              aria-label={`Disconnect ${label}`}
            >
              <NIcon name="close" size={14} />
            </button>
          </>
        ) : (
          <button
            className="hdr-btn connector-connect"
            title={`Connect ${label}`}
            onClick={onConnect}
            aria-label={`Connect ${label}`}
          >
            Connect
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Renders the connector panel (Gmail + Google Calendar rows).
 * Returns null until `MAIN_VITE_GOOGLE_CLIENT_ID` is set — inert by default.
 */
export function ConnectorsControl(): JSX.Element | null {
  const { state, connect, disconnect, syncNow, syncing } = useConnectors()

  if (!state.configured) return null

  return (
    <div className="connectors-panel">
      <ProviderRow
        id="gmail"
        label="Gmail"
        icon="mail"
        connected={state.gmail.connected}
        lastSyncAt={state.gmail.lastSyncAt}
        itemCount={state.gmail.itemCount}
        syncing={syncing === 'gmail'}
        onConnect={() => connect('gmail')}
        onDisconnect={() => disconnect('gmail')}
        onSync={() => syncNow('gmail')}
      />
      <ProviderRow
        id="gcal"
        label="Google Calendar"
        icon="calendar"
        connected={state.gcal.connected}
        lastSyncAt={state.gcal.lastSyncAt}
        itemCount={state.gcal.itemCount}
        syncing={syncing === 'gcal'}
        onConnect={() => connect('gcal')}
        onDisconnect={() => disconnect('gcal')}
        onSync={() => syncNow('gcal')}
      />
    </div>
  )
}
