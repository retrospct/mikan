// mock.ts — the browser-preview seed + an in-memory `window.api` stand-in.
//
// Ported from the design bundle (mikan-data.jsx + the BACKLOG that lived in
// mikan-plan.jsx). This is hand-authored placeholder content. The view-model
// types now live in `@mikan/contract/views` — this file only holds sample data
// and `makeMockApi()`, the adapter `api.ts` falls back to when `window.api` is
// absent (i.e. running in a plain browser, not Electron). It mutates module-local
// arrays and returns the updated view shapes, mirroring the real worker so the
// browser preview behaves like the app.
import type {
  BacklogItem,
  FedItem,
  MatchHit,
  Memory,
  MemoryKind,
  Task,
  UncoveredTodo
} from '@mikan/contract/views'
import { CAP_REACHED, type CaptureResult, type MikanApi, type Todo } from '@mikan/contract/ipc'

type MockApi = Pick<MikanApi, 'pipeline' | 'todos' | 'ui' | 'update'>

// The day's focus cap (mirrors MikanApp's CAP) — lets the mock raise CAP_REACHED
// so the add-todo → backlog fallback is exercisable in the browser.
const CAP = 5

// ── the memory archive (what you've "fed" Mikan) ────────────────────────────
export const MEMORIES: Record<string, Memory> = {
  m_cabin_note: {
    id: 'm_cabin_note',
    kind: 'note',
    title: "Sarah's cabin dates",
    snip: "She floated Apr 18–20 or the 25th weekend. Bring hiking boots — they'll sort the food.",
    src: 'Quick note',
    when: '2 weeks ago'
  },
  m_cabin_mail: {
    id: 'm_cabin_mail',
    kind: 'email',
    title: 'Re: cabin?? 🏔  — from Sarah',
    snip: "ok so EITHER weekend works for us, just lmk which and I'll lock the place in. no pressure!!",
    src: 'Mail · Sarah K.',
    when: '9 days ago'
  },
  m_cabin_cal: {
    id: 'm_cabin_cal',
    kind: 'calendar',
    title: 'Apr 18–20 — wide open',
    snip: "Nothing scheduled. The 25th has Dana's thing Saturday evening, FYI.",
    src: 'Calendar',
    when: 'this month'
  },
  m_cabin_pic: {
    id: 'm_cabin_pic',
    kind: 'photo',
    title: 'Norris Lake, last spring',
    snip: 'From the album the morning everyone went out on the water.',
    src: 'Photos · Norris Lake',
    when: '1 year ago'
  },

  m_q3_pdf: {
    id: 'm_q3_pdf',
    kind: 'pdf',
    title: 'Q3-wrap-draft.pdf',
    snip: 'Revenue +14% QoQ, churn down to 2.1%. Slide 4 still TODO — needs the retention chart.',
    src: 'Files · 11 pages',
    when: '4 days ago'
  },
  m_q3_mail: {
    id: 'm_q3_mail',
    kind: 'email',
    title: 'Priya: re Q3 wrap-up',
    snip: 'Can you get me the one-pager by Fri? Board reads Monday. Numbers + 3 takeaways, keep it tight.',
    src: 'Mail · Priya M.',
    when: '3 days ago'
  },
  m_q3_note: {
    id: 'm_q3_note',
    kind: 'note',
    title: 'Q3 takeaways (rough)',
    snip: '1) retention is finally turning 2) enterprise pipeline 3× 3) support load down after the docs revamp.',
    src: 'Quick note',
    when: '5 days ago'
  },

  m_rest_note: {
    id: 'm_rest_note',
    kind: 'note',
    title: 'Places mom might like',
    snip: "T'alula's (she loved that patio), the little ramen spot downtown, or Bria if we go fancy. No loud rooms.",
    src: 'Quick note',
    when: '1 month ago'
  },
  m_rest_shot: {
    id: 'm_rest_shot',
    kind: 'screenshot',
    title: "T'alula's — reservations",
    snip: 'OpenTable screenshot: Saturday 7:30 shows two tables left.',
    src: 'Screenshot',
    when: 'yesterday'
  },
  m_mom_pic: {
    id: 'm_mom_pic',
    kind: 'photo',
    title: "Mom's birthday, last year",
    snip: 'The one on the patio with the little candle in the tiramisu.',
    src: 'Photos · Family',
    when: '1 year ago'
  },
  m_gift_voice: {
    id: 'm_gift_voice',
    kind: 'voice',
    title: 'voice memo — gift ideas',
    snip: '…she mentioned that pottery class again, and her gardening gloves are basically done…',
    src: 'Voice · 0:41',
    when: '3 weeks ago'
  },

  // looser archive — surfaces on "search more" / typed tasks
  m_dentist: {
    id: 'm_dentist',
    kind: 'note',
    title: 'Dr. Okafor — overdue cleaning',
    snip: 'They text to confirm. Last visit was November. Mornings are easier.',
    src: 'Quick note',
    when: '6 weeks ago'
  },
  m_flight: {
    id: 'm_flight',
    kind: 'email',
    title: 'United: travel credit',
    snip: '$214 credit on file — expires Jun 30. Apply at checkout.',
    src: 'Mail · United',
    when: '1 month ago'
  },
  m_bookclub: {
    id: 'm_bookclub',
    kind: 'note',
    title: 'Book club — next pick',
    snip: "We're on the Le Guin. Meets 2nd Tuesday at Reyna's.",
    src: 'Quick note',
    when: '2 weeks ago'
  },
  m_article: {
    id: 'm_article',
    kind: 'link',
    title: 'On protecting your mornings',
    snip: "Saved read — the bit about a single 'anchor' task before email.",
    src: 'Link · longform',
    when: '10 days ago'
  }
}

