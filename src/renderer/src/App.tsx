import { useEffect, useState } from 'react'
import type { Memory } from '../../shared/ipc'

function App(): React.JSX.Element {
  const [memories, setMemories] = useState<Memory[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setMemories(await window.api.memory.list())
  }

  useEffect(() => {
    refresh().catch((e) => setError(String(e)))
  }, [])

  async function add(): Promise<void> {
    if (!draft.trim()) return
    try {
      await window.api.memory.add(draft)
      setDraft('')
      setError(null)
      await refresh()
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-8">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">neeme</h1>
          <p className="text-sm text-neutral-400">Local-first memory — stored on this device.</p>
        </header>

        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            placeholder="Capture a memory…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button
            className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
            onClick={add}
          >
            Add
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <ul className="flex flex-col gap-2">
          {memories.map((m) => (
            <li
              key={m.id}
              className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm"
            >
              <p>{m.content}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {new Date(m.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
          {memories.length === 0 && (
            <li className="text-sm text-neutral-500">No memories yet — add one above.</li>
          )}
        </ul>
      </div>
    </div>
  )
}

export default App
