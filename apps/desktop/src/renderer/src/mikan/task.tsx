// task.tsx — task detail. Reads like a brief Mikan prepared for you:
// a summary in its voice, the draft it took a crack at, then the sources it used.
import { useBrand } from '@mikan/brand/web'
import { useContext, useEffect, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { NIcon } from './icons'
import { kindIcon } from './iconKind'
import { MikanMark, MikanSay, Dots } from './mark'
import { data, MemoryContext } from './api'
import { StepRow } from './growing-card'
import type { Memory, PlanStep, Task, TaskState } from '@mikan/contract/views'

// tool label (from `PlanStep.tool`, e.g. "CALENDAR"/"MAPS") -> dock/reasoning icon
const TOOL_ICON: Record<string, string> = {
  CALENDAR: 'calendar',
  MAPS: 'globe',
  MAIL: 'mail',
  GMAIL: 'mail'
}
function toolIcon(tool: string): string {
  return TOOL_ICON[tool] ?? 'bolt'
}

// Relevance is real (`Task.relMap` from search); fall back to a neutral fit when
// a ctx id has no score yet.
function relFor(task: Task, id: string): number {
  return task.relMap?.[id] ?? 0.6
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
            <button
              className="mem-act sweep"
              aria-label="Sweep from this task"
              onClick={stop(onSweep)}
            >
              <NIcon name="sweep" size={15} />
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
  onUse,
  onEdit,
  onRedo
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
  /** Applies both manual edits (Save) and refine-chip taps — same draft-shape contract. */
  onEdit?: (next: string[]) => void
  onRedo?: () => void
}): JSX.Element {
  const [used, setUsed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(() => draft.join('\n\n'))

  if (collapsed) {
    return (
      <button className="draft-strip" onClick={() => setCollapsed(false)}>
        <span className="draft-strip-ico">
          <NIcon name={typeIcon || 'sparkle'} size={15} />
        </span>
        <span className="draft-strip-tx">
          <b>{typeLabel || 'A first draft'}</b> · tap to reopen
        </span>
        <NIcon name="chevDown" size={14} className="draft-strip-cv" />
      </button>
    )
  }

  return (
    <div className="draft">
      <button className="draft-hd as-toggle" onClick={() => setCollapsed(true)}>
        <MikanMark state="idle" size={24} />
        <div className="draft-hd-main">
          <div className="draft-hd-t">I took a crack at it</div>
          <div className="draft-type">
            <NIcon name={typeIcon || 'sparkle'} size={11} /> {typeLabel || 'A first draft'}
          </div>
        </div>
        <span
          className="draft-copy"
          role="button"
          tabIndex={0}
          aria-label={copied ? 'Copied' : 'Copy draft'}
          onClick={(e) => {
            e.stopPropagation()
            // Write the real draft text (blank line between paragraphs). The
            // sandboxed renderer is a secure context, so the async Clipboard API
            // is available; ignore rejection (e.g. focus lost) — the icon still
            // confirms intent.
            void navigator.clipboard?.writeText(draft.join('\n\n')).catch(() => {})
            setCopied(true)
            setTimeout(() => setCopied(false), 1400)
          }}
        >
          <NIcon name={copied ? 'check' : 'copy'} size={16} />
        </span>
        <span className="draft-collapse">
          <NIcon name="chevUp" size={14} />
        </span>
      </button>
      {editing ? (
        <div className="draft-edit">
          <textarea
            className="draft-edit-ta"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={6}
            aria-label="Edit draft"
          />
          <div className="draft-edit-acts">
            <button className="btn btn-sm ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              className="btn btn-sm primary"
              onClick={() => {
                const next = editText
                  .split(/\n{2,}/)
                  .map((p) => p.trim())
                  .filter(Boolean)
                onEdit && onEdit(next.length ? next : [editText.trim()])
                setEditing(false)
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="draft-paper">
          {draft.map((p, i) => (
            <p key={i}>{renderBold(p)}</p>
          ))}
        </div>
      )}
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
      {!used && !editing && onEdit && <RefineChips draft={draft} onApply={onEdit} />}
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
            <button
              className="btn btn-sm ghost icon-only"
              aria-label="Edit"
              onClick={() => {
                setEditText(draft.join('\n\n'))
                setEditing(true)
              }}
            >
              <NIcon name="edit" size={16} />
            </button>
            <button
              className="btn btn-sm ghost icon-only"
              aria-label="Redo"
              onClick={() => onRedo && onRedo()}
            >
              <NIcon name="refresh" size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// collapsible "what Mikan did/is doing" — the same step rows the growing card
// renders (Group 07), reused here at the expanded-workspace zoom level (Group 02)
function ReasoningCard({ steps }: { steps: PlanStep[] | undefined }): JSX.Element | null {
  const [open, setOpen] = useState(true)
  if (!steps || steps.length === 0) return null
  return (
    <>
      <button
        className={'pool-group-hd as-toggle' + (open ? ' open' : '')}
        onClick={() => setOpen((o) => !o)}
      >
        <NIcon name="layers" size={11} /> Reasoning
        <span className="ln" />
        <span className="kept-toggle">
          {open ? 'Tuck away' : 'Show'} <NIcon name="chevDown" size={13} />
        </span>
      </button>
      {open && (
        <div className="gcard-steps reasoning-steps">
          {steps.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}
        </div>
      )}
    </>
  )
}

// the skills/tools/connectors Mikan used, deduped from the plan's steps
function Dock({ steps }: { steps: PlanStep[] | undefined }): JSX.Element | null {
  const tools = Array.from(
    new Set((steps ?? []).map((s) => s.tool).filter((t): t is string => !!t))
  )
  if (tools.length === 0) return null
  return (
    <div className="dock">
      {tools.map((t) => (
        <span key={t} className="chip-pill">
          <NIcon name={toolIcon(t)} size={13} /> {t}
        </span>
      ))}
    </div>
  )
}

const STEPPER_STAGES = ['Gathered', 'Your voice', 'Drafting', 'Approve & send'] as const

// Maps the six-state lifecycle onto the Group-02 guided-review stepper — a
// narrower, reply-shaped read of the same lifecycle (CONTEXT.md § "The expanded
// workspace"). `planned` sits between "gathered" and "your voice" (the plan is
// ready, waiting on the human's input); `working` is drafting; `awaiting` is the
// approval gate; `done` completes every stage.
function stepperIndex(state: TaskState | undefined): number {
  switch (state) {
    case 'planned':
      return 1
    case 'working':
      return 2
    case 'awaiting':
      return 3
    case 'done':
      return 4
    default:
      return 0
  }
}

function GuidedStepper({ state }: { state: TaskState | undefined }): JSX.Element {
  const idx = stepperIndex(state)
  return (
    <div className="stepper" role="list" aria-label="Task progress">
      {STEPPER_STAGES.map((label, i) => (
        <div
          key={label}
          role="listitem"
          className={'stepper-step' + (i < idx ? ' done' : i === idx ? ' active' : '')}
        >
          <span className="stepper-dot" aria-hidden="true" />
          <span className="stepper-lbl">{label}</span>
        </div>
      ))}
    </div>
  )
}

// tap-don't-type refine chips — local text transforms over the draft, same
// AI-gap fidelity as `tryDraft()` (no backend draft-refine call exists yet)
function RefineChips({
  draft,
  onApply
}: {
  draft: string[]
  onApply: (next: string[]) => void
}): JSX.Element {
  const apply = (kind: 'warmer' | 'shorter' | 'photos'): void => {
    if (kind === 'warmer') {
      const last = draft[draft.length - 1] ?? ''
      const warmed = last
        ? last.replace(/[.!]?\s*$/, '') + " — really can't wait!"
        : "Really can't wait!"
      onApply(draft.length ? [...draft.slice(0, -1), warmed] : [warmed])
      return
    }
    if (kind === 'shorter') {
      onApply(draft.map((p) => p.split(/(?<=[.!?])\s+/)[0] || p))
      return
    }
    onApply([...draft, "I'll attach a couple of photos from last time."])
  }
  return (
    <div className="refine-chips">
      <button className="refine-chip" onClick={() => apply('warmer')}>
        <NIcon name="sparkle" size={12} /> Warmer
      </button>
      <button className="refine-chip" onClick={() => apply('shorter')}>
        <NIcon name="chevUp" size={12} /> Shorter
      </button>
      <button className="refine-chip" onClick={() => apply('photos')}>
        <NIcon name="camera" size={12} /> Attach photos
      </button>
    </div>
  )
}

// Group 03 auto mode, at the workspace zoom level: the same run/awaiting/receipt
// states the Today-list growing card renders (growing-card.tsx), replacing the
// plan-mode "want me to take a crack at it?" CTA for an auto-mode task. Presentational
// only — TaskDetail owns the actual todos.run/approve/pause calls so it can also
// sync the local `draft` state when a run lands one (see runAuto below).
function AutoRunPanel({
  task,
  busy,
  onRun,
  onApprove,
  onPause
}: {
  task: Task
  busy: boolean
  onRun: () => void
  onApprove: () => void
  onPause: () => void
}): JSX.Element {
  const state = task.state ?? 'listed'

  if (state === 'awaiting') {
    return (
      <div className="auto-gate">
        <MikanMark state="idle" size={26} />
        <div className="auto-gate-tx">Ready for your OK — nothing sent yet.</div>
        <button className="btn btn-sm primary" onClick={onApprove}>
          Approve
        </button>
      </div>
    )
  }
  if (state === 'working' || busy) {
    return (
      <div className="auto-run">
        <MikanMark state="drafting" size={26} />
        <div className="auto-run-tx">
          Running
          <Dots />
        </div>
        <button className="btn btn-sm ghost" onClick={onPause}>
          Pause
        </button>
      </div>
    )
  }
  if (task.receipt) {
    const r = task.receipt
    return (
      <div className="auto-receipt">
        <MikanMark state="done" size={26} />
        <div className="auto-receipt-tx">
          Ran on device
          {r.durationMs != null ? ` · ${(r.durationMs / 1000).toFixed(1)}s` : ''}
          {r.touched.length > 0 ? ` · touched ${r.touched.length}` : ''} ·{' '}
          {r.sentAnything ? 'sent' : 'nothing sent'}
        </div>
      </div>
    )
  }
  return (
    <button className="draft draft-cta" onClick={onRun}>
      <MikanMark state="idle" size={30} />
      <div className="draft-cta-main">
        <div className="draft-cta-t">Run this on device</div>
        <div className="draft-cta-s">I&apos;ll gather context and draft, on device</div>
      </div>
      <span className="draft-cta-go">
        <NIcon name="arrowRight" size={18} />
      </span>
    </button>
  )
}

export function TaskDetail({
  task,
  onBack,
  onToggle,
  onUpdate,
  onDig,
  onSearch
}: {
  task: Task
  index: number
  onBack: () => void
  onToggle: (id: string) => void
  onUpdate?: (id: string, patch: Partial<Task>) => void
  onDig: () => void
  onSearch: () => void
}): JSX.Element {
  const brand = useBrand()
  const mem = useContext(MemoryContext)
  const [pinned, setPinned] = useState<Set<string>>(new Set(task.pinned || []))
  const [swept, setSwept] = useState<Set<string>>(new Set())
  const [drafting, setDrafting] = useState(false)
  const [draft, setDraft] = useState<string[] | null>(task.draft || null)
  const [open, setOpen] = useState(false)
  const [keptOpen, setKeptOpen] = useState(false) // kept cards collapse into icons once filed
  const [chat, setChat] = useState(false) // ask-Mikan conversation about this task
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

  // context is just the task's saved ctx (minus what's been swept this session);
  // "dig deeper" now adds memories via the app-level SearchOverlay → task.ctx.
  const allIds = (task.ctx || []).filter((id) => !swept.has(id))
  const sorted = allIds.slice().sort((a, b) => {
    const pa = pinned.has(a) ? 1 : 0
    const pb = pinned.has(b) ? 1 : 0
    if (pa !== pb) return pb - pa
    return relFor(task, b) - relFor(task, a)
  })

  const toggleKeep = (id: string): void => {
    const willPin = !pinned.has(id)
    setPinned((s) => {
      const n = new Set(s)
      willPin ? n.add(id) : n.delete(id)
      return n
    })
    // Call onUpdate outside the state updater — updaters must be pure; side effects
    // (including prop callbacks that setState on a parent) must not run inside them.
    if (onUpdate) {
      const next = new Set(pinned)
      willPin ? next.add(id) : next.delete(id)
      onUpdate(task.id, { pinned: [...next] })
    }
    // Persist pins (the contract has no "un-pin", so unpinning stays local-only).
    if (willPin) {
      markFresh([id])
      void data.todos.pinContext(task.id, id).then((t) => {
        if (t) onUpdate && onUpdate(task.id, { ctx: t.ctx, pinned: t.pinned })
      })
    }
  }
  const sweep = (id: string): void => {
    setSwept((s) => new Set(s).add(id))
    void data.todos.dismissContext(task.id, id).then((t) => {
      if (t) onUpdate && onUpdate(task.id, { ctx: t.ctx, pinned: t.pinned })
    })
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

  // Group 03 auto mode — real run/approve/pause, wired to the same backend as
  // GrowingCard's Today-list surface. `autoBusy` gives immediate "working"
  // feedback for the window between clicking Run and the state/receipt landing.
  const [autoBusy, setAutoBusy] = useState(false)
  const runAuto = (): void => {
    setAutoBusy(true)
    void data.todos.run(task.id).then((t) => {
      setAutoBusy(false)
      if (!t) return
      if (t.draft) setDraft(t.draft)
      onUpdate && onUpdate(task.id, { state: t.state, receipt: t.receipt, status: t.status })
    })
  }
  const approveAuto = (): void => {
    void data.todos.approve(task.id).then((t) => {
      if (t) onUpdate && onUpdate(task.id, { state: t.state, receipt: t.receipt })
    })
  }
  const pauseAuto = (): void => {
    void data.todos.pause(task.id).then((t) => {
      setAutoBusy(false)
      if (t) onUpdate && onUpdate(task.id, { state: t.state, receipt: t.receipt })
    })
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
        <button className="hdr-btn" aria-label="Search your memory" onClick={onSearch}>
          <NIcon name="search" size={18} />
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

        {/* Mikan's brief — what it did, what's needed */}
        {task.brief && !done && (
          <div className="brief">
            <MikanMark state="idle" size={22} />
            <div className="brief-tx">{renderBold(task.brief)}</div>
          </div>
        )}

        {!done && <ReasoningCard steps={task.steps} />}

        {/* context Mikan gathered */}
        {!done && (
          <>
            <div className="ovr sources-label">Sources</div>
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
                  keptIds.map((id, i) => {
                    const m = mem[id]
                    if (!m) return null
                    return (
                      <MemoryCard
                        key={id}
                        m={m}
                        rel={relFor(task, id)}
                        why={task.whyMap?.[id] ?? null}
                        pinned
                        swept={swept.has(id)}
                        fresh={fresh.has(id)}
                        delay={i * 0.04}
                        onKeep={() => toggleKeep(id)}
                        onSweep={() => sweep(id)}
                      />
                    )
                  })
                ) : (
                  <button className="kept-strip" onClick={() => setKeptOpen(true)}>
                    <span className="kept-chips">
                      {keptIds.map((id) => {
                        const m = mem[id]
                        if (!m) return null
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
                  className={'pool-group-hd as-toggle' + (open ? ' open' : '')}
                  onClick={() => setOpen((o) => !o)}
                >
                  <NIcon name="layers" size={11} />
                  {freshSugg > 0 && !open ? (
                    <span className="shimmer-text">{freshSugg} just surfaced</span>
                  ) : (
                    <span>{suggIds.length} more memories</span>
                  )}
                  <span className="ln" />
                  <span className="kept-toggle">
                    {open ? 'Tuck away' : 'Review'} <NIcon name="chevDown" size={13} />
                  </span>
                </button>
                {open &&
                  suggIds.map((id, i) => {
                    const m = mem[id]
                    if (!m) return null
                    return (
                      <MemoryCard
                        key={id}
                        m={m}
                        rel={relFor(task, id)}
                        why={task.whyMap?.[id] ?? null}
                        pinned={false}
                        swept={swept.has(id)}
                        fresh={fresh.has(id)}
                        delay={i * 0.04}
                        onKeep={() => toggleKeep(id)}
                        onSweep={() => sweep(id)}
                      />
                    )
                  })}
              </>
            )}

            {keptCount === 0 && suggIds.length === 0 && (
              <div className="empty-note">
                Pool&apos;s empty — everything&apos;s been swept. Ask me to dig deeper whenever.
              </div>
            )}

            <Dock steps={task.steps} />
          </>
        )}

        {!done && <GuidedStepper state={task.state} />}

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
            onEdit={(next) => setDraft(next)}
            onRedo={() => {
              setDraft(null)
              tryDraft()
            }}
          />
        ) : drafting ? (
          <div className="draft draft-working">
            <MikanMark state="drafting" size={30} />
            <div className="draft-working-tx">
              Taking a crack at it
              <Dots />
            </div>
          </div>
        ) : (
          !done &&
          (task.mode === 'auto' ? (
            <AutoRunPanel
              task={task}
              busy={autoBusy}
              onRun={runAuto}
              onApprove={approveAuto}
              onPause={pauseAuto}
            />
          ) : (
            <button className="draft draft-cta" onClick={tryDraft}>
              <MikanMark state="idle" size={30} />
              <div className="draft-cta-main">
                <div className="draft-cta-t">Want me to take a crack at it?</div>
                <div className="draft-cta-s">I&apos;ll draft a start from what you kept</div>
              </div>
              <span className="draft-cta-go">
                <NIcon name="arrowRight" size={18} />
              </span>
            </button>
          ))
        )}

        {done && (
          <div className="dt-donebanner">
            <MikanMark state="done" fill={9} size={30} />
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
          aria-label={`Ask ${brand.productName}`}
          title={`Ask ${brand.productName}`}
        >
          <MikanMark state="idle" size={26} />
        </button>
        <button className="dt-dig" onClick={onDig}>
          <NIcon name="search" size={17} />
          <span className="dt-dig-tx">Dig deeper in your memory</span>
          <NIcon name="arrowRight" size={15} />
        </button>
      </div>

      {chat && <TaskChat task={task} poolCount={allIds.length} onClose={() => setChat(false)} />}
    </div>
  )
}

// Ask Mikan — a lightweight chat about this task, anchored to its context
const CHAT_SUGGESTIONS = [
  'Make the draft warmer',
  'What am I still missing?',
  'Summarize the sources'
]
// Replies stay mocked (no backend chat channel — tracked in UX-PUNCHLIST.md), but
// carry `cites` so the reply can show the same citation/source parts the main
// workspace uses, per CONTEXT.md: "Chat is built from the same parts."
interface ChatReply {
  text: string
  cites?: string[]
}
const CHAT_REPLIES: Record<string, ChatReply> = {
  'Make the draft warmer': {
    text: 'Done — I softened the opener and added a little warmth at the end. Take a look at the draft above.'
  },
  'What am I still missing?': {
    text: "Honestly, not much. The only open thing is confirming the date on your side — everything else I've got covered."
  },
  'Summarize the sources': {
    text: "Quick version: Sarah's flexible on the weekend, your calendar's clear Apr 18–20, and the photos are from the last trip. That's the whole picture.",
    cites: ['m_cabin_mail', 'm_cabin_cal', 'm_cabin_pic']
  }
}

interface ChatMsg {
  from: 'mikan' | 'me'
  text: string
  cites?: string[]
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
  const brand = useBrand()
  const mem = useContext(MemoryContext)
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    {
      from: 'mikan',
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
      const reply: ChatReply = CHAT_REPLIES[q] || {
        text: 'Got it — I pulled what I have on that and tucked it into the sources below. Want me to fold it into the draft?'
      }
      setMsgs((m) => [...m, { from: 'mikan', text: reply.text, cites: reply.cites }])
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
            <MikanMark state={thinking ? 'thinking' : 'idle'} size={28} />
            <div>
              <div className="sheet-ttl">Ask {brand.productName}</div>
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
          {msgs.map((m, i) => {
            const cites = (m.cites ?? []).filter((id) => task.ctx.includes(id) && mem[id])
            return (
              <div key={i} className={'chat-msg ' + (m.from === 'me' ? 'me' : 'ai')}>
                {m.from === 'mikan' && <MikanMark state="idle" size={20} />}
                <div className="chat-msg-col">
                  <div className="chat-bubble">{renderBold(m.text)}</div>
                  {cites.length > 0 && (
                    <div className="chat-cites">
                      {cites.map((id) => (
                        <span key={id} className="chip-pill" title={mem[id].title}>
                          <NIcon name={kindIcon(mem[id].kind)} size={12} /> {mem[id].title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {thinking && (
            <div className="chat-msg ai">
              <MikanMark state="thinking" size={20} />
              <div className="chat-bubble">
                <MikanSay state="thinking" size={0}>
                  Thinking
                  <Dots />
                </MikanSay>
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
