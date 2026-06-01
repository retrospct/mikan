// data.ts — sample archive, seed tasks, the matcher, and shared types.
//
// Ported verbatim from the design bundle (neeme-data.jsx + the BACKLOG that lived
// in neeme-plan.jsx). This is hand-authored placeholder content that gives the
// gather/draft flows a real, personal feel. Wiring these views to the backend API
// (or the parked local libSQL seam) is a separate decision — see src/renderer/src/App.tsx.

// ── shared types ────────────────────────────────────────────────────────────
export type MemoryKind =
  | 'note'
  | 'text'
  | 'pdf'
  | 'doc'
  | 'txt'
  | 'image'
  | 'photo'
  | 'screenshot'
  | 'voice'
  | 'audio'
  | 'video'
  | 'mp4'
  | 'zip'
  | 'email'
  | 'calendar'
  | 'event'
  | 'link'
  | 'web'

export interface Memory {
  id: string
  kind: MemoryKind
  title: string
  snip: string
  src: string
  when: string
}

export type TaskStatus = 'gathering' | 'gathered' | 'drafted' | 'done'
export type NoteKind = 'ready' | 'ask' | 'wait' | 'gathered' | 'done'

export interface Task {
  id: string
  title: string
  when: string
  status: TaskStatus
  done: boolean
  ctx: string[]
  pinned: string[]
  draft: string[] | null
  draftNote: string | null
  noteKind?: NoteKind
  note?: string | null
  relMap?: Record<string, number>
  fresh?: boolean
  // task-detail "brief" fields (the summary Neeme prepared) + draft metadata
  brief?: string
  draftFor?: string
  draftType?: string
  draftIcon?: string
  useLabel?: string
  useNote?: string
  useDone?: string
}

export interface BacklogItem {
  id: string
  title: string
  hint: string
  ctx: string[]
  conf?: number | null
  fresh?: boolean
}

export interface UncoveredTodo {
  id?: string
  title: string
  why: string
  conf: number
  ctxN: number
  ctx?: string[]
}

export interface FedItem {
  id: string
  kind: MemoryKind
  title: string
  when: string
  status: 'done' | 'pending'
}

// ── the memory archive (what you've "fed" Neeme) ────────────────────────────
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

// ── seed tasks for Today (cap 5 → 3 filled + 2 open slots) ──────────────────
export const SEED_TASKS: Task[] = [
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

// relevance score shown on each memory chip, derived deterministically per task
export const REL: Record<string, Record<string, number>> = {
  t_cabin: { m_cabin_note: 0.95, m_cabin_mail: 0.9, m_cabin_cal: 0.82, m_cabin_pic: 0.55 },
  t_q3: { m_q3_mail: 0.93, m_q3_pdf: 0.88, m_q3_note: 0.78 },
  t_dinner: { m_rest_note: 0.9, m_rest_shot: 0.74, m_mom_pic: 0.52, m_gift_voice: 0.6 }
}
export const relOf = (taskId: string, memId: string): number =>
  (REL[taskId] && REL[taskId][memId]) || 0.5

// why Neeme kept each memory beside a task — a short reason in its voice
export const CTX_WHY: Record<string, Record<string, string>> = {
  t_cabin: {
    m_cabin_mail: "Her ask — this is what you're replying to",
    m_cabin_note: 'The two date options she floated',
    m_cabin_cal: "Confirms you're free Apr 18–20",
    m_cabin_pic: 'From the last trip — nice to reference'
  },
  t_q3: {
    m_q3_mail: "Priya's ask, with the Friday deadline",
    m_q3_pdf: 'Your draft — slide 4 still open',
    m_q3_note: 'The three takeaways to lead with'
  },
  t_dinner: {
    m_rest_note: 'The places your mom likes',
    m_rest_shot: "Live availability at T'alula's",
    m_mom_pic: "Last year's dinner, for the vibe",
    m_gift_voice: "Gift ideas, while you're at it"
  }
}
export const whyOf = (taskId: string, memId: string): string | null =>
  (CTX_WHY[taskId] && CTX_WHY[taskId][memId]) || null

// ── suggestions on the compose sheet ────────────────────────────────────────
export const TASK_SUGGESTIONS = [
  'Draft a thank-you to Grandma',
  "Plan Saturday's grocery run",
  'Pick the book club book',
  'Follow up on the dentist appt'
]

// ── recently-fed items for the Feed view ────────────────────────────────────
export const FED_RECENT: FedItem[] = [
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

// ── the daily-planning backlog ───────────────────────────────────────────────
export const BACKLOG: BacklogItem[] = [
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

export interface MatchHit {
  id: string
  rel: number
}

export function matchTask(text: string): MatchHit[] {
  const q = (text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)
  const scored = Object.keys(KEYS)
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

// ── candidate to-dos Neeme uncovers while indexing fed content ──────────────
// Each fed item surfaces 1–2 of these, ranked by confidence.
export const UNCOVERED_TODOS: UncoveredTodo[] = [
  {
    title: 'Reply to Sarah with a cabin date',
    why: "She's waiting on which weekend works",
    conf: 0.88,
    ctxN: 3
  },
  {
    title: 'Add the retention chart to the Q3 deck',
    why: 'Slide 4 is still marked TODO',
    conf: 0.81,
    ctxN: 2
  },
  {
    title: "Reserve a table for mom's birthday",
    why: "T'alula's showed two open Saturday slots",
    conf: 0.76,
    ctxN: 3
  },
  {
    title: 'Confirm the dentist cleaning',
    why: 'Overdue since November — they text to confirm',
    conf: 0.7,
    ctxN: 1
  },
  { title: 'Use the United travel credit', why: '$214 expires Jun 30', conf: 0.66, ctxN: 1 },
  {
    title: 'Pick the next book club book',
    why: "Group's been waiting on the Le Guin",
    conf: 0.58,
    ctxN: 1
  }
]
// a believable transcript so the voice recorder's "stop" lands you somewhere real to edit
const VOICE_TRANSCRIPTS = [
  "Remind me that Sarah's free either weekend for the cabin — she just needs a date to book it.",
  'Mom mentioned that pottery class again, and her gardening gloves are basically done. Gift ideas.',
  "For the Q3 wrap: retention's finally turning, enterprise pipeline tripled, support load down after the docs revamp.",
  'Book club is on the Le Guin, second Tuesday at Reyna’s. Don’t forget to actually finish it this time.'
]
let _vtIdx = 0
export function nextTranscript(): string {
  const t = VOICE_TRANSCRIPTS[_vtIdx % VOICE_TRANSCRIPTS.length]
  _vtIdx++
  return t
}

let _uncIdx = 0
export function uncoverTodos(): UncoveredTodo[] {
  // rotate through the pool so repeat feeds feel alive; surface 1–2
  const n = 1 + (Math.random() < 0.55 ? 1 : 0)
  const out: UncoveredTodo[] = []
  for (let i = 0; i < n; i++) {
    out.push(UNCOVERED_TODOS[_uncIdx % UNCOVERED_TODOS.length])
    _uncIdx++
  }
  return out.map((t, i) => ({ ...t, id: 'u_' + Date.now() + '_' + i }))
}
