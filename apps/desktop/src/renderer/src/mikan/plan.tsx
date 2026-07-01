// plan.tsx — the daily planning ritual, and "the plan" (Group 12: Plan mode) —
// reviewing/accepting a single task's steps before they run.
import { useState } from 'react'
import type { JSX } from 'react'
import { StepRow } from './growing-card'
import { NIcon } from './icons'
import { MikanMark } from './mark'
import type { BacklogItem, PlanStep, StepRun, Task } from '@mikan/contract/views'

export function PlanRitual({
  tasks,
  cap,
  fresh,
  backlog,
  userName,
  onClose,
  onApply
}: {
  tasks: Task[]
  cap: number
  fresh: boolean
  backlog: BacklogItem[]
  /** Signed-in display name, or null in a local/unconfigured build. */
  userName: string | null
  onClose: () => void
  // hand up the kept task ids + chosen backlog ids; MikanApp drives plan()+schedule()
  onApply: (keep: string[], add: string[]) => void
}): JSX.Element {
  const pool = backlog
  const [decide, setDecide] = useState<Record<string, 'keep' | 'drop'>>(() => {
    const d: Record<string, 'keep' | 'drop'> = {}
    tasks.forEach((t) => (d[t.id] = t.done ? 'drop' : 'keep'))
    return d
  })
  const [add, setAdd] = useState<Set<string>>(new Set())

  const keptCount = Object.values(decide).filter((v) => v === 'keep').length
  const total = keptCount + add.size
  const room = cap - total

  const apply = (): void => {
    const keep = tasks.filter((t) => decide[t.id] === 'keep').map((t) => t.id)
    onApply(keep, [...add].slice(0, Math.max(0, cap - keep.length)))
  }

  return (
    <div className="push">
      <div className="push-hd">
        <button className="push-back" aria-label="Back to today" onClick={onClose}>
          <NIcon name="back" size={18} />
        </button>
        <div className="push-hd-main">
          <div className="push-kicker">{fresh ? 'A fresh day' : 'Daily ritual'}</div>
          <div className="push-ttl">Plan the day</div>
        </div>
      </div>

      <div className="plan-body">
        <div className="plan-intro">
          <MikanMark state="idle" size={56} />
          <div className="plan-intro-h">
            {fresh
              ? userName
                ? `Good morning, ${userName}`
                : 'Good morning'
              : 'A clean slate for today'}
          </div>
          <div className="plan-intro-s">
            {fresh
              ? "Let's choose the five things that matter today. I kept yesterday's leftovers and pulled a few worth a look."
              : 'Keep what still matters, sweep the rest back to the pile. Then top up to ' +
                cap +
                ' — no more.'}
          </div>
        </div>

        <div className="plan-sect">
          <span>{fresh ? "Yesterday's leftovers" : 'Carry over'}</span>
          <span className="ln" />
        </div>
        {tasks.length === 0 && (
          <div className="empty-note" style={{ padding: '8px 4px 4px', textAlign: 'left' }}>
            Nothing carried over — you cleared the board yesterday. Start fresh from your backlog.
          </div>
        )}
        {tasks.map((t) => (
          <div key={t.id} className={'plan-card ' + (decide[t.id] === 'keep' ? 'kept' : 'dropped')}>
            <div className="plan-card-main">
              <div className="plan-card-t">{t.title}</div>
              <div className="plan-card-s">
                {t.done ? 'Done' : (t.ctx ? t.ctx.length : 0) + ' in pool · ' + t.when}
              </div>
            </div>
            <div className="plan-seg">
              <button
                className={decide[t.id] === 'keep' ? 'on-keep' : ''}
                onClick={() => setDecide((d) => ({ ...d, [t.id]: 'keep' }))}
              >
                Keep
              </button>
              <button
                className={decide[t.id] === 'drop' ? 'on-drop' : ''}
                onClick={() => setDecide((d) => ({ ...d, [t.id]: 'drop' }))}
              >
                Sweep
              </button>
            </div>
          </div>
        ))}

        <div className="plan-sect">
          <span>From your backlog</span>
          <span className="ln" />
          <span style={{ color: room > 0 ? 'var(--accent-ink)' : 'var(--rose)' }}>
            {room} slot{room === 1 ? '' : 's'} left
          </span>
        </div>
        {pool.map((b) => {
          const on = add.has(b.id)
          const disabled = !on && room <= 0
          return (
            <button
              key={b.id}
              className={'plan-card ' + (on ? 'kept' : '')}
              style={{
                width: '100%',
                textAlign: 'left',
                cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.45 : 1
              }}
              onClick={() => {
                if (disabled) return
                setAdd((s) => {
                  const n = new Set(s)
                  n.has(b.id) ? n.delete(b.id) : n.add(b.id)
                  return n
                })
              }}
            >
              <span
                className="slot-ico"
                style={{ color: on ? 'var(--accent-ink)' : 'var(--ink-3)' }}
              >
                <NIcon name={on ? 'check' : 'plus'} size={14} />
              </span>
              <div className="plan-card-main">
                <div className="plan-card-t">{b.title}</div>
                <div className="plan-card-s">
                  {b.hint}
                  {b.ctx && b.ctx.length ? ' · ' + b.ctx.length + ' nearby' : ''}
                </div>
              </div>
              {b.fresh && <span className="plan-newtag">New</span>}
            </button>
          )
        })}
        <div style={{ height: '8px' }} />
      </div>

      <div className="dt-foot">
        <div className="today-cap" style={{ flex: '1 1 auto', paddingLeft: '4px' }}>
          <b style={{ color: 'var(--accent-ink)' }}>{total}</b> of {cap} chosen
        </div>
        <button className="btn primary btn-sm" style={{ padding: '0 18px' }} onClick={apply}>
          <NIcon name="check" size={15} /> Start the day
        </button>
      </div>
    </div>
  )
}

