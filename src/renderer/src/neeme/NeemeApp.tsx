// NeemeApp.tsx — the Neeme desktop surface: state, navigation, screens.
//
// Ported from the design bundle's neeme-app.jsx. Two deliberate changes from the
// prototype, per the implementation brief:
//   1. The desktop fills the real Electron window — the prototype's simulated macOS
//      menu bar + tray popover are dropped (the OS provides real chrome; real
//      frameless-window + tray integration is a later main-process step). The app
//      is a single centred column on the matcha wallpaper, "the same size as mobile".
//   2. The design-time TweaksPanel (a variation explorer) is dropped. Its chosen
//      defaults — dark / matcha / stack / cozy / ambient-on — are applied to <html>,
//      and the header's "Plan tomorrow" button still triggers the new-day ritual.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { TodayView, BottomNav } from './today'
import { TaskDetail } from './task'
import { FeedView } from './feed'
import { AddSheet } from './add'
import { PlanRitual } from './plan'
import { AllDone } from './celebrate'
import { SEED_TASKS, REL, BACKLOG } from './data'
import type { BacklogItem, Task } from './data'
import type { NeemeMarkState } from './types'
import './neeme.css'

const CAP = 5

// The product defaults the design landed on (formerly the TweaksPanel defaults).
const TWEAKS = {
  theme: 'dark',
  accent: 'matcha', // matcha is the CSS :root default, so no var override needed
  todayLayout: 'stack',
  captureStyle: 'drop',
  density: 'cozy',
  ambient: true
} as const

function seedTasks(): Task[] {
  return SEED_TASKS.map((t) => ({ ...t, relMap: REL[t.id] || {} }))
}

