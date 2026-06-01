// NimiApp.tsx — the Nimi desktop surface: state, navigation, screens.
//
// Ported from the design bundle's nimi-app.jsx. Two deliberate changes from the
// prototype, per the implementation brief:
//   1. The desktop fills the real Electron window — the prototype's simulated macOS
//      menu bar + tray popover are dropped (the OS provides real chrome; real
//      frameless-window + tray integration is a later main-process step). The app
//      is a single centred column on the matcha wallpaper, "the same size as mobile".
//   2. The design-time TweaksPanel (a variation explorer) is dropped. Its chosen
//      defaults — dark / apricot / stack / cozy / ambient-on — are applied to <html>,
//      and the header's "Plan tomorrow" button still triggers the new-day ritual.
//   3. The prototype's menu-bar/tray search + badge live on the header here: the
//      "waiting" badge sits on the header mark, and global search replaces the (then
//      meaningless) "On device" pill.
//
// Data comes from the `data` seam (apps/.../nimi/api.ts): the real `window.api`
// in Electron, an in-memory mock in the browser preview. AI-only fields come back
// null until the drafting layer lands (docs/INTEGRATION.md).
import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { TodayView, BottomNav } from './today'
import { TaskDetail } from './task'
import { FeedView } from './feed'
import { AddSheet } from './add'
import { PlanRitual } from './plan'
import { AllDone } from './celebrate'
import { SearchOverlay } from './search'
import { NIcon } from './icons'
import { NimiMark, Dots } from './mark'
import { data, MemoryContext } from './api'
import type { BacklogItem, Memory, Task } from '@nimi/contract/views'
import type { NimiMarkState } from './types'
import './nimi.css'

const CAP = 5

// The product defaults the design landed on (formerly the TweaksPanel defaults).
const TWEAKS = {
  theme: 'dark',
  accent: 'apricot',
  todayLayout: 'stack',
  captureStyle: 'drop',
  density: 'cozy',
  ambient: true
} as const

// accent palettes from the design (oklch). matcha is the CSS :root default; any
// other accent (apricot is the current default) sets the --accent* vars on <html>.
const ACCENTS: Record<string, { solid: string; ink: string; deep: string }> = {
  matcha: {
    solid: 'oklch(0.80 0.13 142)',
    ink: 'oklch(0.90 0.09 142)',
    deep: 'oklch(0.62 0.13 142)'
  },
  apricot: {
    solid: 'oklch(0.80 0.12 64)',
    ink: 'oklch(0.90 0.09 64)',
    deep: 'oklch(0.64 0.12 64)'
  },
  rose: { solid: 'oklch(0.76 0.12 18)', ink: 'oklch(0.87 0.09 18)', deep: 'oklch(0.60 0.12 18)' },
  iris: { solid: 'oklch(0.74 0.12 280)', ink: 'oklch(0.86 0.10 280)', deep: 'oklch(0.58 0.13 280)' }
}

// While the first load is in flight (today + backlog + archive). In the browser
// the mock resolves instantly; in Electron this covers worker boot / model load.
function LoadingView(): JSX.Element {
  return (
    <div className="view">
      <div className="scroll">
        <div className="add-stage">
          <NimiMark state="thinking" size={66} />
          <div className="add-stage-t">
            Waking up
            <Dots />
          </div>
          <div className="add-stage-s">Gathering today&apos;s list and your memory.</div>
        </div>
      </div>
    </div>
  )
}

// The on-device worker didn't answer (Electron only — the mock never rejects).
function ErrorView({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <div className="view">
      <div className="scroll">
        <div className="add-stage">
          <NimiMark state="idle" size={66} />
          <div className="add-stage-t">Couldn&apos;t reach your memory</div>
          <div className="add-stage-s">The on-device worker didn&apos;t respond just now.</div>
          <button className="btn primary" style={{ marginTop: '6px' }} onClick={onRetry}>
            <NIcon name="refresh" size={16} /> Try again
          </button>
        </div>
      </div>
    </div>
  )
}