// a single step, opened for editing — same look as the read-only `StepRow`
// (growing-card.tsx) but swaps the static run label for an auto/ask segment
function EditableStepRow({
  step,
  onSetRun
}: {
  step: PlanStep
  onSetRun: (run: StepRun) => void
}): JSX.Element {
  return (
    <div className={'gcard-step status-' + step.status}>
      <span className="gcard-step-ico">
        {step.status === 'done' ? (
          <NIcon name="check" size={11} />
        ) : step.status === 'blocked' ? (
          <NIcon name="close" size={10} />
        ) : (
          <span className="gcard-step-dot" />
        )}
      </span>
      <span className="gcard-step-t">{step.title}</span>
      {step.tool && <span className="gcard-step-tool">{step.tool}</span>}
      <div className="plan-seg">
        <button className={step.run === 'auto' ? 'on-auto' : ''} onClick={() => onSetRun('auto')}>
          Auto
        </button>
        <button className={step.run === 'ask' ? 'on-ask' : ''} onClick={() => onSetRun('ask')}>
          Ask
        </button>
      </div>
    </div>
  )
}

// plan.tsx — Group 12: Plan mode. Planning is the default, not a mode you
// start — by the time the user opens a `planned` task, the plan already
// exists. The only decisions are: glance → accept, or open one step to flip
// it between auto and ask.
export function PlanReview({
  task,
  onBack,
  onUpdate
}: {
  task: Task
  onBack: () => void
  onUpdate?: (id: string, patch: Partial<Task>) => void
}): JSX.Element {
  const [openId, setOpenId] = useState<string | null>(null)
  const steps = task.steps

  const setStepRun = (stepId: string, run: StepRun): void => {
    onUpdate?.(task.id, {
      steps: (steps || []).map((s) => (s.id === stepId ? { ...s, run } : s))
    })
    setOpenId(null)
  }

  const accept = (): void => {
    onUpdate?.(task.id, { state: 'working' })
    onBack()
  }

  return (
    <div className="push">
      <div className="push-hd">
        <button className="push-back" aria-label="Back" onClick={onBack}>
          <NIcon name="back" size={18} />
        </button>
        <div className="push-hd-main">
          <div className="push-kicker">The plan</div>
          <div className="push-ttl">{task.title}</div>
        </div>
      </div>

      <div className="plan-body">
        {!steps || steps.length === 0 ? (
          <div className="empty-note">Mikan hasn&apos;t put together a plan for this yet.</div>
        ) : (
          <div className="gcard-steps">
            {steps.map((s) =>
              s.id === openId ? (
                <EditableStepRow key={s.id} step={s} onSetRun={(run) => setStepRun(s.id, run)} />
              ) : (
                <div
                  key={s.id}
                  className="gcard-step-wrap editable"
                  onClick={() => setOpenId(s.id)}
                >
                  <StepRow step={s} />
                </div>
              )
            )}
          </div>
        )}
      </div>

      {steps && steps.length > 0 && (
        <div className="dt-foot">
          <div className="today-cap" style={{ flex: '1 1 auto', paddingLeft: '4px' }}>
            Glance and accept, or open a step to change how it runs.
          </div>
          <button className="btn primary btn-sm" style={{ padding: '0 18px' }} onClick={accept}>
            <NIcon name="check" size={15} /> Accept the plan
          </button>
        </div>
      )}
    </div>
  )
}
