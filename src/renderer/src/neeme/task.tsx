// task.tsx — task detail. Reads like a brief Neeme prepared for you:
// a summary in its voice, the draft it took a crack at, then the sources it used.
import { useEffect, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { NIcon } from './icons'
import { kindIcon } from './iconKind'
import { NeemeMark, NeemeSay, Dots } from './mark'
import { MEMORIES, relOf, whyOf } from './data'
import type { Memory, Task } from './data'

function relFor(task: Task, id: string): number {
  if (task.relMap && task.relMap[id] != null) return task.relMap[id]
  const r = relOf(task.id, id)
  return r || 0.6
}

// Render **bold** spans as <b> without dropping to dangerouslySetInnerHTML — drafts
// and briefs are conceptually LLM-authored, so we never inject raw HTML.
function renderBold(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/)
    return m ? <b key={i}>{m[1]}</b> : <span key={i}>{part}</span>
  })
}

function MemoryCard({
  m,
  rel,
  why,
  pinned,
  swept,
  fresh,
  onKeep,
  onSweep,
  delay
}: {
  m: Memory
  rel: number
  why: string | null
  pinned: boolean
  swept: boolean
  fresh: boolean
  onKeep: () => void
  onSweep: () => void
  delay?: number
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const isImg = m.kind === 'photo' || m.kind === 'screenshot' || m.kind === 'image'
  const stop =
    (fn: () => void) =>
    (e: React.MouseEvent): void => {
      e.stopPropagation()
      fn()
    }
  const srcVerb = isImg
    ? 'Open'
    : m.kind === 'email'
      ? 'Open in Mail'
      : m.kind === 'calendar'
        ? 'Open in Calendar'
        : m.kind === 'voice'
          ? 'Play'
          : 'Open source'
  return (
    <div
      className={
        'mem' +
        (pinned ? ' pinned' : '') +
        (swept ? ' swept' : '') +
        (fresh ? ' fresh' : '') +
        (open ? ' open' : '')
      }
      style={{ animationDelay: `${delay || 0}s` }}
      onClick={() => setOpen((o) => !o)}
      role="button"
      aria-expanded={open}
    >
      {fresh && !pinned && <span className="mem-new">New</span>}
      <div className={'mem-thumb' + (isImg ? ' img' : '')}>
        {!isImg && <NIcon name={kindIcon(m.kind)} size={19} />}
      </div>
      <div className="mem-main">
        <div className="mem-kind">
          {m.kind}
          <span className="dot" />
          {m.when}
          <span className="mem-exp">
            <NIcon name="chevDown" size={13} />
          </span>
        </div>
        <div className="mem-t">{m.title}</div>
        {why && (
          <div className="mem-why">
            <NIcon name="sparkle" size={10} /> {why}
          </div>
        )}
        <div className={'mem-snip' + (open ? ' full' : '')}>{m.snip}</div>
        {open && (
          <div className="mem-open">
            <span className="mem-src">
              <NIcon name={kindIcon(m.kind)} size={11} /> {m.src}
            </span>
            <button className="mem-openbtn" onClick={stop(() => {})}>
              {srcVerb} <NIcon name="arrowRight" size={13} />
            </button>
          </div>
        )}
        <div className="mem-foot">
          <div className="mem-rel">
            <div className="mem-rel-bar">
              <i style={{ width: Math.round(rel * 100) + '%' }} />
            </div>
            <span className="mem-rel-lbl">{Math.round(rel * 100)}% fit</span>
          </div>
          <div className="mem-acts">
            <button
              className={'mem-act keep' + (pinned ? ' on' : '')}
              aria-label={pinned ? 'Kept' : 'Keep'}
              onClick={stop(onKeep)}
            >
              <NIcon name={pinned ? 'pinFill' : 'pin'} size={15} />
            </button>
            <button className="mem-act sweep" aria-label="Dismiss" onClick={stop(onSweep)}>
              <NIcon name="close" size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DraftCard({
  draft,
  typeLabel,
  typeIcon,
  note,
  useLabel,
  useNote,
  confirm,
  done,
  onComplete,
  onUse
}: {
  draft: string[]
  typeLabel?: string
  typeIcon?: string
  note?: string | null
  useLabel?: string
  useNote?: string
  confirm?: string
  done: boolean
  onComplete?: () => void
  onUse?: () => void
}): JSX.Element {
  const [used, setUsed] = useState(false)
  const [copied, setCopied] = useState(false)
  return (
    <div className="draft">
      <div className="draft-hd">
        <NeemeMark state="idle" size={24} />
        <div className="draft-hd-main">
          <div className="draft-hd-t">I took a crack at it</div>
          <div className="draft-type">
            <NIcon name={typeIcon || 'sparkle'} size={11} /> {typeLabel || 'A first draft'}
          </div>
        </div>
        <button
          className="draft-copy"
          aria-label="Copy"
          onClick={() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1400)
          }}
        >
          <NIcon name={copied ? 'check' : 'file'} size={14} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="draft-paper">
        {draft.map((p, i) => (
          <p key={i}>{renderBold(p)}</p>
        ))}
      </div>
      {note && (
        <div className="draft-src">
          <NIcon name="layers" size={11} /> {note}
        </div>
      )}
      {!used && useNote && (
        <div className="draft-what">
          <NIcon name="arrowRight" size={12} /> {useNote}
        </div>
      )}
      <div className="draft-actions">
        {used ? (
          <div className="draft-confirm">
            <span className="draft-used">
              <NIcon name="check" size={14} /> {confirm || "Done — it's in your reply"}
            </span>
            {done ? (
              <span className="draft-doneflag">
                <NIcon name="check" size={13} /> Done
              </span>
            ) : (
              <button className="btn btn-sm primary" onClick={() => onComplete && onComplete()}>
                <NIcon name="check" size={15} /> Mark done
              </button>
            )}
          </div>
        ) : (
          <>
            <button
              className="btn btn-sm primary"
              onClick={() => {
                setUsed(true)
                onUse && onUse()
              }}
            >
              <NIcon name="check" size={15} /> {useLabel || 'Use this'}
            </button>
            <button className="btn btn-sm ghost icon-only" aria-label="Edit">
              <NIcon name="edit" size={16} />
            </button>
            <button className="btn btn-sm ghost icon-only" aria-label="Redo">
              <NIcon name="refresh" size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export function TaskDetail({
  task,
  onBack,
  onToggle,
  onUpdate
}: {
  task: Task
  index: number
  onBack: () => void
  onToggle: (id: string) => void
  onUpdate?: (id: string, patch: Partial<Task>) => void
}): JSX.Element {
  const [pinned, setPinned] = useState<Set<string>>(new Set(task.pinned || []))
  const [swept, setSwept] = useState<Set<string>>(new Set())
  const [extra, setExtra] = useState<string[]>([])
  const [searching, setSearching] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [draft, setDraft] = useState<string[] | null>(task.draft || null)
  const [open, setOpen] = useState(false)
  const [keptOpen, setKeptOpen] = useState(false) // kept cards collapse into icons once filed
  const [chat, setChat] = useState(false) // ask-Neeme conversation about this task
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const freshTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  useEffect(() => () => Object.values(freshTimers.current).forEach(clearTimeout), [])
  const markFresh = (ids: string[]): void => {
    setFresh((s) => {
      const n = new Set(s)
      ids.forEach((id) => n.add(id))
      return n
    })
    ids.forEach((id) => {
      clearTimeout(freshTimers.current[id])
      freshTimers.current[id] = setTimeout(
        () =>
          setFresh((s) => {
            const n = new Set(s)
            n.delete(id)
            return n
          }),
        5200
      )
    })
  }

  const baseIds = (task.ctx || []).filter((id) => !swept.has(id))
  const allIds = [...baseIds, ...extra.filter((id) => !swept.has(id))]
  const sorted = allIds.slice().sort((a, b) => {
    const pa = pinned.has(a) ? 1 : 0
    const pb = pinned.has(b) ? 1 : 0
    if (pa !== pb) return pb - pa
    return relFor(task, b) - relFor(task, a)
  })

  const toggleKeep = (id: string): void => {
    setPinned((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      onUpdate && onUpdate(task.id, { pinned: [...n] })
      return n
    })
    if (!pinned.has(id)) markFresh([id])
  }
  const sweep = (id: string): void => setSwept((s) => new Set(s).add(id))

  const searchMore = (): void => {
    setSearching(true)
    setTimeout(() => {
      const have = new Set([...allIds])
      const pool = Object.keys(MEMORIES).filter((id) => !have.has(id))
      const add = pool.sort(() => Math.random() - 0.5).slice(0, 2)
      setExtra((e) => [...e, ...add])
      setSearching(false)
      setOpen(true)
      markFresh(add)
    }, 1400)
  }

  const tryDraft = (): void => {
    setDrafting(true)
    setTimeout(() => {
      setDraft([
        "Here's a first pass stitched from what you kept — I filled the gaps with my best guess, so change anything that's off.",
        "Tell me the bit I couldn't know and I'll tighten it up."
      ])
      setDrafting(false)
    }, 1700)
  }

  const keptIds = sorted.filter((id) => pinned.has(id))
  const suggIds = sorted.filter((id) => !pinned.has(id))
  const keptCount = keptIds.length
  const freshSugg = suggIds.filter((id) => fresh.has(id)).length
  const done = task.done

  return (
    <div className="push detail">
      <div className="push-hd">
        <button className="push-back" onClick={onBack}>
          <NIcon name="back" size={18} />
        </button>
        <div className="push-hd-main">
          <div className="push-kicker">{(task.when || 'Today').toUpperCase()}</div>
          <div className="push-ttl">{task.title}</div>
        </div>
        <button className="hdr-btn" aria-label="More">
          <NIcon name="dots" size={18} />
        </button>
      </div>

      <div className="detail-body">
        {/* hero: complete + title */}
        <div className={'dt-hero' + (done ? ' done-task' : '')}>
          <button className="dt-check" onClick={() => onToggle(task.id)} aria-label="Complete">
            <NIcon name="check" size={18} stroke={2.4} />
          </button>
          <div className="dt-hero-main">
            <div className="dt-h">{task.title}</div>
            <div className="dt-meta">
              <span className="meta-chip">
                <NIcon name="clock" size={12} /> {task.when}
              </span>
              <span className="meta-chip">
                <NIcon name="layers" size={12} /> {allIds.length} source
                {allIds.length === 1 ? '' : 's'}
              </span>
              {keptCount > 0 && (
                <span className="meta-chip on">
                  <NIcon name="pinFill" size={12} /> {keptCount} kept
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Neeme's brief — what it did, what's needed */}
        {task.brief && !done && (
          <div className="brief">
            <NeemeMark state="idle" size={22} />
            <div className="brief-tx">{renderBold(task.brief)}</div>
          </div>
        )}

        {/* the draft, or an invitation to make one */}
        {draft ? (
          <DraftCard
            draft={draft}
            typeLabel={task.draft ? task.draftType : 'Draft message'}
            typeIcon={task.draft ? task.draftIcon : 'note'}
            note={task.draft ? task.draftNote : 'Stitched from what you kept.'}
            useLabel={task.draft ? task.useLabel : 'Use this'}
            useNote={task.draft ? task.useNote : 'Saves it to this task, ready to edit and send.'}
            confirm={task.draft ? task.useDone : 'Saved to this task.'}
            done={done}
            onComplete={() => {
              if (!done) onToggle(task.id)
            }}
          />
        ) : drafting ? (
          <div className="draft draft-working">
            <NeemeMark state="drafting" size={30} />
            <div className="draft-working-tx">
              Taking a crack at it
              <Dots />
            </div>
          </div>
        ) : (
          !done && (
            <button className="draft draft-cta" onClick={tryDraft}>
              <NeemeMark state="idle" size={30} />
              <div className="draft-cta-main">
                <div className="draft-cta-t">Want me to take a crack at it?</div>
                <div className="draft-cta-s">I&apos;ll draft a start from what you kept</div>
              </div>
              <span className="draft-cta-go">
                <NIcon name="arrowRight" size={18} />
              </span>
            </button>
          )
        )}

        {/* context Neeme gathered */}
        {!done && (
          <>
            <div className="pool-hd">
              <div className="pool-hd-l">
                <span className="ctx-orb" />
                <span className="pool-hd-t">Sources</span>
              </div>
              <span className="pool-hd-meta">
                {keptCount} kept · {suggIds.length} more
              </span>
            </div>

            {keptCount > 0 ? (
              <>
                <button
                  className={'pool-group-hd as-toggle' + (keptOpen ? ' open' : '')}
                  onClick={() => setKeptOpen((o) => !o)}
                >
                  <NIcon name="pinFill" size={11} /> Kept for this
                  <span className="ln" />
                  <span className="kept-toggle">
                    {keptOpen ? 'Tuck away' : 'Show'} <NIcon name="chevDown" size={13} />
                  </span>
                </button>
                {keptOpen ? (
                  keptIds.map((id, i) => (
                    <MemoryCard
                      key={id}
                      m={MEMORIES[id]}
                      rel={relFor(task, id)}
                      why={whyOf(task.id, id)}
                      pinned
                      swept={swept.has(id)}
                      fresh={fresh.has(id)}
                      delay={i * 0.04}
                      onKeep={() => toggleKeep(id)}
                      onSweep={() => sweep(id)}
                    />
                  ))
                ) : (
                  <button className="kept-strip" onClick={() => setKeptOpen(true)}>
                    <span className="kept-chips">
                      {keptIds.map((id) => {
                        const m = MEMORIES[id]
                        const isImg =
                          m.kind === 'photo' || m.kind === 'screenshot' || m.kind === 'image'
                        return (
                          <span
                            key={id}
                            className={
                              'kept-chip' + (isImg ? ' img' : '') + (fresh.has(id) ? ' fresh' : '')
                            }
                            title={m.title}
                          >
                            {!isImg && <NIcon name={kindIcon(m.kind)} size={14} />}
                          </span>
                        )
                      })}
                    </span>
                    <span className="kept-strip-lbl">{keptCount} filed · tap to review</span>
                    <NIcon name="chevDown" size={14} className="kept-strip-cv" />
                  </button>
                )}
              </>
            ) : (
              <div className="pool-kept-empty">
                <NIcon name="pin" size={15} />
                <span>
                  Nothing kept yet. Pin what fits below and it settles here, beside the task.
                </span>
              </div>
            )}

            {suggIds.length > 0 && (
              <>
                <button
                  className={
                    'pool-review' + (open ? ' open' : '') + (freshSugg > 0 ? ' has-new' : '')
                  }
                  onClick={() => setOpen((o) => !o)}
                >
                  <span className="pr-l">
                    <span className="pool-cloud sm">
                      {Array.from({ length: Math.min(suggIds.length, 6) }).map((_, i) => (
                        <span key={i} className={'pc' + (i < freshSugg ? ' fresh' : '')} />
                      ))}
                    </span>
                    {open ? (
                      <span>More I found — keep or sweep</span>
                    ) : freshSugg > 0 ? (
                      <span className="shimmer-text">{freshSugg} just surfaced — take a look</span>
                    ) : (
                      <span>{suggIds.length} more I think relate</span>
                    )}
                  </span>
                  <span className="pr-r">
                    {open ? 'Tuck away' : 'Review'} <NIcon name="chevDown" size={14} />
                  </span>
                </button>
                {open &&
                  suggIds.map((id, i) => (
                    <MemoryCard
                      key={id}
                      m={MEMORIES[id]}
                      rel={relFor(task, id)}
                      why={whyOf(task.id, id)}
                      pinned={false}
                      swept={swept.has(id)}
                      fresh={fresh.has(id)}
                      delay={i * 0.04}
                      onKeep={() => toggleKeep(id)}
                      onSweep={() => sweep(id)}
                    />
                  ))}
              </>
            )}

            {keptCount === 0 && suggIds.length === 0 && (
              <div className="empty-note">
                Pool&apos;s empty — everything&apos;s been swept. Ask me to dig deeper whenever.
              </div>
            )}
          </>
        )}

        {done && (
          <div className="dt-donebanner">
            <NeemeMark state="done" fill={9} size={30} />
            <div>
              <div className="dt-doneb-t">Done — nice work.</div>
              <div className="dt-doneb-s">
                I&apos;ll keep these {allIds.length} memories filed with it.
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="dt-foot">
        <button
          className="dt-ask"
          onClick={() => setChat(true)}
          aria-label="Ask Neeme"
          title="Ask Neeme"
        >
          <NeemeMark state="idle" size={26} />
        </button>
        <button className="dt-dig" onClick={searchMore} disabled={searching}>
          {searching ? (
            <NeemeSay state="thinking" size={20}>
              Searching your memory
              <Dots />
            </NeemeSay>
          ) : (
            <>
              <NIcon name="search" size={17} />
              <span className="dt-dig-tx">Dig deeper in your memory</span>
              <NIcon name="arrowRight" size={15} />
            </>
          )}
        </button>
      </div>

      {chat && <TaskChat task={task} poolCount={allIds.length} onClose={() => setChat(false)} />}
    </div>
  )
}

// Ask Neeme — a lightweight chat about this task, anchored to its context
const CHAT_SUGGESTIONS = [
  'Make the draft warmer',
  'What am I still missing?',
  'Summarize the sources'
]
const CHAT_REPLIES: Record<string, string> = {
  'Make the draft warmer':
    'Done — I softened the opener and added a little warmth at the end. Take a look at the draft above.',
  'What am I still missing?':
    "Honestly, not much. The only open thing is confirming the date on your side — everything else I've got covered.",
  'Summarize the sources':
    "Quick version: Sarah's flexible on the weekend, your calendar's clear Apr 18–20, and the photos are from the last trip. That's the whole picture."
}

interface ChatMsg {
  from: 'neeme' | 'me'
  text: string
}

function TaskChat({
  task,
  poolCount,
  onClose
}: {
  task: Task
  poolCount: number
  onClose: () => void
}): JSX.Element {
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    {
      from: 'neeme',
      text: `Ask me anything about this — I've got the ${poolCount} source${poolCount === 1 ? '' : 's'} right here.`
    }
  ])
  const [text, setText] = useState('')
  const [thinking, setThinking] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    taRef.current && taRef.current.focus()
  }, [])
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [msgs, thinking])

  const send = (val?: string): void => {
    const q = (val ?? text).trim()
    if (!q || thinking) return
    setMsgs((m) => [...m, { from: 'me', text: q }])
    setText('')
    setThinking(true)
    setTimeout(() => {
      const reply =
        CHAT_REPLIES[q] ||
        'Got it — I pulled what I have on that and tucked it into the sources below. Want me to fold it into the draft?'
      setMsgs((m) => [...m, { from: 'neeme', text: reply }])
      setThinking(false)
    }, 1200)
  }

  return (
    <div className="ov-root">
      <div className="scrim" onClick={onClose} />
      <div className="sheet chat-sheet">
        <div className="sheet-grab" />
        <div className="sheet-hd">
          <div className="sheet-hd-l">
            <NeemeMark state={thinking ? 'thinking' : 'idle'} size={28} />
            <div>
              <div className="sheet-ttl">Ask Neeme</div>
              <div className="sheet-sub">
                About “{task.title.length > 26 ? task.title.slice(0, 25) + '…' : task.title}”
              </div>
            </div>
          </div>
          <button className="sheet-x" onClick={onClose}>
            <NIcon name="close" size={16} />
          </button>
        </div>

        <div className="chat-thread" ref={threadRef}>
          {msgs.map((m, i) => (
            <div key={i} className={'chat-msg ' + (m.from === 'me' ? 'me' : 'ai')}>
              {m.from === 'neeme' && <NeemeMark state="idle" size={20} />}
              <div className="chat-bubble">{m.text}</div>
            </div>
          ))}
          {thinking && (
            <div className="chat-msg ai">
              <NeemeMark state="thinking" size={20} />
              <div className="chat-bubble">
                <NeemeSay state="thinking" size={0}>
                  Thinking
                  <Dots />
                </NeemeSay>
              </div>
            </div>
          )}
          {msgs.length <= 1 && !thinking && (
            <div className="chat-sugg">
              {CHAT_SUGGESTIONS.map((s) => (
                <button key={s} className="sugg-chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="chat-foot">
          <div className="composer">
            <div className="composer-inner">
              <textarea
                ref={taRef}
                className="cmp-ta"
                rows={1}
                value={text}
                placeholder="Ask about this task…"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
              />
              <div className="cmp-bar">
                <div className="cmp-cluster">
                  <button className="tool-btn" aria-label="Attach">
                    <NIcon name="paperclip" size={18} />
                  </button>
                </div>
                <button
                  className={'send-btn' + (text.trim() ? ' go' : '')}
                  disabled={!text.trim()}
                  aria-label="Send"
                  onClick={() => send()}
                >
                  <NIcon name="arrowUp" size={18} stroke={2.2} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
