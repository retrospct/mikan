// search.tsx — "Dig deeper": a universal search across everything you've fed Nimi.
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { NIcon } from './icons'
import { kindIcon } from './iconKind'
import { MikanMark, MikanSay, Dots } from './mark'
import { data, MemoryContext } from './api'
import { SEARCH_SUGGEST } from './ui-stubs'

export function SearchOverlay({
  contextTitle,
  keptIds,
  onKeep,
  onClose
}: {
  contextTitle?: string | null
  keptIds?: string[]
  onKeep?: ((id: string) => void) | null
  onClose: () => void
}): JSX.Element {
  const mem = useContext(MemoryContext)
  const [q, setQ] = useState('')
  const [settledQ, setSettledQ] = useState('')
  const [hits, setHits] = useState<string[]>([])
  const [kept, setKept] = useState<Set<string>>(new Set(keptIds || []))
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current && inputRef.current.focus()
  }, [])

  // a beat of "Nimi is searching" when the query settles. We debounce the input
  // into `settledQ` — the only setState lives inside the timeout, so it never fires
  // synchronously in the effect body — and derive `thinking` from the gap.
  useEffect(() => {
    if (q === settledQ) return undefined
    const id = setTimeout(() => setSettledQ(q), q.trim() ? 650 : 0)
    return () => clearTimeout(id)
  }, [q, settledQ])

  // settled query → real semantic search (ranked ids). All setState lands inside
  // the async callback (after the await), never synchronously in the effect body.
  // Stale responses are dropped via the cancel flag. Empty queries show "recent"
  // and ignore `hits` entirely, so there's nothing to clear synchronously.
  useEffect(() => {
    if (!settledQ.trim()) return undefined
    let cancelled = false
    const run = async (): Promise<void> => {
      const r = await data.pipeline.search(settledQ).catch(() => [])
      if (!cancelled) setHits(r.map((h) => h.id))
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [settledQ])

  const recent = useMemo(() => Object.keys(mem).slice(0, 6), [mem])
  const thinking = q.trim() !== '' && settledQ !== q
  const results = q.trim() ? hits : recent
  const keep = (id: string): void => {
    setKept((s) => new Set(s).add(id))
    onKeep && onKeep(id)
  }

  return (
    <div className="search-ov">
      <div className="search-top">
        <button className="push-back" onClick={onClose} aria-label="Close search">
          <NIcon name="back" size={18} />
        </button>
        <div className="search-field">
          <NIcon name="search" size={17} />
          <input
            ref={inputRef}
            className="search-input"
            value={q}
            placeholder="Search everything you've fed me…"
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button className="search-clear" aria-label="Clear" onClick={() => setQ('')}>
              <NIcon name="close" size={14} />
            </button>
          )}
        </div>
      </div>

      {contextTitle && (
        <div className="search-scope">
          <MikanMark state={thinking ? 'thinking' : 'idle'} size={18} />
          <span>
            Looking across your memory for <b>“{contextTitle}”</b>
          </span>
        </div>
      )}

      <div className="search-body">
        {!q && (
          <div className="search-suggest">
            {SEARCH_SUGGEST.map((s) => (
              <button key={s} className="sugg-chip" onClick={() => setQ(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="search-meta">
          {thinking ? (
            <MikanSay state="thinking" size={18}>
              Searching
              <Dots />
            </MikanSay>
          ) : q ? (
            `${results.length} result${results.length === 1 ? '' : 's'} in your memory`
          ) : (
            'Recently fed'
          )}
        </div>

        {!thinking &&
          results.map((id, i) => {
            const m = mem[id]
            if (!m) return null
            const isImg = m.kind === 'photo' || m.kind === 'screenshot' || m.kind === 'image'
            const isKept = kept.has(id)
            return (
              <div className="sr" key={id} style={{ animationDelay: `${Math.min(i, 8) * 0.03}s` }}>
                <div className={'sr-thumb' + (isImg ? ' img' : '')}>
                  {!isImg && <NIcon name={kindIcon(m.kind)} size={17} />}
                </div>
                <div className="sr-main">
                  <div className="sr-kind">
                    {m.kind}
                    <span className="dot" />
                    {m.when}
                  </div>
                  <div className="sr-t">{m.title}</div>
                  <div className="sr-snip">{m.snip}</div>
                </div>
                {onKeep && (
                  <button
                    className={'sr-keep' + (isKept ? ' on' : '')}
                    disabled={isKept}
                    onClick={() => keep(id)}
                  >
                    {isKept ? (
                      <>
                        <NIcon name="check" size={13} /> Kept
                      </>
                    ) : (
                      <>
                        <NIcon name="pin" size={13} /> Keep
                      </>
                    )}
                  </button>
                )}
              </div>
            )
          })}

        {!thinking && q && results.length === 0 && (
          <div className="search-empty">
            <MikanMark state="idle" size={30} />
            <div className="search-empty-t">Nothing on that yet</div>
            <div className="search-empty-s">
              Try fewer words — or feed me more and it&apos;ll be here next time.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
