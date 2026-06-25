// add.tsx — the + button's sheet. Primary: feed content for indexing.
// Secondary: jot a to-do into the backlog. Indexing uncovers candidate to-dos.
import { useBrand } from '@nimi/brand/web'
import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { NIcon } from './icons'
import { kindIcon } from './iconKind'
import { NimiMark, Dots } from './mark'
import { VoiceRecorder } from './voice'
import { data } from './api'
import { captureFiles, kindOfFile } from './capture-file'
import { TASK_SUGGESTIONS, nextTranscript } from './ui-stubs'
import type { MemoryKind, Task, UncoveredTodo, BacklogItem } from '@nimi/contract/views'

type AddTodo = (
  item: Partial<BacklogItem> & { title: string; why?: string; conf?: number | null; ctx?: string[] }
) => Promise<Task | null>

// Three manual input modes. Photos & files are detected on attach (below).
const ADD_MODES = [
  { kind: 'note', label: 'Note', ico: 'note' as const, desc: 'Jot or paste text' },
  { kind: 'voice', label: 'Voice', ico: 'mic' as const, desc: 'Record or transcribe' },
  { kind: 'link', label: 'Link', ico: 'link' as const, desc: 'URL or saved article' }
]
export function AddSheet({
  onClose,
  onFed,
  onCaptured,
  onAddTodo,
  onRecordingChange
}: {
  onClose: () => void
  /** Fired when feeding starts (drives the immediate "cheer" feedback). */
  onFed: () => void
  /** Fired once the real capture(s) resolve — drives the archive refresh. */
  onCaptured?: () => void
  onAddTodo: AddTodo
  onRecordingChange?: (v: boolean) => void
}): JSX.Element {
  const brand = useBrand()
  const [mode, setMode] = useState<'feed' | 'todo'>('feed')
  const [recording, setRecording] = useState(false)
  useEffect(() => {
    onRecordingChange && onRecordingChange(recording)
  }, [recording, onRecordingChange])
  return (
    <div className="ov-root">
      <div className="scrim" onClick={recording ? undefined : onClose} />
      <div className="sheet add-sheet">
        <div className="sheet-grab" />
        {!recording && (
          <>
            <div className="sheet-hd">
              <div className="sheet-hd-l">
                <NimiMark state="idle" size={28} />
                <div>
                  <div className="sheet-ttl">Add to {brand.productName}</div>
                  <div className="sheet-sub">Feed me something — or jot a to-do</div>
                </div>
              </div>
              <button className="sheet-x" onClick={onClose}>
                <NIcon name="close" size={16} />
              </button>
            </div>

            <div className="add-seg">
              <button className={mode === 'feed' ? 'on' : ''} onClick={() => setMode('feed')}>
                <NIcon name="feed" size={15} /> Feed a memory
              </button>
              <button className={mode === 'todo' ? 'on' : ''} onClick={() => setMode('todo')}>
                <NIcon name="check" size={15} /> Add a to-do
              </button>
            </div>
          </>
        )}

        {mode === 'feed' ? (
          <FeedPane
            onFed={onFed}
            onCaptured={onCaptured}
            onAddTodo={onAddTodo}
            onClose={onClose}
            recording={recording}
            setRecording={setRecording}
          />
        ) : (
          <TodoPane onAddTodo={onAddTodo} onClose={onClose} />
        )}
      </div>
    </div>
  )
}

const isImgKind = (k: MemoryKind): boolean => k === 'photo' || k === 'screenshot' || k === 'image'

interface Attach {
  id: string
  file: File
  name: string
  kind: MemoryKind
  processing: boolean
}

