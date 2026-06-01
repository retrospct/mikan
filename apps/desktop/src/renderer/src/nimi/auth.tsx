// auth.tsx — the header Sign in / identity control.
//
// Self-contained: drives its own `useAuth` (auth lives outside the `data` seam,
// straight on `window.api.auth`), so it drops into the header without threading
// props. Renders nothing until Logto is configured — matching the main-process
// "inert until configured" contract (no MAIN_VITE_LOGTO_* → no control).
import type { JSX } from 'react'
import { NIcon } from './icons'
import { useAuth } from '../hooks/useAuth'

export function AuthControl(): JSX.Element | null {
  const { state, login, logout } = useAuth()

  if (!state.configured) return null

  if (!state.isAuthenticated) {
    return (
      <button className="hdr-btn" aria-label="Sign in" title="Sign in" onClick={login}>
        <NIcon name="lock" size={18} />
      </button>
    )
  }

  const label = state.claims?.name || state.claims?.email || 'Account'
  return (
    <button className="priv-pill" title="Sign out" onClick={logout}>
      <NIcon name="lock" size={11} />
      {label}
    </button>
  )
}
