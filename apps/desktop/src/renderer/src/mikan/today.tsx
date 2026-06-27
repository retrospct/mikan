// today.tsx — header, memory weather, Today list, task cards, bottom nav.
import { useBrand } from '@mikan/brand/web'
import type { Task } from '@mikan/contract/views'
import type { JSX } from 'react'
import { useContext, useEffect, useRef, useState } from 'react'
import { MemoryContext } from './api'
import { kindIcon } from './iconKind'
import { NIcon } from './icons'
import { MikanMark, MikanNote } from './mark'
import { SyncControl } from './sync'
import type { MikanMarkState } from './types'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Up late'
  if (h < 12) return 'Morning'
  if (h < 18) return 'Afternoon'
  return 'Evening'
}
function dateLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  })
}

export function AppHeader({
  mikanState,
  badge,
  onSearch,
  onTomorrow,
  onSettings
}: {
  mikanState: MikanMarkState
  badge: number
  onSearch: () => void
  onTomorrow: () => void
  onSettings: () => void
}): JSX.Element {
  return (
    <header className="hdr">
      <div className="hdr-l">
        <span className="hdr-mark">
          <MikanMark state={mikanState} size={38} />
          {badge > 0 && <span className="nm-badge">{badge}</span>}
        </span>
        <div className="hdr-greet">
          <span className="hdr-hi">{greeting()}</span>
          <span className="hdr-date">{dateLabel()}</span>
        </div>
      </div>
      <div className="hdr-r">
        <SyncControl />
        <button className="hdr-btn" aria-label="Plan tomorrow" onClick={onTomorrow}>
          <NIcon name="dayNext" size={18} />
        </button>
        <button className="hdr-btn" aria-label="Search your memory" onClick={onSearch}>
          <NIcon name="search" size={18} />
        </button>
        <button className="hdr-btn" aria-label="Settings" onClick={onSettings}>
          <NIcon name="settings" size={18} />
        </button>
      </div>
    </header>
  )
}

// The ambient "memory weather" banner. `count` is how many context items Mikan
// surfaced beside today's tasks (real, from each task's ctx pool); `memoryCount`
// + `lastFed` come from the live archive (newest-first). `userName` is the signed-
// in identity (null in a local/unconfigured build → the greeting drops the name).
function MemoryWeather({
  count,
  userName,
  memoryCount,
  lastFed,
  onOpen
}: {
  count: number
  userName: string | null
  memoryCount: number
  lastFed: string | null
  onOpen: () => void
}): JSX.Element {
  const meta = [
    `${memoryCount.toLocaleString()} ${memoryCount === 1 ? 'memory' : 'memories'}`,
    lastFed ? `last fed ${lastFed.toLowerCase()}` : null
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="weather" onClick={onOpen} style={{ cursor: 'pointer' }}>
      <div className="weather-main">
        <div className="weather-t">
          {userName ? `Hey ${userName} — ` : ''}overnight I lined up <b>{count} things</b> beside
          today&apos;s list.
        </div>
        <div className="weather-meta">{meta}</div>
      </div>
      <NIcon name="chevRight" size={16} style={{ color: 'var(--ink-3)', flex: '0 0 auto' }} />
    </div>
  )
}

// stacked mini-thumbnails for the ambient strip
function CtxThumbs({ memIds }: { memIds: string[] }): JSX.Element {
  const mem = useContext(MemoryContext)
  const ids = memIds.slice(0, 3)
  return (
    <div className="ctx-thumbs">
      {ids.map((id) => {
        const m = mem[id]
        const isImg = m && (m.kind === 'photo' || m.kind === 'screenshot' || m.kind === 'image')
        return (
          <span key={id} className={'ct' + (isImg ? ' img' : '')}>
            {!isImg && <NIcon name={kindIcon(m ? m.kind : 'note')} size={11} />}
          </span>
        )
      })}
    </div>
  )
}

