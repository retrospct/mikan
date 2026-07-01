// ui-stubs.ts — UI affordances with no backend yet (AI-gap), used in BOTH the
// Electron and browser-preview paths. These are deliberately not part of the
// `window.api` contract: static suggestion chips, the inferred-todo seam (which
// the backend returns as `[]` until the inference layer lands — see
// docs/INTEGRATION.md), and a voice-transcript stub that gives the recorder
// something real to land on until on-device transcription exists.
import type { UncoveredTodo } from '@mikan/contract/views'

// suggestion chips on the compose sheet
export const TASK_SUGGESTIONS = [
  'Draft a thank-you to Grandma',
  "Plan Saturday's grocery run",
  'Pick the book club book',
  'Follow up on the dentist appt'
]

// suggestion chips in the global "dig deeper" search overlay
export const SEARCH_SUGGEST = [
  'cabin weekend',
  "mom's birthday",
  'Q3 numbers',
  'dentist',
  'book club'
]

// Feed-inferred to-dos are AI-gap: the backend emits none yet, so the UI treats
// the result as empty. The "While reading, I spotted a few to-dos" section hides
// itself when this is `[]`.
export function uncoverTodos(): UncoveredTodo[] {
  return []
}

// A believable transcript so the voice recorder's "stop" lands you somewhere real
// to edit. Stays until real on-device transcription lands.
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