// relevance score shown on each memory chip, derived deterministically per task
const REL: Record<string, Record<string, number>> = {
  t_cabin: { m_cabin_note: 0.95, m_cabin_mail: 0.9, m_cabin_cal: 0.82, m_cabin_pic: 0.55 },
  t_q3: { m_q3_mail: 0.93, m_q3_pdf: 0.88, m_q3_note: 0.78 },
  t_dinner: { m_rest_note: 0.9, m_rest_shot: 0.74, m_mom_pic: 0.52, m_gift_voice: 0.6 }
}

// ── seed tasks for Today (cap 5 → 3 filled + 2 open slots) ──────────────────
const SEED_TASKS: Task[] = [
  {
    id: 't_cabin',
    title: 'Reply to Sarah about the cabin weekend',
    when: 'today',
    status: 'drafted',
    done: false,
    noteKind: 'ready',
    note: "Draft's ready — it just needs your yes.",
    ctx: ['m_cabin_note', 'm_cabin_mail', 'm_cabin_cal', 'm_cabin_pic'],
    pinned: ['m_cabin_mail'],
    draft: [
      "Hey Sarah! Let's do **Apr 18–20** — my calendar's clear that weekend and the 25th has a conflict on Saturday.",
      "Book it whenever's easy and I'll sort the drive. I've got the hiking boots ready 🥾"
    ],
    draftNote: 'From her email + your calendar.',
    brief:
      "I read your thread with Sarah and checked your calendar — you're clear **Apr 18–20**, so I drafted a reply locking that weekend. It just needs your yes.",
    draftFor: 'Reply to Sarah K.',
    draftType: 'Gmail draft · reply to Sarah',
    draftIcon: 'mail',
    useLabel: 'Open in Gmail',
    useNote: 'Opens as a reply in Gmail — nothing sends until you hit send.',
    useDone: "Opened in Gmail — send it when you're ready."
  },
  {
    id: 't_q3',
    title: 'Send Priya the Q3 one-pager',
    when: 'by Friday',
    status: 'gathered',
    done: false,
    noteKind: 'wait',
    note: 'Waiting on the final numbers before I draft.',
    ctx: ['m_q3_mail', 'm_q3_pdf', 'm_q3_note'],
    pinned: [],
    draft: null,
    draftNote: null,
    brief:
      "I've pulled Priya's ask, your Q3 draft, and the rough takeaways. I held off writing the one-pager until the final retention numbers land."
  },
  {
    id: 't_dinner',
    title: "Book mom's birthday dinner",
    when: 'this week',
    status: 'gathered',
    done: false,
    noteKind: 'ask',
    note: 'One open question — which night works?',
    ctx: ['m_rest_note', 'm_rest_shot', 'm_mom_pic', 'm_gift_voice'],
    pinned: [],
    draft: null,
    draftNote: null,
    brief:
      "I found the spots your mom likes and a screenshot showing T'alula's had Saturday tables. One thing I can't answer for you: **which night works?**"
  }
]

