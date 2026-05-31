import { useEffect, useState } from 'react'
import { getHealth } from '../../../shared/api'

type Health = { status?: string; backends?: Record<string, boolean> }
type State =
  | { kind: 'loading' }
  | { kind: 'ok'; data: Health }
  | { kind: 'error'; message: string }

/**
 * Smoke test of the typed HTTP client: calls GET /health on the Neeme API and
 * renders the result. Proves the renderer → FastAPI round-trip end-to-end.
 * Start the backend with: cd mr-matcha && pip install -e ".[api]" && neeme serve
 */
function ApiStatus(): React.JSX.Element {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    getHealth()
      .then((res) => {
        if (res.error) {
          setState({ kind: 'error', message: `HTTP ${res.response?.status ?? '?'}` })
        } else {
          setState({ kind: 'ok', data: res.data as Health })
        }
      })
      .catch((e) => setState({ kind: 'error', message: String(e?.message ?? e) }))
  }, [])

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-neutral-400">API</span>
        {state.kind === 'loading' && <span className="text-neutral-500">checking…</span>}
        {state.kind === 'ok' && <span className="text-emerald-400">connected</span>}
        {state.kind === 'error' && <span className="text-red-400">unreachable</span>}
      </div>
      {state.kind === 'error' && (
        <p className="text-xs text-neutral-500">
          {state.message} — is the backend running? (<code>neeme serve</code>)
        </p>
      )}
      {state.kind === 'ok' && state.data.backends && (
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500">
          {Object.entries(state.data.backends).map(([name, on]) => (
            <li key={name}>
              <span className={on ? 'text-emerald-400' : 'text-neutral-600'}>{on ? '●' : '○'}</span>{' '}
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default ApiStatus