function TaskCard({
  task,
  index,
  layout,
  onOpen,
  onToggle
}: {
  task: Task
  index: number
  layout: string
  onOpen: (id: string) => void
  onToggle: (id: string) => void
}): JSX.Element {
  const kept = (task.pinned || []).length
  const ctxN = (task.ctx || []).length
  const ctxLabel =
    kept > 0 ? (
      <span>
        <b>{kept}</b> kept · {ctxN} things
      </span>
    ) : (
      <span>
        <b>{ctxN}</b> things
      </span>
    )

  // gratifying completion: detect a false→true flip to fire a one-shot celebration
  const prev = useRef(task.done)
  const [pop, setPop] = useState(false)
  useEffect(() => {
    if (task.done && !prev.current) {
      setPop(true)
      const id = setTimeout(() => setPop(false), 850)
      prev.current = task.done
      return () => clearTimeout(id)
    }
    prev.current = task.done
    return undefined
  }, [task.done])

  return (
    <div
      className={'task' + (task.done ? ' done-task' : '') + (pop ? ' pop' : '')}
      style={{ animationDelay: `${index * 0.06}s` }}
      onClick={() => onOpen(task.id)}
    >
      <div className="task-row">
        {layout === 'slots' && <span className="big-num">{index + 1}</span>}
        <button
          className="task-check"
          aria-label="Complete"
          onClick={(e) => {
            e.stopPropagation()
            onToggle(task.id)
          }}
        >
          <NIcon name="check" size={15} stroke={2.4} />
          {pop && <span className="check-burst" />}
        </button>
        <div className="task-main">
          <div className="task-title">{task.title}</div>
          {task.done ? (
            <MikanNote kind="done">Done — nice work.</MikanNote>
          ) : (
            <>
              {task.note && <MikanNote kind={task.noteKind || 'gathered'}>{task.note}</MikanNote>}
              <div className="ctx-strip">
                {ctxN > 0 && <CtxThumbs memIds={task.ctx} />}
                <span className="ctx-txt">{ctxLabel}</span>
                <span className="ctx-go">
                  <NIcon name="chevRight" size={15} />
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptySlot({ index, onAdd }: { index: number; onAdd: () => void }): JSX.Element {
  return (
    <button className="slot" style={{ animationDelay: `${index * 0.06}s` }} onClick={onAdd}>
      <span className="slot-ico">
        <NIcon name="plus" size={15} />
      </span>
      <span>
        <span className="slot-tx" style={{ display: 'block' }}>
          An open slot
        </span>
        <span className="slot-sub">Pick one more thing</span>
      </span>
    </button>
  )
}

interface TodayViewProps {
  tasks: Task[]
  cap: number
  layout: string
  planned: boolean
  carriedCount: number
  backlogCount: number
  badge: number
  /** Signed-in display name, or null in a local/unconfigured build. */
  userName: string | null
  /** Live archive size (real). */
  memoryCount: number
  /** Pre-formatted relative time of the most-recent capture, or null if empty. */
  lastFed: string | null
  onOpen: (id: string) => void
  onToggle: (id: string) => void
  onAdd: () => void
  onPlan: () => void
  onTomorrow: () => void
  onSearch: () => void
  onWeather: () => void
  onSettings: () => void
  mikanState: MikanMarkState
}

export function TodayView({
  tasks,
  cap,
  layout,
  planned,
  carriedCount,
  backlogCount,
  badge,
  userName,
  memoryCount,
  lastFed,
  onOpen,
  onToggle,
  onPlan,
  onTomorrow,
  onSearch,
  onWeather,
  onSettings,
  mikanState
}: TodayViewProps): JSX.Element {
  const brand = useBrand()
  const filled = tasks.length
  const open = Math.max(0, cap - filled)
  const left = tasks.filter((t) => !t.done).length

  if (!planned) {
    return (
      <div className="view">
        <div className="scroll">
          <AppHeader
            mikanState={mikanState}
            badge={badge}
            onSearch={onSearch}
            onTomorrow={onPlan}
            onSettings={onSettings}
          />
          <div className="dayzero">
            <MikanMark state="idle" size={66} />
            <div className="dayzero-h">A fresh day</div>
            <div className="dayzero-s">
              Let&apos;s choose the five things that matter today. I kept yesterday&apos;s leftovers
              and pulled a few worth a look.
            </div>
            <button className="btn primary dayzero-btn" onClick={onPlan}>
              <NIcon name="today" size={17} /> Plan today
            </button>
            <div className="dayzero-meta">
              {carriedCount} carried over · {backlogCount} in your backlog
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="view">
      <div className="scroll">
        <AppHeader
          mikanState={mikanState}
          badge={badge}
          onSearch={onSearch}
          onTomorrow={onTomorrow}
          onSettings={onSettings}
        />
        {memoryCount > 0 && (
          <MemoryWeather
            count={tasks.reduce((a, t) => a + (t.ctx ? t.ctx.length : 0), 0)}
            userName={userName}
            memoryCount={memoryCount}
            lastFed={lastFed}
            onOpen={onWeather}
          />
        )}
        <div className="today-top">
          <span className="today-cap">
            Today · <b>{left}</b> of {cap}
          </span>
          <button className="today-link" onClick={onPlan}>
            Plan
          </button>
        </div>
        <div className={'list casc'} data-layout={layout}>
          {tasks.map((t, i) => (
            <TaskCard
              key={t.id}
              task={t}
              index={i}
              layout={layout}
              onOpen={onOpen}
              onToggle={onToggle}
            />
          ))}
          {Array.from({ length: open }).map((_, i) => (
            <EmptySlot key={'slot' + i} index={filled + i} onAdd={onPlan} />
          ))}
          {open === 0 && (
            <div className="empty-note">
              That&apos;s a full, honest day. {brand.productName} will keep the rest in the backlog.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function BottomNav({
  tab,
  onTab,
  onAdd
}: {
  tab: string
  onTab: (x: string) => void
  onAdd: () => void
}): JSX.Element {
  return (
    <nav className="nav">
      <button className={'nav-btn' + (tab === 'today' ? ' on' : '')} onClick={() => onTab('today')}>
        <NIcon name="today" size={21} />
        <span className="nv-lbl">Today</span>
      </button>
      <button className="fab" aria-label="Add a task" onClick={onAdd}>
        <NIcon name="plus" size={24} stroke={2.2} />
      </button>
      <button className={'nav-btn' + (tab === 'feed' ? ' on' : '')} onClick={() => onTab('feed')}>
        <NIcon name="archive" size={20} />
        <span className="nv-lbl">Feed</span>
      </button>
    </nav>
  )
}
