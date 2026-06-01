import { useEffect, useState } from 'react'
import { setToken, clearToken } from '@nimi/contract/api/token-store'
import type { AuthState } from '@nimi/contract/ipc'
import { isElectron } from '../nimi/api'

const EMPTY: AuthState = { configured: false, isAuthenticated: false, claims: null }
const NOOP = (): void => {}

/**
 * Bridges the renderer to the main-process Logto flow. On mount it hydrates the
 * API client's token (via `token-store`) and the auth state from main, then
 * subscribes to changes (login / refresh / logout) so the bearer token the HTTP
 * client attaches stays current. Login/logout just delegate to main over IPC.
 *
 * Outside Electron (the browser preview, where `window.api` is undefined) it
 * returns a static unconfigured state and no-op actions — auth is a main-process
 * concern with no mock, so the UI just renders as if it weren't configured.
 */
export function useAuth(): { state: AuthState; login: () => void; logout: () => void } {
  const [state, setState] = useState<AuthState>(EMPTY)

  useEffect(() => {
    if (!isElectron) return
    let active = true
    window.api.auth.getState().then((s) => active && setState(s))
    window.api.auth.getAccessToken().then((t) => {
      if (!active) return
      if (t) setToken(t)
      else clearToken()
    })
    const unsubscribe = window.api.auth.onChanged((s, accessToken) => {
      if (!active) return
      setState(s)
      if (accessToken) setToken(accessToken)
      else if (!s.isAuthenticated) clearToken()
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  if (!isElectron) return { state: EMPTY, login: NOOP, logout: NOOP }

  return {
    state,
    login: () => void window.api.auth.login().catch((e) => console.error('login failed', e)),
    logout: () => void window.api.auth.logout().catch((e) => console.error('logout failed', e))
  }
}
