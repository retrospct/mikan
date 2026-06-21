// settings.tsx — the Settings page.
//
// A focused full-screen "push" (the same drill-in shell as the task detail),
// reached from the header gear. It's the home for account-level controls that
// used to crowd the Today header:
//   - Account: who you're signed in as + Sign out (the front-door login is the
//     gate in NimiApp; the header no longer carries an auth control).
//   - Sync: the cloud-replica toggle + per-device encryption / recovery key.
//   - Connections: the Gmail + Google Calendar connectors (self-contained).
//   - Updates: current version + check / restart-to-update.
import { useBrand } from '@nimi/brand/web'
import { useState, type JSX } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useSync, useSyncSettings } from '../hooks/useSync'
import { useUpdate } from '../hooks/useUpdate'
import { ConnectorsControl } from './connectors'
import { NIcon } from './icons'
import { relativeTime } from './time'

function AccountSection(): JSX.Element | null {
  const { state, logout } = useAuth()
  if (!state.configured) return null

  const name = state.claims?.name
  const email = state.claims?.email
  const label = name || email || 'Signed in'

  return (
    <section className="settings-section">
      <div className="settings-section-h">Account</div>
      <div className="settings-row">
        <div className="settings-row-main">
          <div className="settings-row-ttl">{label}</div>
          {name && email && <div className="settings-row-sub">{email}</div>}
        </div>
        <button className="settings-btn settings-btn-danger" onClick={logout}>
          Sign out
        </button>
      </div>
    </section>
  )
}