// ── the daily-planning backlog ───────────────────────────────────────────────
const BACKLOG: BacklogItem[] = [
  {
    id: 'b_dentist',
    title: 'Book the overdue dentist cleaning',
    ctx: [],
    hint: 'Dr. Okafor texts to confirm'
  },
  {
    id: 'b_flight',
    title: 'Use the United travel credit before Jun 30',
    ctx: [],
    hint: '$214, expiring'
  },
  { id: 'b_book', title: 'Pick the next book club book', ctx: [], hint: "We're on the Le Guin" }
]

// ── recently-fed items for the Feed view ────────────────────────────────────
const FED_RECENT: FedItem[] = [
  {
    id: 'f1',
    kind: 'screenshot',
    title: "T'alula's — reservations",
    when: 'Yesterday · 9:14 PM',
    status: 'done'
  },
  {
    id: 'f2',
    kind: 'voice',
    title: 'voice memo — gift ideas',
    when: 'Apr 2 · 0:41',
    status: 'done'
  },
  { id: 'f3', kind: 'pdf', title: 'Q3-wrap-draft.pdf', when: 'Apr 1 · 11 pages', status: 'done' },
  {
    id: 'f4',
    kind: 'photo',
    title: 'Whiteboard from standup',
    when: 'Mar 30 · 2 photos',
    status: 'pending'
  }
]

// ── to-dos Mikan infers from the recent feed (AI-gap; real backend gates on a key) ──
const UNCOVERED: UncoveredTodo[] = [
  {
    id: 'unc_dentist',
    title: 'Book the overdue dentist cleaning',
    why: 'Last visit was November — Dr. Okafor texts to confirm.',
    conf: 0.82,
    ctxN: 1,
    ctx: ['m_dentist']
  },
  {
    id: 'unc_flight',
    title: 'Use the $214 United credit before Jun 30',
    why: 'Travel credit on file expires end of month.',
    conf: 0.71,
    ctxN: 1,
    ctx: ['m_flight']
  }
]

// ── matcher: rank archive memories for an arbitrary typed task ───────────────
const KEYS: Record<string, string> = {
  m_cabin_note: 'sarah cabin weekend trip hike boots dates april',
  m_cabin_mail: 'sarah cabin weekend email reply book place',
  m_cabin_cal: 'calendar weekend free april dana schedule',
  m_cabin_pic: 'cabin lake photo trip spring norris',
  m_q3_pdf: 'q3 wrap report deck revenue churn retention slides priya work',
  m_q3_mail: 'priya q3 wrap one-pager board friday email work send',
  m_q3_note: 'q3 takeaways retention pipeline support work notes',
  m_rest_note: 'mom birthday dinner restaurant reservation patio bria ramen book',
  m_rest_shot: 'talula reservation opentable saturday screenshot dinner book',
  m_mom_pic: 'mom birthday photo family dinner',
  m_gift_voice: 'mom gift pottery gardening gloves birthday voice idea',
  m_dentist: 'dentist appointment cleaning okafor health follow up morning',
  m_flight: 'flight travel credit united trip book expires',
  m_bookclub: 'book club pick le guin reading tuesday',
  m_article: 'mornings focus reading anchor task work'
}

