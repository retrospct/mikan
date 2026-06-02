import { useState, type JSX } from 'react'
import { NIcon } from './icons'
import { useSync } from '../hooks/useSync'
import { relativeTime } from './time'

export function SyncControl(): JSX.Element | null {
  const { status, syncNow } = useSync()
  const [showDetail, setShowDetail] = useState(false)

  // Error takes priority. `enabled:false` + error = a config problem (e.g. a
  // missing encryption key); `enabled:true` + error = a transient sync failure.
  // Click reveals the full reason inline.
  if (status.error) {
    return (
      <span className="sync-wrap">
        <button
          className="sync-pill sync-pill-err"
          aria-expanded={showDetail}
          aria-label={`Sync ${status.enabled ? 'error' : 'off'}: ${status.error}`}
          onClick={() => setShowDetail((v) => !v)}
        >
          <NIcon name="globe" size={12} />
          {status.enabled ? 'Sync error' : 'Sync off'}
        </button>
        {showDetail && (
          <div className="sync-pop" role="status">
            {status.error}
          </div>
        )}
      </span>
    )
  }

  // Nothing worth showing when sync isn't configured.
  if (!status.enabled) return null

  const syncedLabel =
    status.lastSyncAt === null ? 'Synced' : `Synced ${relativeTime(status.lastSyncAt)}`

  return (
    <button
      className="sync-pill"
      title={status.syncing ? 'Syncing with cloud…' : `${syncedLabel} · click to sync now`}
      onClick={syncNow}
      disabled={status.syncing}
      aria-label="Cloud sync status"
    >
      <NIcon name="globe" size={12} />
      {status.syncing ? 'Syncing…' : 'Synced'}
    </button>
  )
}
