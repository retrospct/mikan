// auth-gate.tsx — the full-screen login gate.
//
// When Logto is configured, the app sits behind this screen until the user has a
// session (a fresh sign-in, or a cached one restored on boot — including offline,
// see src/main/auth/logto.ts). It replaces the old header lock icon as the front
// door. In unconfigured/dev builds Logto reports `configured: false`, the gate
// never mounts, and the app stays fully usable offline and local-first.
import { useBrand } from '@mikan/brand/web'
import type { AuthLoginError } from '@mikan/contract/ipc'
import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { MikanMark } from './mark'

/** Neutral branded splash shown while main reports the initial auth state, so the
 *  gate never flashes the sign-in screen (or the app) before a cached session loads. */
export function AuthSplash(): JSX.Element {
  return (
    <div className="auth-gate" aria-hidden>
      <MikanMark state="idle" size={56} />
    </div>
  )
}

// Soft client-side backstop: if the browser hand-off never comes back (main's own
// dev-loopback/callback timeout is 5 min), stop showing "awaiting" after 2 min so
// the user isn't left staring at a screen that looks stuck.
const AWAIT_TIMEOUT_MS = 2 * 60 * 1000

function errorCopy(error: AuthLoginError): string {
  return error.code === 'user_cancelled'
    ? 'Sign-in was cancelled — no changes made.'
    : `Sign-in didn't complete: ${error.message}`
}

export function AuthGate({
  onLogin,
  error
}: {
  onLogin: () => void
  error: AuthLoginError | null
}): JSX.Element {
  const brand = useBrand()
  // After the browser hand-off there's a beat before the callback lands and main
  // flips us authenticated (which unmounts this gate). Reflect that wait so the
  // user isn't left staring at an idle button.
  const [awaiting, setAwaiting] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  // main reports failures (cancelled, exchange error, timeout) via `error` on
  // AuthState — derived, not synced via an effect, so it takes effect the same
  // render `error` arrives (no extra setState-triggered render in between).
  const isAwaiting = awaiting && !error

  useEffect(() => {
    if (!isAwaiting) return
    const timer = setTimeout(() => {
      setAwaiting(false)
      setTimedOut(true)
    }, AWAIT_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [isAwaiting])

  const start = (): void => {
    if (isAwaiting) return // guard against a double-click firing two flows
    setTimedOut(false)
    setAwaiting(true)
    onLogin()
  }

  const subtext = isAwaiting
    ? 'Finish signing in in your browser — this screen unlocks on its own.'
    : error
      ? errorCopy(error)
      : timedOut
        ? 'Still waiting? Try signing in again.'
        : 'Sign in or create an account to continue.'

  return (
    <div className="auth-gate">
      <div className="auth-gate-card">
        <div className="auth-gate-brand">
          <MikanMark state={isAwaiting ? 'thinking' : 'idle'} size={64} />
        </div>
        <h1 className="auth-gate-ttl">Welcome to {brand.productName}</h1>
        <p className="auth-gate-sub">{subtext}</p>

        {isAwaiting ? (
          <div className="auth-gate-waiting">
            <button
              type="button"
              className="auth-gate-secondary"
              onClick={() => setAwaiting(false)}
            >
              Use a different account
            </button>
          </div>
        ) : (
          <button type="button" className="auth-gate-cta" onClick={start}>
            Sign in
          </button>
        )}

        <p className="auth-gate-foot">
          Your notes are stored on this device. Signing in turns on secure, end-to-end encrypted
          sync across your devices.
        </p>
      </div>
    </div>
  )
}
