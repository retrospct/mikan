// plan.tsx — the daily planning ritual. Keep a few, sweep the rest to the backlog.
import { useState } from 'react'
import type { JSX } from 'react'
import { NIcon } from './icons'
import { NimiMark } from './mark'
import { BACKLOG, REL } from './data'
import type { BacklogItem, Task } from './data'

export function PlanRitual({
  tasks,
  cap,
  fresh,
  backlog,
  onClose,
  onApply
}: {
  tasks: Task[]
  cap: number
  fresh: boolean
  backlog: BacklogItem[]
  onClose: () => void
  onApply: (next: Task[]) => void
}): JSX.Element {
  const pool = backlog || BACKLOG
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
    const kept = tasks.filter((t) => decide[t.id] === 'keep').map((t) => ({ ...t, fresh: false }))
    const added: Task[] = [...add].map((id) => {
      const b = pool.find((x) => x.id === id) as BacklogItem
      const ctx = b.ctx || []
      return {
        id: 't_' + id,
        title: b.title,
        when: 'today',
        status: 'gathered',
        done: false,
        ctx,
        pinned: [],
        draft: null,
        draftNote: null,
        fresh: true,
        note: ctx.length ? `Kept ${ctx.length} thing${ctx.length === 1 ? '' : 's'} for you.` : null,
        noteKind: 'gathered',
        relMap: REL[id] || {}
      }
    })
    onApply([...kept, ...added].slice(0, cap))
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
          <NimiMark state="idle" size={56} />
          <div className="plan-intro-h">
            {fresh ? 'Good morning, Jordan' : 'A clean slate for today'}
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