export default function NeemeApp(): JSX.Element {
  const [tasks, setTasks] = useState<Task[]>(seedTasks)
  const [tab, setTab] = useState<'today' | 'feed'>('today')
  const [overlay, setOverlay] = useState<'add' | 'plan' | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [headState, setHeadState] = useState<NeemeMarkState>('idle')
  const [planned, setPlanned] = useState(true) // a fresh day starts unplanned
  const [yesterday, setYesterday] = useState<Task[]>([]) // leftovers to carry over
  const [showWin, setShowWin] = useState(false)
  const [backlog, setBacklog] = useState<BacklogItem[]>(BACKLOG)
  const [feedRecording, setFeedRecording] = useState(false)
  const [addRecording, setAddRecording] = useState(false)

  useEffect(() => {
    const el = document.documentElement
    el.setAttribute('data-theme', TWEAKS.theme)
    el.setAttribute('data-density', TWEAKS.density)
    el.setAttribute('data-ambient', TWEAKS.ambient ? 'on' : 'off')
  }, [])

  const cheer = (): void => {
    setHeadState('happy')
    setTimeout(() => setHeadState('idle'), 1000)
  }

  const toggleTask = (id: string): void =>
    setTasks((ts) =>
      ts.map((x) => {
        if (x.id !== id) return x
        if (!x.done) cheer()
        return { ...x, done: !x.done }
      })
    )

  const updateTask = (id: string, patch: Partial<Task>): void =>
    setTasks((ts) => ts.map((x) => (x.id === id ? { ...x, ...patch } : x)))

  // a new to-do (typed, or accepted from what indexing uncovered) → into the backlog
  const addToBacklog = (item: {
    id?: string
    title: string
    why?: string
    ctx?: string[]
    conf?: number | null
  }): void => {
    setBacklog((b) => [
      {
        id: item.id || 'b_' + Date.now(),
        title: item.title,
        hint: item.why || 'Added by you',
        ctx: item.ctx || [],
        conf: item.conf ?? null,
        fresh: true
      },
      ...b
    ])
    cheer()
  }
  const onFed = (): void => cheer()

  const applyPlan = (next: Task[]): void => {
    setTasks(next.map((x) => ({ ...x, relMap: x.relMap || REL[x.id] || {} })))
    setYesterday([])
    setPlanned(true)
    setOverlay(null)
    setTab('today')
    cheer()
  }

  // roll the day over: today's tasks become carry-over candidates, day awaits planning
  const beginNewDay = (): void => {
    setYesterday(tasks.filter((x) => !x.done).map((x) => ({ ...x, fresh: false })))
    setPlanned(false)
    setOpenId(null)
    setOverlay('plan') // go straight to planning — no empty intermediate screen
    setTab('today')
  }

  const planThings = planned ? tasks : yesterday

  // all five done → the payoff (slight delay lets the last task's pop play).
  // The dialog renders only while `allDone && showWin`, so when the day stops being
  // complete it's hidden by derivation — no synchronous reset needed. The effect
  // just arms the reveal timer once per completion (winRef is a ref, not state).
  const allDone = planned && tasks.length > 0 && tasks.every((x) => x.done)
  const winRef = useRef(false)
  useEffect(() => {
    if (!allDone) {
      winRef.current = false
      return undefined
    }
    if (winRef.current) return undefined
    winRef.current = true
    const id = setTimeout(() => setShowWin(true), 720)
    return () => clearTimeout(id)
  }, [allDone])

  const openTask = tasks.find((x) => x.id === openId) || null
  const openIndex = tasks.findIndex((x) => x.id === openId)
  // hide the nav while a recorder is up (round STOP would stack on the + FAB) and on the
  // task detail (a focused drill-in with its own footer + back). Plan keeps the nav.
  const hideNav = feedRecording || addRecording || !!openId
  const cancelPlan = (): void => {
    setOverlay(null)
    setPlanned(true)
  }

  // a stable carried-over count for the fresh-day meta line
  const carriedCount = useMemo(() => yesterday.filter((x) => !x.done).length, [yesterday])

  return (
    <div className="desk">
      <div className="desk-wall" />
      <div className="app-frame">
        <div className="app">
          <div className="screen">
            {tab === 'today' ? (
              <TodayView
                tasks={tasks}
                cap={CAP}
                layout={TWEAKS.todayLayout}
                neemeState={headState}
                planned={planned}
                carriedCount={carriedCount}
                backlogCount={backlog.length}
                onOpen={setOpenId}
                onToggle={toggleTask}
                onAdd={() => setOverlay('add')}
                onPlan={() => setOverlay('plan')}
                onTomorrow={beginNewDay}
                onWeather={() => setOverlay('plan')}
              />
            ) : (
              <FeedView
                captureStyle={TWEAKS.captureStyle}
                onCaptured={cheer}
                onRecordingChange={setFeedRecording}
              />
            )}

            {openTask && (
              <TaskDetail
                task={openTask}
                index={openIndex}
                onBack={() => setOpenId(null)}
                onToggle={toggleTask}
                onUpdate={updateTask}
              />
            )}

            {overlay === 'add' && (
              <AddSheet
                onClose={() => setOverlay(null)}
                onFed={onFed}
                onAddTodo={addToBacklog}
                onRecordingChange={setAddRecording}
              />
            )}
            {overlay === 'plan' && (
              <PlanRitual
                tasks={planThings}
                cap={CAP}
                fresh={!planned}
                backlog={backlog}
                onClose={cancelPlan}
                onApply={applyPlan}
              />
            )}

            {allDone && showWin && (
              <AllDone
                count={tasks.length}
                onClose={() => setShowWin(false)}
                onPlan={() => {
                  setShowWin(false)
                  beginNewDay()
                }}
              />
            )}
          </div>

          {!hideNav && (
            <BottomNav
              tab={tab}
              onTab={(x) => {
                setOpenId(null)
                setOverlay(null)
                if (!planned) setPlanned(true)
                setTab(x as 'today' | 'feed')
              }}
              onAdd={() => {
                setOpenId(null)
                setOverlay('add')
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
