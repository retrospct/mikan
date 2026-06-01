import { useEffect, useState } from 'react'
import ApiStatus from './components/ApiStatus'
import {
  addNote,
  getRecent,
  search as searchApi,
  unwrap,
  type ItemSummary,
  type SearchHitView
} from '../../shared/api'

// NOTE: the local libSQL path (`window.api.memory.*`) still exists in main/preload
// as the deferred offline seam. These views are backend-driven for now; unifying
// local ↔ backend storage is a separate, parked decision.

function App(): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [recent, setRecent] = useState<ItemSummary[]>([])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHitView[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refreshRecent(): Promise<void> {
    setRecent((await unwrap(getRecent({ query: { limit: 20 } }))).items)
  }

  useEffect(() => {
    refreshRecent().catch((e) => setError(String(e.message ?? e)))
  }, [])

  async function capture(): Promise<void> {
    const text = draft.trim()
    if (!text) return
    setBusy(true)
    setError(null)
    try {
      await unwrap(addNote({ body: { text } }))
      setDraft('')
      await refreshRecent()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function runSearch(): Promise<void> {
    const q = query.trim()
    if (!q) {
      setHits(null)
      return
    }
    setBusy(true)
    setError(null)
    try {
      setHits((await unwrap(searchApi({ query: { q, top_k: 10 } }))).hits)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-8">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">neeme</h1>
          <p className="text-sm text-neutral-400">Capture a memory, then search across everything.</p>
        </header>

        <ApiStatus />

        {/* Capture */}
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            placeholder="Capture a memory…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && capture()}
          />
          <button
            className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:opacity-50"
            onClick={capture}
            disabled={busy}
          >
            Add
          </button>
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            placeholder="Search memories…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          />
          <button
            className="rounded-md border border-neutral-700 px-4 py-2 text-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
            onClick={runSearch}
            disabled={busy}
          >
            Search
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* Results: search hits when a query is active, else recent items */}
        {hits !== null ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Search results
            </h2>
            {hits.map((h) => (
              <article
                key={h.id}
                className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm"
              >
                <p>{h.excerpt || h.source_filename || '(no preview)'}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  score {h.score.toFixed(3)}
                  {h.content_type ? ` · ${h.content_type}` : ''}
                </p>
              </article>
            ))}
            {hits.length === 0 && (
              <p className="text-sm text-neutral-500">No matches for “{query}”.</p>
            )}
          </section>
        ) : (
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Recent</h2>
            {recent.map((m) => (
              <article
                key={m.id}
                className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm"
              >
                <p>{m.excerpt || m.source_filename}</p>
                <p className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
                  <span>{new Date(m.created_at).toLocaleString()}</span>
                  <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase">
                    {m.extraction_status}
                  </span>
                </p>
              </article>
            ))}
            {recent.length === 0 && (
              <p className="text-sm text-neutral-500">No memories yet — add one above.</p>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

export default App
