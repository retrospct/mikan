// auth-gate.tsx — the full-screen login gate.
//
// When Logto is configured, the app sits behind this screen until the user has a
// session (a fresh sign-in, or a cached one restored on boot — including offline,
// see src/main/auth/logto.ts). It replaces the old header lock icon as the front
// door. In unconfigured/dev builds Logto reports `configured: false`, the gate
// never mounts, and the app stays fully usable offline and local-first.
import { useBrand } from '@mikan/brand/web'
import type { JSX } from 'react'
import { useState } from 'react'
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

export function AuthGate({ onLogin }: { onLogin: () => void }): JSX.Element {
  const brand = useBrand()
  // After the browser hand-off there's a beat before the `<scheme>://callback` deep
  // link lands and main flips us authenticated (which unmounts this gate). Reflect
  // that wait so the user isn't left staring at an idle button.
  const [awaiting, setAwaiting] = useState(false)
  const start = (): void => {
    setAwaiting(true)
    onLogin()
  }

  return (
    <div className="auth-gate">
      <div className="auth-gate-card">
        <div className="auth-gate-brand">
          <MikanMark state={awaiting ? 'thinking' : 'idle'} size={64} />
        </div>
        <h1 className="auth-gate-ttl">Welcome to {brand.productName}</h1>
        <p className="auth-gate-sub">
          {awaiting
            ? 'Finish signing in in your browser — this screen unlocks on its own.'
            : 'Sign in or create an account to continue.'}
        </p>

        {awaiting ? (
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