/** The Sync toggle + status line + recovery-key controls. */
function SyncSection(): JSX.Element {
  const { state: auth } = useAuth()
  const { status } = useSync()
  const { settings, busy, setEnabled, importKey, revealKey } = useSyncSettings()

  const [revealed, setRevealed] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importVal, setImportVal] = useState('')
  const [importErr, setImportErr] = useState<string | null>(null)

  const canToggle = settings.available && auth.isAuthenticated && !busy

  // The status line blends the persisted intent (settings.enabled) with the live
  // replica state (status). Intent-on but replica-down reads as "connecting".
  const statusLine = !settings.enabled
    ? 'Off — your notes stay on this device'
    : status.error
      ? status.error
      : status.syncing
        ? 'Syncing…'
        : status.enabled
          ? status.lastSyncAt
            ? `Synced ${relativeTime(status.lastSyncAt)}`
            : 'Synced'
          : 'Connecting…'

  const onReveal = async (): Promise<void> => {
    if (revealed) {
      setRevealed(null)
      return
    }
    setRevealed(await revealKey())
  }

  const onCopy = async (): Promise<void> => {
    if (!revealed) return
    await navigator.clipboard.writeText(revealed).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const onImport = async (): Promise<void> => {
    setImportErr(null)
    try {
      await importKey(importVal.trim())
      setImportOpen(false)
      setImportVal('')
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : 'Could not use that key.')
    }
  }

  return (
    <section className="settings-section">
      <div className="settings-section-h">Sync</div>
      <div className="settings-section-s">
        Keep your notes in sync across your devices. Content is end-to-end encrypted with a key that
        lives only on your devices — Nimi&apos;s cloud never sees plaintext.
      </div>

      <div className="settings-row">
        <div className="settings-row-main">
          <div className="settings-row-ttl">Cloud sync</div>
          <div className="settings-row-sub">{statusLine}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.enabled}
          aria-label="Cloud sync"
          className={`settings-toggle${settings.enabled ? ' on' : ''}`}
          disabled={!canToggle}
          onClick={() => void setEnabled(!settings.enabled)}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>

      {!settings.available && (
        <div className="settings-note">Sync isn&apos;t configured in this build.</div>
      )}
      {settings.available && !auth.isAuthenticated && (
        <div className="settings-note">Sign in to enable sync.</div>
      )}

      {settings.hasKey && (
        <div className="settings-key">
          <div className="settings-key-h">Recovery key</div>
          <div className="settings-key-s">
            Save this to add another device or restore access. Anyone with it can read your synced
            notes — keep it safe, and never share it.
          </div>
          {revealed ? (
            <div className="settings-key-reveal">
              <code className="settings-key-code">{revealed}</code>
              <button className="settings-btn" onClick={() => void onCopy()}>
                <NIcon name={copied ? 'check' : 'copy'} size={13} />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          ) : null}
          <button className="settings-btn settings-btn-quiet" onClick={() => void onReveal()}>
            {revealed ? 'Hide recovery key' : 'Reveal recovery key'}
          </button>
        </div>
      )}

      {settings.available && auth.isAuthenticated && (
        <div className="settings-import">
          {importOpen ? (
            <>
              <div className="settings-key-s">
                Paste the recovery key from another device. This replaces this device&apos;s key —
                do it on a fresh device, before turning on sync.
              </div>
              <input
                className="settings-input"
                type="text"
                spellCheck={false}
                autoCorrect="off"
                placeholder="64-character recovery key"
                value={importVal}
                onChange={(e) => setImportVal(e.target.value)}
              />
              {importErr && <div className="settings-note settings-note-err">{importErr}</div>}
              <div className="settings-import-actions">
                <button
                  className="settings-btn settings-btn-quiet"
                  onClick={() => {
                    setImportOpen(false)
                    setImportErr(null)
                  }}
                >
                  Cancel
                </button>
                <button
                  className="settings-btn"
                  disabled={busy || importVal.trim().length === 0}
                  onClick={() => void onImport()}
                >
                  Use this key
                </button>
              </div>
            </>
          ) : (
            <button className="settings-btn settings-btn-quiet" onClick={() => setImportOpen(true)}>
              Have a recovery key from another device?
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function UpdateSection(): JSX.Element {
  const { status, checkNow, quitAndInstall } = useUpdate()
  const { stage, version, progress, error } = status

  const busy = stage === 'checking' || stage === 'downloading'

  const statusLine =
    stage === 'checking'
      ? 'Checking for updates…'
      : stage === 'available'
        ? `Downloading ${version ?? 'update'}…`
        : stage === 'downloading'
          ? `Downloading${progress !== null ? ` ${progress}%` : '…'}`
          : stage === 'ready'
            ? `v${version} ready — restart to install`
            : stage === 'error'
              ? (error ?? 'Update check failed')
              : 'Up to date'

  return (
    <section className="settings-section">
      <div className="settings-section-h">Updates</div>
      <div className="settings-row">
        <div className="settings-row-main">
          <div className="settings-row-ttl">Nimi</div>
          <div className="settings-row-sub">
            {stage === 'error' ? statusLine : `v${__APP_VERSION__} — ${statusLine}`}
          </div>
        </div>
        {stage === 'ready' ? (
          <button className="settings-btn" onClick={quitAndInstall}>
            Restart to update
          </button>
        ) : (
          <button className="settings-btn" disabled={busy} onClick={checkNow}>
            {stage === 'checking' ? 'Checking…' : 'Check for updates'}
          </button>
        )}
      </div>
      {stage === 'error' && <div className="settings-note settings-note-err">{error}</div>}
    </section>
  )
}

export function SettingsView({ onBack }: { onBack: () => void }): JSX.Element {
  const brand = useBrand()
  return (
    <div className="push settings-page">
      <div className="push-hd">
        <button className="push-back" onClick={onBack} aria-label="Back">
          <NIcon name="back" size={18} />
        </button>
        <div className="push-hd-main">
          <div className="push-kicker">{brand.productName.toUpperCase()}</div>
          <div className="push-ttl">Settings</div>
        </div>
      </div>

      <div className="settings-body">
        <AccountSection />

        <SyncSection />

        <section className="settings-section">
          <div className="settings-section-h">Connections</div>
          <div className="settings-section-s">
            Link Gmail and Google Calendar so Nimi can quietly pull in context. Connect, disconnect,
            or sync each whenever you like.
          </div>
          <ConnectorsControl />
        </section>

        <UpdateSection />
      </div>
    </div>
  )
}
