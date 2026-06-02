// sync.tsx — a compact header pill for Turso cloud-sync status.
//
// Self-contained (drives its own `useSync` hook, straight on window.api.sync).
// Renders nothing when sync is simply off with no error — it only earns header
// space when there's something worth showing: an error, an active sync, or a
// healthy "synced" state. The full error message is exposed via the tooltip.
import type { JSX } from 'react'
import { NIcon } from './icons'
import { useSync } from '../hooks/useSync'

function relTime(ts: number | null): string {
  if (!ts) return 'never'
  const mins = Math.floor((Date.now() - ts) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function SyncControl(): JSX.Element | null {
  const { status, syncNow } = useSync()

  // Error takes priority. `enabled:false` + error = a config problem (e.g. a
  // missing encryption key); `enabled:true` + error = a transient sync failure.
  if (status.error) {
    return (
      <span
        className="sync-pill sync-pill-err"
        title={status.error}
        role="status"
        aria-label={`Sync ${status.enabled ? 'error' : 'off'}: ${status.error}`}
      >
        <NIcon name="globe" size={12} />
        {status.enabled ? 'Sync error' : 'Sync off'}
      </span>
    )
  }

  // Nothing worth showing when sync isn't configured.
  if (!status.enabled) return null

  return (
    <button
      className="sync-pill"
      title={
        status.syncing
          ? 'Syncing with cloud…'
          : `Synced ${relTime(status.lastSyncAt)} · click to sync now`
      }
      onClick={syncNow}
      disabled={status.syncing}
      aria-label="Cloud sync status"
    >
      <NIcon name="globe" size={12} />
      {status.syncing ? 'Syncing…' : 'Synced'}
    </button>
  )
}