function matchTask(text: string): MatchHit[] {
  const q = (text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)
  const scored = Object.keys(KEYS)
    .filter((id) => MEMORIES[id]) // only rank memories still in the archive
    .map((id) => {
      let s = 0
      for (const w of q) if (KEYS[id].includes(w)) s += 1
      return { id, s: s + Math.random() * 0.4 }
    })
    .sort((a, b) => b.s - a.s)
  const hits = scored.filter((x) => x.s >= 1)
  const chosen = (hits.length ? hits : scored).slice(0, Math.max(3, Math.min(4, hits.length || 3)))
  return chosen.map((x, i) => ({ id: x.id, rel: Math.max(0.5, 0.92 - i * 0.13) }))
}

// ── the mock window.api: shared mutable state behind the real surface ────────
export function makeMockApi(): MockApi {
  let tasks: Task[] = SEED_TASKS.map((t) => ({ ...t, relMap: REL[t.id] ?? {} }))
  let backlog: BacklogItem[] = BACKLOG.map((b) => ({ ...b }))
  let feed: FedItem[] = FED_RECENT.map((f) => ({ ...f }))

  let _seq = 0
  const uid = (prefix: string): string => prefix + (++_seq).toString(36) + Date.now().toString(36)
  const find = (id: string): Task | undefined => tasks.find((t) => t.id === id)
  const clone = (t: Task): Task => ({ ...t, ctx: [...t.ctx], pinned: [...t.pinned] })

  return {
    pipeline: {
      captureText: async (text: string, name?: string): Promise<CaptureResult> => {
        const id = uid('m_')
        const title = name || text.trim().slice(0, 40) || 'Quick note'
        const memory: Memory = {
          id,
          kind: 'note',
          title,
          snip: text.trim().slice(0, 140),
          src: name || 'Quick note',
          when: 'Just now'
        }
        MEMORIES[id] = memory
        feed = [{ id: uid('f_'), kind: 'note', title, when: 'Just now', status: 'done' }, ...feed]
        return { memory: { ...memory }, created: true }
      },
      captureFile: async (
        _bytes: Uint8Array,
        name: string,
        mime?: string
      ): Promise<CaptureResult> => {
        const id = uid('m_')
        const ext =
          name.lastIndexOf('.') >= 0 ? name.slice(name.lastIndexOf('.')).toLowerCase() : ''
        const kind: MemoryKind =
          ext === '.pdf' || mime === 'application/pdf'
            ? 'pdf'
            : mime?.startsWith('image/') ||
                ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic'].includes(ext)
              ? 'photo'
              : mime?.startsWith('audio/') || ['.m4a', '.mp3', '.wav', '.opus'].includes(ext)
                ? 'voice'
                : ['.txt', '.md', '.csv', '.json'].includes(ext) || mime?.startsWith('text/')
                  ? 'txt'
                  : 'doc'
        const isTextLike = kind === 'txt' || kind === 'doc'
        const memory: Memory = {
          id,
          kind,
          title: name,
          snip: '',
          src: name,
          when: 'Just now'
        }
        MEMORIES[id] = memory
        feed = [
          {
            id: uid('f_'),
            kind,
            title: name,
            when: 'Just now',
            status: isTextLike ? 'done' : 'pending'
          },
          ...feed
        ]
        return { memory: { ...memory }, created: true }
      },
      archive: async (): Promise<Memory[]> => Object.values(MEMORIES).map((m) => ({ ...m })),
      feed: async (): Promise<FedItem[]> => feed.map((f) => ({ ...f })),
      uncoverTodos: async (): Promise<UncoveredTodo[]> =>
        UNCOVERED.filter((t) => (t.ctx ?? []).every((id) => MEMORIES[id])).map((t) => ({ ...t })),
      search: async (query: string, topK?: number): Promise<MatchHit[]> => {
        const hits = matchTask(query)
        return topK ? hits.slice(0, topK) : hits
      }
    },
    todos: {
      add: async (title: string, notes?: string): Promise<Task> => {
        if (tasks.length >= CAP) throw new Error(CAP_REACHED)
        // Mirror surfaceContext: run the in-memory matcher so add in the browser
        // preview populates ctx the same way the real worker does.
        const query = notes ? `${title}\n${notes}` : title
        const hits = matchTask(query)
        const ctxIds = hits.map((h) => h.id)
        const relMap: Record<string, number> = {}
        for (const h of hits) relMap[h.id] = h.rel
        const n = ctxIds.length
        const task: Task = {
          id: uid('t_'),
          title,
          when: 'today',
          status: 'gathered',
          done: false,
          ctx: ctxIds,
          pinned: [],
          draft: null,
          draftNote: null,
          note: n
            ? `I kept ${n} thing${n === 1 ? '' : 's'} nearby for when you start it.`
            : (notes ?? null),
          noteKind: 'gathered',
          relMap,
          fresh: true
        }
        tasks = [...tasks, task]
        return clone(task)
      },
      today: async (): Promise<Task[]> => tasks.map(clone),
      backlog: async (): Promise<BacklogItem[]> => backlog.map((b) => ({ ...b })),
      done: async (): Promise<Todo[]> => [],
      complete: async (id: string): Promise<Task | null> => {
        const t = find(id)
        if (!t) return null
        t.done = true
        t.status = 'done'
        return clone(t)
      },
      reopen: async (id: string): Promise<Task | null> => {
        const t = find(id)
        if (!t) return null
        t.done = false
        t.status = 'gathered'
        return clone(t)
      },
      plan: async (keep: string[]): Promise<Task[]> => {
        const keepSet = new Set(keep)
        // sweep non-kept OPEN tasks back to the backlog
        const swept = tasks.filter((t) => !keepSet.has(t.id) && !t.done)
        backlog = [
          ...swept.map((t) => ({
            id: uid('b_'),
            title: t.title,
            hint: '',
            ctx: [...t.ctx],
            conf: null
          })),
          ...backlog
        ]
        tasks = tasks.filter((t) => keepSet.has(t.id)).map((t) => ({ ...t, fresh: false }))
        return tasks.map(clone)
      },
      schedule: async (id: string): Promise<Task | null> => {
        const b = backlog.find((x) => x.id === id)
        if (!b) return null
        if (tasks.length >= CAP) throw new Error(CAP_REACHED)
        backlog = backlog.filter((x) => x.id !== id)
        const n = b.ctx?.length ?? 0
        const task: Task = {
          id: uid('t_'),
          title: b.title,
          when: 'today',
          status: 'gathered',
          done: false,
          ctx: [...(b.ctx ?? [])],
          pinned: [],
          draft: null,
          draftNote: null,
          note: n ? `Kept ${n} thing${n === 1 ? '' : 's'} for you.` : null,
          noteKind: 'gathered',
          relMap: {},
          fresh: true
        }
        tasks = [...tasks, task]
        return clone(task)
      },
      searchMoreContext: async (id: string): Promise<Task | null> => {
        const t = find(id)
        if (!t) return null
        // Mirror surfaceContext: merge additional hits into the task's ctx pool.
        const extra = matchTask(t.title)
          .map((h) => h.id)
          .filter((id) => !t.ctx.includes(id))
        t.ctx = [...t.ctx, ...extra]
        for (const h of matchTask(t.title)) {
          if (extra.includes(h.id)) t.relMap = { ...t.relMap, [h.id]: h.rel }
        }
        return clone(t)
      },
      pinContext: async (id: string, itemId: string): Promise<Task | null> => {
        const t = find(id)
        if (!t) return null
        if (!t.ctx.includes(itemId)) t.ctx = [...t.ctx, itemId]
        if (!t.pinned.includes(itemId)) t.pinned = [...t.pinned, itemId]
        return clone(t)
      },
      dismissContext: async (id: string, itemId: string): Promise<Task | null> => {
        const t = find(id)
        if (!t) return null
        t.ctx = t.ctx.filter((x) => x !== itemId)
        t.pinned = t.pinned.filter((x) => x !== itemId)
        return clone(t)
      }
    },
    ui: {
      setBadge: async (): Promise<void> => {}
    },
    update: {
      getStatus: async () => ({
        stage: 'idle' as const,
        version: null,
        progress: null,
        error: null
      }),
      quitAndInstall: async (): Promise<void> => {},
      checkNow: async (): Promise<void> => {},
      onChanged: () => () => {}
    }
  }
}