// ── Feed: capture → index → uncover candidate to-dos ────────────────────────
function FeedPane({
  onFed,
  onCaptured,
  onAddTodo,
  onClose,
  recording,
  setRecording
}: {
  onFed: () => void
  onCaptured?: () => void
  onAddTodo: AddTodo
  onClose: () => void
  recording: boolean
  setRecording: (v: boolean) => void
}): JSX.Element {
  const brand = useBrand()
  const [phase, setPhase] = useState<'input' | 'indexing' | 'done'>('input')
  const [mode, setMode] = useState<'note' | 'voice' | 'link'>('note')
  const [attaches, setAttaches] = useState<Attach[]>([])
  const [text, setText] = useState('')
  const [filed, setFiled] = useState(0)
  const [failed, setFailed] = useState(false)
  const [todos, setTodos] = useState<UncoveredTodo[]>([])
  const [added, setAdded] = useState<Set<string>>(new Set())
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    taRef.current && taRef.current.focus()
  }, [])

  const hasAttach = attaches.length > 0

  const pushFiles = (files: FileList | null): void => {
    if (!files) return
    const newAttaches: Attach[] = Array.from(files)
      .filter((f) => f.size > 0)
      .map((f) => ({
        id: 'at_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        file: f,
        name: f.name,
        kind: kindOfFile(f),
        processing: false
      }))
    setAttaches((a) => [...a, ...newAttaches])
  }

  const removeAttach = (id: string): void => setAttaches((a) => a.filter((x) => x.id !== id))

  const pickMode = (m: 'note' | 'voice' | 'link'): void => {
    if (m === 'voice') {
      setMode('voice')
      setRecording(true)
    } else setMode(m)
  }
  const stopRecording = (): void => {
    setRecording(false)
    setMode('voice')
    setText((prev) => (prev ? prev + ' ' : '') + nextTranscript())
    setTimeout(() => taRef.current && taRef.current.focus(), 60)
  }

  // the cool voice recorder takes over the sheet while active
  if (recording) {
    return (
      <VoiceRecorder
        onStop={stopRecording}
        onDiscard={() => {
          setRecording(false)
          if (!text) setMode('note')
        }}
      />
    )
  }

  const feed = (): void => {
    if (!text.trim() && !hasAttach) return
    setPhase('indexing')
    setFailed(false)
    onFed && onFed()
    // Capture text + files in parallel and report what actually landed. We wait
    // for the real captures (no fixed timer), with a small minimum dwell so
    // "Reading it in" doesn't flash past when the worker answers instantly.
    // captureText resolves to one CaptureResult; captureFiles to an array.
    void (async () => {
      const captures: Promise<unknown>[] = []
      if (text.trim()) captures.push(data.pipeline.captureText(text.trim()))
      if (hasAttach) captures.push(captureFiles(attaches.map((a) => a.file)))
      try {
        const [results] = await Promise.all([
          Promise.all(captures),
          new Promise((r) => setTimeout(r, 900))
        ])
        let n = 0
        for (const r of results) n += Array.isArray(r) ? r.length : 1
        setFiled(n)
        // New memories landed — let the app refresh the archive (thumbs, ctx
        // lookups, search rows) instead of waiting for a reload.
        onCaptured && onCaptured()
        // Real inferred to-dos (AI-gap: `[]` until the drafter is configured).
        setTodos(await data.pipeline.uncoverTodos())
      } catch {
        setFailed(true)
      }
      setPhase('done')
    })()
  }

  if (phase === 'input') {
    const placeholder = hasAttach
      ? 'Add a note about these, or just feed them…'
      : mode === 'voice'
        ? 'Transcribed here — tap the mic to record…'
        : mode === 'link'
          ? 'Paste a URL or article…'
          : 'Paste, type, or drop anything I should remember…'
    return (
      <>
        <input
          ref={fileRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            pushFiles(e.target.files)
            ;(e.target as HTMLInputElement).value = ''
          }}
        />
        <input
          ref={photoRef}
          type="file"
          multiple
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            pushFiles(e.target.files)
            ;(e.target as HTMLInputElement).value = ''
          }}
        />
        <div className="sheet-body">
          <div className="composer" style={{ marginTop: '4px' }}>
            <div className="composer-inner">
              {hasAttach && (
                <div className="attach-row">
                  {attaches.map((a) => {
                    const media = isImgKind(a.kind) || a.kind === 'video'
                    if (media) {
                      return (
                        <div
                          key={a.id}
                          className={'attach-media' + (a.kind === 'video' ? ' video' : '')}
                        >
                          <span className="attach-thumb img" />
                          {a.processing ? (
                            <span className="attach-spin" />
                          ) : (
                            a.kind === 'video' && (
                              <span className="attach-play">
                                <NIcon name="play" size={13} fill="currentColor" stroke={0} />
                              </span>
                            )
                          )}
                          <button
                            className="attach-x corner"
                            aria-label="Remove"
                            onClick={() => removeAttach(a.id)}
                          >
                            <NIcon name="close" size={11} />
                          </button>
                        </div>
                      )
                    }
                    return (
                      <div key={a.id} className="attach-chip">
                        <span className="attach-ico">
                          {a.processing ? (
                            <span className="attach-spin sm" />
                          ) : (
                            <NIcon name={kindIcon(a.kind)} size={14} />
                          )}
                        </span>
                        <span className="attach-name">{a.name}</span>
                        <button
                          className="attach-x"
                          aria-label="Remove"
                          onClick={() => removeAttach(a.id)}
                        >
                          <NIcon name="close" size={12} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              {mode === 'voice' && text && (
                <div className="voice-tag">
                  <NIcon name="audio" size={12} /> Transcribed · tap mic to re-record
                </div>
              )}
              <textarea
                ref={taRef}
                className="cmp-ta"
                rows={hasAttach ? 2 : 3}
                value={text}
                placeholder={placeholder}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="cmp-bar">
                <div className="cmp-cluster">
                  <button
                    className="tool-btn"
                    aria-label="Attach file"
                    onClick={() => fileRef.current?.click()}
                  >
                    <NIcon name="paperclip" size={18} />
                  </button>
                  <button
                    className="tool-btn"
                    aria-label="Add photo"
                    onClick={() => photoRef.current?.click()}
                  >
                    <NIcon name="camera" size={18} />
                  </button>
                  <button
                    className={'tool-btn' + (mode === 'voice' ? ' on' : '')}
                    aria-label="Record voice"
                    onClick={() => pickMode('voice')}
                  >
                    <NIcon name="mic" size={18} />
                  </button>
                </div>
                {!hasAttach && (
                  <div className="mode-row">
                    {ADD_MODES.map((m) => (
                      <button
                        key={m.kind}
                        className={'mode-chip' + (mode === m.kind ? ' on' : '')}
                        onClick={() => pickMode(m.kind as 'note' | 'voice' | 'link')}
                      >
                        <NIcon name={m.ico} size={14} /> {m.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <p className="add-note">
            Photos &amp; files are recognized automatically when you attach them. Everything&apos;s
            indexed privately, on device.
          </p>
        </div>
        <div className="sheet-foot">
          <button className="btn primary" onClick={feed}>
            <NIcon name="arrowUp" size={16} stroke={2.2} /> Feed it to {brand.productName}
          </button>
        </div>
      </>
    )
  }

  if (phase === 'indexing') {
    return (
      <div className="add-stage">
        <NimiMark state="gathering" size={66} />
        <div className="add-stage-t">
          Reading it in
          <Dots />
        </div>
        <div className="add-stage-s">Indexing, embedding, and looking for connections.</div>
        <div className="gather-prog" style={{ marginTop: '4px' }}>
          <i style={{ width: '100%' }} />
        </div>
      </div>
    )
  }

  // done
  return (
    <>
      <div className="sheet-body">
        <div className="add-done-head">
          <NimiMark state={failed ? 'idle' : 'done'} fill={9} size={30} />
          <div>
            {failed ? (
              <>
                <div className="add-done-t">Couldn&apos;t file that</div>
                <div className="add-done-s">Something went wrong — give it another try.</div>
              </>
            ) : (
              <>
                <div className="add-done-t">
                  Filed away — {filed} {filed === 1 ? 'memory' : 'memories'}
                </div>
                <div className="add-done-s">It&apos;ll surface beside anything it relates to.</div>
              </>
            )}
          </div>
        </div>
        {todos.length > 0 && (
          <>
            <div className="add-sect">
              <NIcon name="sparkle" size={12} /> While reading, I spotted{' '}
              {todos.length === 1 ? 'a to-do' : 'a few to-dos'}
              <span className="ln" />
            </div>
            {todos.map((td) => {
              const on = added.has(td.id as string)
              return (
                <div key={td.id} className={'unc' + (on ? ' on' : '')}>
                  <div className="unc-conf" title={Math.round(td.conf * 100) + '% confident'}>
                    <svg viewBox="0 0 36 36" width="34" height="34">
                      <circle
                        cx="18"
                        cy="18"
                        r="15"
                        fill="none"
                        stroke="var(--hairline)"
                        strokeWidth="3"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="15"
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={`${Math.round(td.conf * 94)} 200`}
                        transform="rotate(-90 18 18)"
                      />
                    </svg>
                    <span>{Math.round(td.conf * 100)}</span>
                  </div>
                  <div className="unc-main">
                    <div className="unc-t">{td.title}</div>
                    <div className="unc-why">{td.why}</div>
                  </div>
                  <button
                    className={'unc-add' + (on ? ' on' : '')}
                    disabled={on}
                    onClick={() => {
                      setAdded((s) => new Set(s).add(td.id as string))
                      void (onAddTodo && onAddTodo({ ...td, ctx: [] }))
                    }}
                  >
                    {on ? (
                      <>
                        <NIcon name="check" size={14} /> Added
                      </>
                    ) : (
                      <>
                        <NIcon name="plus" size={14} /> Backlog
                      </>
                    )}
                  </button>
                </div>
              )
            })}
          </>
        )}
      </div>
      <div className="sheet-foot">
        <button
          className="btn ghost"
          onClick={() => {
            setPhase('input')
            setText('')
            setFiled(0)
            setFailed(false)
            setTodos([])
            setAdded(new Set())
            setAttaches([])
          }}
        >
          <NIcon name="plus" size={15} /> Feed more
        </button>
        <button className="btn primary" onClick={onClose}>
          <NIcon name="check" size={15} /> Done
        </button>
      </div>
    </>
  )
}

// ── To-do: jot a task → ranked into the backlog ─────────────────────────────
function TodoPane({
  onAddTodo,
  onClose
}: {
  onAddTodo: AddTodo
  onClose: () => void
}): JSX.Element {
  const [phase, setPhase] = useState<'input' | 'ranking' | 'done'>('input')
  const [text, setText] = useState('')
  const [kept, setKept] = useState(0)
  // onAddTodo resolves to a Task when it landed on Today, or null on the backlog
  // fallback (day full / worker unreachable). Drives the honest "where it went" copy.
  const [landedToday, setLandedToday] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    taRef.current && taRef.current.focus()
  }, [])

  const add = (val?: string): void => {
    const tx = (val ?? text).trim()
    if (!tx) return
    setText(tx)
    setPhase('ranking')
    // Keep the ~900ms beat so "Sizing it up" doesn't flash past when the worker
    // responds instantly. Context count comes from the server-surfaced pool on
    // the returned Task — the renderer doesn't run a separate pre-search.
    void (async () => {
      await new Promise((r) => setTimeout(r, 900))
      const task = onAddTodo
        ? await onAddTodo({ title: tx, why: 'You added this', conf: null })
        : null
      setLandedToday(!!task)
      setKept(task?.ctx?.length ?? 0)
      setPhase('done')
    })()
  }

  if (phase === 'ranking') {
    return (
      <div className="add-stage">
        <NimiMark state="thinking" size={66} />
        <div className="add-stage-t">
          Sizing it up
          <Dots />
        </div>
        <div className="add-stage-s">Checking what I already have that could help.</div>
      </div>
    )
  }
  if (phase === 'done') {
    return (
      <div className="add-stage">
        <NimiMark state="done" fill={9} size={66} />
        <div className="add-stage-t">
          {landedToday ? 'Added to today' : 'Added to your backlog'}
        </div>
        <div className="add-stage-s">
          {kept > 0 ? (
            <>
              I kept <b>{kept}</b> thing{kept === 1 ? '' : 's'} nearby for when you start it.
            </>
          ) : (
            "I'll keep an eye out for anything that helps."
          )}
        </div>
        <div className="add-done-acts">
          <button
            className="btn ghost"
            onClick={() => {
              setText('')
              setKept(0)
              setLandedToday(false)
              setPhase('input')
            }}
          >
            Add another
          </button>
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    )
  }
  return (
    <>
      <div className="sheet-body">
        <div className="composer" style={{ marginTop: '4px' }}>
          <div className="composer-inner">
            <textarea
              ref={taRef}
              className="cmp-ta"
              rows={2}
              value={text}
              placeholder="What do you need to get done?"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  add()
                }
              }}
            />
            <div className="cmp-bar">
              <span className="add-hint mono">GOES TO BACKLOG</span>
              <button
                className={'send-btn' + (text.trim() ? ' go' : '')}
                disabled={!text.trim()}
                aria-label="Add"
                onClick={() => add()}
              >
                <NIcon name="arrowUp" size={18} stroke={2.2} />
              </button>
            </div>
          </div>
        </div>
        <div className="sugg">
          {TASK_SUGGESTIONS.map((s) => (
            <button key={s} className="sugg-chip" onClick={() => add(s)}>
              {s}
            </button>
          ))}
        </div>
        <p className="add-note">
          Backlog items wait here. On a fresh day you&apos;ll pull up to five into Today.
        </p>
      </div>
    </>
  )
}
