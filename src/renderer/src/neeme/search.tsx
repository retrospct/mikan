// search.tsx — "Dig deeper": a universal search across everything you've fed Neeme.
import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { NIcon } from './icons'
import { kindIcon } from './iconKind'
import { NeemeMark, NeemeSay, Dots } from './mark'
import { MEMORIES } from './data'

function memSearch(q: string): string[] {
  const ids = Object.keys(MEMORIES)
  const words = q
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length > 1)
  if (!words.length) return ids
  return ids
    .map((id) => {
      const m = MEMORIES[id]
      const hay = (m.title + ' ' + m.snip + ' ' + m.kind + ' ' + (m.src || '')).toLowerCase()
      let s = 0
      for (const w of words) if (hay.includes(w)) s += 1
      return { id, s }
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.id)
}

const SEARCH_SUGGEST = ['cabin weekend', "mom's birthday", 'Q3 numbers', 'dentist', 'book club']

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
  const [q, setQ] = useState('')
  const [settledQ, setSettledQ] = useState('')
  const [kept, setKept] = useState<Set<string>>(new Set(keptIds || []))
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current && inputRef.current.focus()
  }, [])

  // a beat of "Neeme is searching" when the query settles. We debounce the input
  // into `settledQ` — the only setState lives inside the timeout, so it never fires
  // synchronously in the effect body — and derive `thinking` from the gap.
  useEffect(() => {
    if (q === settledQ) return undefined
    const id = setTimeout(() => setSettledQ(q), q.trim() ? 650 : 0)
    return () => clearTimeout(id)
  }, [q, settledQ])

  const thinking = q.trim() !== '' && settledQ !== q
  const results = q.trim() ? memSearch(q) : Object.keys(MEMORIES).slice(0, 6)
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
          <NeemeMark state={thinking ? 'thinking' : 'idle'} size={18} />
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
            <NeemeSay state="thinking" size={18}>
              Searching
              <Dots />
            </NeemeSay>
          ) : q ? (
            `${results.length} result${results.length === 1 ? '' : 's'} in your memory`
          ) : (
            'Recently fed'
          )}
        </div>

        {!thinking &&
          results.map((id, i) => {
            const m = MEMORIES[id]
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
            <NeemeMark state="idle" size={30} />
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