export default function NimiApp(): JSX.Element {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [tasks, setTasks] = useState<Task[]>([])
  const [backlog, setBacklog] = useState<BacklogItem[]>([])
  const [archive, setArchive] = useState<Memory[]>([])
  const [tab, setTab] = useState<'today' | 'feed'>('today')
  const [overlay, setOverlay] = useState<'add' | 'plan' | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [headState, setHeadState] = useState<NimiMarkState>('idle')
  const [planned, setPlanned] = useState(true) // a returning day is already planned
  const [yesterday, setYesterday] = useState<Task[]>([]) // leftovers to carry over
  const [showWin, setShowWin] = useState(false)
  const [feedRecording, setFeedRecording] = useState(false)
  const [addRecording, setAddRecording] = useState(false)
  // global = "search everything" (header magnifier); task = "dig deeper" scoped to the
  // open task (its footer). Only task-mode carries the task's context into the overlay.
  const [searchMode, setSearchMode] = useState<'global' | 'task' | null>(null)

  useEffect(() => {
    const el = document.documentElement
    el.setAttribute('data-theme', TWEAKS.theme)
    el.setAttribute('data-density', TWEAKS.density)
    el.setAttribute('data-ambient', TWEAKS.ambient ? 'on' : 'off')
    const a = ACCENTS[TWEAKS.accent] || ACCENTS.matcha
    el.style.setProperty('--accent', a.solid)
    el.style.setProperty('--accent-ink', a.ink)
    el.style.setProperty('--accent-deep', a.deep)
  }, [])

  // Initial load: today's list, the backlog, and the archive (for ctx lookups).
  // setState lands inside the promise callback (never synchronously in the effect
  // body); `reloadKey` re-runs it for the error-retry path.
  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    let active = true
    Promise.all([data.todos.today(), data.todos.backlog(), data.pipeline.archive()])
      .then(([today, bl, arch]) => {
        if (!active) return
        setTasks(today.map((t) => ({ ...t, relMap: t.relMap ?? {} })))
        setBacklog(bl)
        setArchive(arch)
        setPhase('ready')
      })
      .catch(() => active && setPhase('error'))
    return () => {
      active = false
    }
  }, [reloadKey])

  // archive → id-keyed lookup the screens read via MemoryContext (no prop drilling).
  const memMap = useMemo(
    () => Object.fromEntries(archive.map((m) => [m.id, m])) as Record<string, Memory>,
    [archive]
  )

  const cheer = (): void => {
    setHeadState('happy')
    setTimeout(() => setHeadState('idle'), 1000)
  }

  const toggleTask = (id: string): void => {
    const cur = tasks.find((x) => x.id === id)
    if (!cur) return
    const willComplete = !cur.done
    if (willComplete) cheer()
    // optimistic flip — the card pop + all-done payoff key off this immediately
    setTasks((ts) => ts.map((x) => (x.id === id ? { ...x, done: willComplete } : x)))
    const revert = (): void =>
      setTasks((ts) => ts.map((x) => (x.id === id ? { ...x, done: !willComplete } : x)))
    const p = willComplete ? data.todos.complete(id) : data.todos.reopen(id)
    p.then((updated) => {
      if (updated)
        setTasks((ts) =>
          ts.map((x) => (x.id === id ? { ...updated, relMap: updated.relMap ?? x.relMap } : x))
        )
      else revert()
    }).catch(revert)
  }

  const updateTask = (id: string, patch: Partial<Task>): void =>
    setTasks((ts) => ts.map((x) => (x.id === id ? { ...x, ...patch } : x)))

  // a new to-do (typed, or accepted from indexing) → today if there's room, else
  // the backlog. The contract has no "add to backlog", so a full day (CAP_REACHED)
  // or an unreachable worker falls back to local backlog state — the to-do is never
  // lost. See docs/INTEGRATION.md.
  const addTodo = async (item: {
    id?: string
    title: string
    why?: string
    ctx?: string[]
    conf?: number | null
  }): Promise<void> => {
    try {
      const task = await data.todos.add(item.title, item.why)
      setTasks((ts) => [...ts, { ...task, relMap: task.relMap ?? {}, fresh: true }])
      cheer()
    } catch {
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
  }
  const onFed = (): void => cheer()

  // carry `keep` onto today + pull `add` backlog ids in; plan() sweeps the rest.
  const applyPlan = async (keep: string[], add: string[]): Promise<void> => {
    setOverlay(null)
    setTab('today')
    setYesterday([])
    setPlanned(true)
    try {
      const kept = await data.todos.plan(keep)
      const scheduled: Task[] = []
      for (const id of add) {
        const t = await data.todos.schedule(id)
        if (t) scheduled.push(t)
      }
      setTasks([...kept, ...scheduled].map((x) => ({ ...x, relMap: x.relMap ?? {} })))
      setBacklog(await data.todos.backlog())
      cheer()
    } catch {
      // keep the optimistic "planned" view — nothing destructive to undo
    }
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

  // things waiting on you: drafts ready to act + freshly-uncovered backlog to-dos
  const waiting =
    tasks.filter((x) => !x.done && x.status === 'drafted').length +
    backlog.filter((b) => b.fresh).length

  // Mirror the waiting count onto the tray/Dock badge. The mock no-ops; only the
  // real Electron `data.ui.setBadge` touches the OS.
  useEffect(() => {
    void data.ui.setBadge(waiting)
  }, [waiting])
  const openGlobalSearch = (): void => {
    setOverlay(null)
    setSearchMode('global')
  }
  const openTaskSearch = (): void => setSearchMode('task')
  // a memory kept from search → added to the open task's context pool (persisted as a pin)
  const addContextToTask = (memId: string): void => {
    if (!openTask) return
    updateTask(openTask.id, {
      ctx: [...new Set([...(openTask.ctx || []), memId])],
      pinned: [...new Set([...(openTask.pinned || []), memId])]
    })
    void data.todos.pinContext(openTask.id, memId).then((t) => {
      if (t) updateTask(t.id, { ctx: t.ctx, pinned: t.pinned, relMap: t.relMap ?? {} })
    })
  }

  return (
    <div className="desk">
      <div className="desk-wall" />
      <div className="app-frame">
        <div className="app">
          <div className="screen">
            {phase === 'loading' ? (
              <LoadingView />
            ) : phase === 'error' ? (
              <ErrorView
                onRetry={() => {
                  setPhase('loading')
                  setReloadKey((k) => k + 1)
                }}
              />
            ) : (
              <MemoryContext.Provider value={memMap}>
                {tab === 'today' ? (
                  <TodayView
                    tasks={tasks}
                    cap={CAP}
                    layout={TWEAKS.todayLayout}
                    nimiState={headState}
                    planned={planned}
                    carriedCount={carriedCount}
                    backlogCount={backlog.length}
                    badge={waiting}
                    onOpen={setOpenId}
                    onToggle={toggleTask}
                    onAdd={() => setOverlay('add')}
                    onPlan={() => setOverlay('plan')}
                    onTomorrow={beginNewDay}
                    onSearch={openGlobalSearch}
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
                    onDig={openTaskSearch}
                    onSearch={openGlobalSearch}
                  />
                )}

                {overlay === 'add' && (
                  <AddSheet
                    onClose={() => setOverlay(null)}
                    onFed={onFed}
                    onAddTodo={addTodo}
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
                    titles={tasks.map((x) => x.title)}
                    onClose={() => setShowWin(false)}
                    onPlan={() => {
                      setShowWin(false)
                      beginNewDay()
                    }}
                  />
                )}

                {searchMode && (
                  <SearchOverlay
                    contextTitle={searchMode === 'task' && openTask ? openTask.title : null}
                    keptIds={searchMode === 'task' && openTask ? openTask.ctx : []}
                    onKeep={searchMode === 'task' && openTask ? addContextToTask : null}
                    onClose={() => setSearchMode(null)}
                  />
                )}
              </MemoryContext.Provider>
            )}
          </div>

          {phase === 'ready' && !hideNav && (
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
