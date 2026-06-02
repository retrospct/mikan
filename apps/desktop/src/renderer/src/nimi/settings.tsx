// settings.tsx — the Settings page.
//
// A focused full-screen "push" (the same drill-in shell as the task detail),
// reached from the header gear. It's the home for account-level controls that
// used to crowd the Today header — starting with the Gmail + Google Calendar
// connectors. ConnectorsControl stays self-contained (it drives its own hook
// and renders nothing until MAIN_VITE_GOOGLE_CLIENT_ID is set); the section's
// description explains the feature even while the connectors are inert.
import type { JSX } from 'react'
import { NIcon } from './icons'
import { ConnectorsControl } from './connectors'

export function SettingsView({ onBack }: { onBack: () => void }): JSX.Element {
  return (
    <div className="push settings-page">
      <div className="push-hd">
        <button className="push-back" onClick={onBack} aria-label="Back">
          <NIcon name="back" size={18} />
        </button>
        <div className="push-hd-main">
          <div className="push-kicker">NIMI</div>
          <div className="push-ttl">Settings</div>
        </div>
      </div>

      <div className="settings-body">
        <section className="settings-section">
          <div className="settings-section-h">Connections</div>
          <div className="settings-section-s">
            Link Gmail and Google Calendar so Nimi can quietly pull in context. Connect,
            disconnect, or sync each whenever you like.
          </div>
          <ConnectorsControl />
        </section>
      </div>
    </div>
  )
}
