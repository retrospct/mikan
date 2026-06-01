import { useEffect, useRef, useState } from 'react'
import ApiStatus from './components/ApiStatus'
import { useAuth } from './hooks/useAuth'
import {
  addNote,
  getRecent,
  search as searchApi,
  ingest,
  getItem,
  forgetItem,
  unwrap,
  type ItemSummary,
  type SearchHitView
} from '../../shared/api'

// NOTE: the local libSQL path (`window.api.memory.*`) still exists in main/preload
// as the deferred offline seam. These views are backend-driven for now; unifying
// local ↔ backend storage is a separate, parked decision (the sync spike).

// /items/{id} has no response_model on the backend yet, so the generated type is
// `unknown`. This local shape mirrors what the handler returns (summary + full text
// + presigned URL); it goes away once the backend adds a response model and we re-sync.
type ItemDetail = ItemSummary & { text?: string; raw_url?: string | null }

function App(): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [recent, setRecent] = useState<ItemSummary[]>([])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHitView[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // File ingest
  const [file, setFile] = useState<File | null>(null)
  const [tags, setTags] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Item detail overlay
  const [detail, setDetail] = useState<ItemDetail | null>(null)
  const [detailBusy, setDetailBusy] = useState(false)

  const auth = useAuth()

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

  async function uploadFile(): Promise<void> {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      await unwrap(ingest({ body: { file, tags: tags.trim() || undefined } }))
      setFile(null)
      setTags('')
      if (fileInputRef.current) fileInputRef.current.value = ''
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

  async function openItem(id: string): Promise<void> {
    setDetailBusy(true)
    setError(null)
    try {
      const data = (await unwrap(getItem({ path: { item_id: id } }))) as ItemDetail
      setDetail(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDetailBusy(false)
    }
  }

  async function forget(id: string): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await unwrap(forgetItem({ path: { item_id: id } }))
      setDetail(null)
      // Drop it from any visible search results, then refresh recent.
      setHits((prev) => (prev ? prev.filter((h) => h.id !== id) : prev))
      await refreshRecent()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-8">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">neeme</h1>
            <p className="text-sm text-neutral-400">
              Capture a memory or a file, then search across everything.
            </p>
          </div>
          {/* Auth control — only shown once Logto is configured (auth is deferred,
              so unconfigured installs show nothing here). */}
          {auth.state.configured &&
            (auth.state.isAuthenticated ? (
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <span className="text-neutral-400">
                  {auth.state.claims?.email ?? auth.state.claims?.name ?? 'signed in'}
                </span>
                <button
                  onClick={auth.logout}
                  className="rounded-md border border-neutral-700 px-2 py-1 transition-colors hover:bg-neutral-800"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={auth.login}
                className="shrink-0 rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-400"
              >
                Sign in
              </button>
            ))}
        </header>

        <ApiStatus />

        {/* Capture: note */}
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

        {/* Capture: file ingest */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="flex-1 text-sm text-neutral-400 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-sm file:text-neutral-200 hover:file:bg-neutral-700"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <input
            className="w-40 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            placeholder="tags (comma sep)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
          <button
            className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:opacity-50"
            onClick={uploadFile}
            disabled={busy || !file}
          >
            Upload
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

        {/* Results: search hits when a query is active, else recent items.
            Rows are clickable → open the item detail overlay. */}
        {hits !== null ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Search results
            </h2>
            {hits.map((h) => (
              <button
                key={h.id}
                onClick={() => openItem(h.id)}
                className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-left text-sm transition-colors hover:border-neutral-700 hover:bg-neutral-800"
              >
                <p>{h.excerpt || h.source_filename || '(no preview)'}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  score {h.score.toFixed(3)}
                  {h.content_type ? ` · ${h.content_type}` : ''}
                </p>
              </button>
            ))}
            {hits.length === 0 && (
              <p className="text-sm text-neutral-500">No matches for “{query}”.</p>
            )}
          </section>
        ) : (
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Recent</h2>
            {recent.map((m) => (
              <button
                key={m.id}
                onClick={() => openItem(m.id)}
                className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-left text-sm transition-colors hover:border-neutral-700 hover:bg-neutral-800"
              >
                <p>{m.excerpt || m.source_filename}</p>
                <p className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
                  <span>{new Date(m.created_at).toLocaleString()}</span>
                  <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase">
                    {m.extraction_status}
                  </span>
                </p>
              </button>
            ))}
            {recent.length === 0 && (
              <p className="text-sm text-neutral-500">No memories yet — add one above.</p>
            )}
          </section>
        )}
      </div>

      {/* Item detail overlay */}
      {(detail || detailBusy) && (
        <div
          className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/60 p-8"
          onClick={() => setDetail(null)}
        >
          <div
            className="mt-8 w-full max-w-xl rounded-lg border border-neutral-800 bg-neutral-900 p-5 text-sm shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {detailBusy && !detail ? (
              <p className="text-neutral-500">Loading…</p>
            ) : (
              detail && (
                <>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-medium">
                        {detail.source_filename || detail.id.slice(0, 12)}
                      </h2>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                        <span>{new Date(detail.created_at).toLocaleString()}</span>
                        {detail.content_type && (
                          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase">
                            {detail.content_type}
                          </span>
                        )}
                        {detail.tags?.map((t) => (
                          <span
                            key={t}
                            className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px]"
                          >
                            #{t}
                          </span>
                        ))}
                      </p>
                    </div>
                    <button
                      onClick={() => setDetail(null)}
                      className="rounded-md border border-neutral-700 px-2 py-1 text-xs transition-colors hover:bg-neutral-800"
                    >
                      Close
                    </button>
                  </div>

                  {detail.text && (
                    <pre className="mb-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md bg-neutral-950 p-3 text-xs text-neutral-300">
                      {detail.text}
                    </pre>
                  )}

                  <div className="flex items-center gap-3">
                    {detail.raw_url && (
                      <a
                        href={detail.raw_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-indigo-400 hover:underline"
                      >
                        Open raw file ↗
                      </a>
                    )}
                    <button
                      onClick={() => forget(detail.id)}
                      disabled={busy}
                      className="ml-auto rounded-md border border-red-900/60 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-950/40 disabled:opacity-50"
                    >
                      Forget
                    </button>
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
