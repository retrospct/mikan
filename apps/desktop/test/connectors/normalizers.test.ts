/**
 * Unit tests for Gmail + Calendar normalization helpers.
 * Pure functions — no DB, no network, no Electron.
 */
import { describe, it, expect } from 'vitest'
import {
  extractGmailText,
  gmailToText,
  gmailTitle,
  calendarToText,
  type GmailMessage,
  type GmailPayload,
  type CalendarEvent
} from '../../src/main/connectors/normalizers'

// ── extractGmailText ──────────────────────────────────────────────────────────

describe('extractGmailText', () => {
  function b64(text: string): string {
    return Buffer.from(text).toString('base64url')
  }

  it('decodes a top-level text/plain part', () => {
    const payload: GmailPayload = {
      mimeType: 'text/plain',
      body: { data: b64('Hello from Gmail') }
    }
    expect(extractGmailText(payload)).toBe('Hello from Gmail')
  })

  it('strips HTML tags from a top-level text/html part', () => {
    const payload: GmailPayload = {
      mimeType: 'text/html',
      body: { data: b64('<p>Hello <b>world</b></p>') }
    }
    expect(extractGmailText(payload)).toBe('Hello world')
  })

  it('prefers text/plain over text/html in multipart', () => {
    const payload: GmailPayload = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/html', body: { data: b64('<p>HTML version</p>') } },
        { mimeType: 'text/plain', body: { data: b64('Plain version') } }
      ]
    }
    expect(extractGmailText(payload)).toBe('Plain version')
  })

  it('falls back to text/html when no text/plain in multipart', () => {
    const payload: GmailPayload = {
      mimeType: 'multipart/alternative',
      parts: [{ mimeType: 'text/html', body: { data: b64('<b>HTML only</b>') } }]
    }
    expect(extractGmailText(payload)).toBe('HTML only')
  })

  it('recurses into nested multipart containers', () => {
    const payload: GmailPayload = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [{ mimeType: 'text/plain', body: { data: b64('Nested plain text') } }]
        }
      ]
    }
    expect(extractGmailText(payload)).toBe('Nested plain text')
  })

  it('returns empty string for an empty payload', () => {
    expect(extractGmailText({})).toBe('')
  })

  it('returns empty string when body has no data', () => {
    expect(extractGmailText({ mimeType: 'text/plain', body: {} })).toBe('')
  })
})

// ── gmailTitle ────────────────────────────────────────────────────────────────

describe('gmailTitle', () => {
  function makeMsg(subject?: string, from?: string): GmailMessage {
    const headers: Array<{ name: string; value: string }> = []
    if (subject) headers.push({ name: 'Subject', value: subject })
    if (from) headers.push({ name: 'From', value: from })
    return { id: 'msg1', payload: { headers } }
  }

  it('formats as "subject — from sender" when both are present', () => {
    expect(gmailTitle(makeMsg('Hello', 'alice@example.com'))).toBe(
      'Hello — from alice@example.com'
    )
  })

  it('returns just the subject when From is missing', () => {
    expect(gmailTitle(makeMsg('Just a subject'))).toBe('Just a subject')
  })

  it('uses "(no subject)" when Subject header is absent', () => {
    expect(gmailTitle(makeMsg(undefined, 'bob@example.com'))).toBe(
      '(no subject) — from bob@example.com'
    )
  })

  it('falls back to "Gmail message <id>" when payload is absent', () => {
    expect(gmailTitle({ id: 'abc123' })).toBe('Gmail message abc123')
  })
})

// ── gmailToText ───────────────────────────────────────────────────────────────

describe('gmailToText', () => {
  it('includes Subject / From / To / Date headers and body', () => {
    const msg: GmailMessage = {
      id: 'msg1',
      payload: {
        mimeType: 'text/plain',
        headers: [
          { name: 'Subject', value: 'Meeting notes' },
          { name: 'From', value: 'alice@example.com' },
          { name: 'To', value: 'bob@example.com' },
          { name: 'Date', value: 'Mon, 1 Jun 2026' }
        ],
        body: { data: Buffer.from('Body text here').toString('base64url') }
      }
    }
    const text = gmailToText(msg)
    expect(text).toContain('Subject: Meeting notes')
    expect(text).toContain('From: alice@example.com')
    expect(text).toContain('To: bob@example.com')
    expect(text).toContain('Date: Mon, 1 Jun 2026')
    expect(text).toContain('Body text here')
  })

  it('omits missing headers from the output', () => {
    const msg: GmailMessage = {
      id: 'msg1',
      payload: {
        mimeType: 'text/plain',
        headers: [{ name: 'Subject', value: 'Sparse email' }],
        body: { data: Buffer.from('sparse body').toString('base64url') }
      }
    }
    const text = gmailToText(msg)
    expect(text).not.toContain('From:')
    expect(text).not.toContain('To:')
    expect(text).toContain('Subject: Sparse email')
  })

  it('falls back to snippet when payload is absent', () => {
    const msg: GmailMessage = { id: 'msg1', snippet: 'Preview snippet text' }
    expect(gmailToText(msg)).toBe('Preview snippet text')
  })

  it('uses snippet as body when payload has no text part', () => {
    const msg: GmailMessage = {
      id: 'msg1',
      snippet: 'fallback snippet',
      payload: { mimeType: 'multipart/mixed', parts: [] }
    }
    const text = gmailToText(msg)
    expect(text).toContain('fallback snippet')
  })
})

// ── calendarToText ────────────────────────────────────────────────────────────

describe('calendarToText', () => {
  it('renders all core fields', () => {
    const event: CalendarEvent = {
      id: 'evt1',
      summary: 'Team standup',
      start: { dateTime: '2026-06-01T09:00:00Z' },
      end: { dateTime: '2026-06-01T09:30:00Z' },
      location: 'Zoom',
      organizer: { displayName: 'Alice', email: 'alice@example.com' }
    }
    const text = calendarToText(event)
    expect(text).toContain('Event: Team standup')
    expect(text).toContain('Start: 2026-06-01T09:00:00Z')
    expect(text).toContain('End: 2026-06-01T09:30:00Z')
    expect(text).toContain('Location: Zoom')
    expect(text).toContain('Organizer: Alice')
  })

  it('falls back to organizer email when displayName is absent', () => {
    const event: CalendarEvent = {
      id: 'evt1',
      summary: 'Meeting',
      organizer: { email: 'org@example.com' }
    }
    expect(calendarToText(event)).toContain('Organizer: org@example.com')
  })

  it('renders up to 10 attendees by displayName', () => {
    const attendees = Array.from({ length: 12 }, (_, i) => ({
      displayName: `Person ${i + 1}`,
      email: `p${i + 1}@example.com`
    }))
    const text = calendarToText({ id: 'evt1', summary: 'Big meeting', attendees })
    expect(text).toContain('Person 1')
    expect(text).toContain('Person 10')
    // 11th and 12th are truncated
    expect(text).not.toContain('Person 11')
  })

  it('falls back to email when attendee displayName is absent', () => {
    const event: CalendarEvent = {
      id: 'evt1',
      summary: 'Mtg',
      attendees: [{ email: 'noname@example.com' }]
    }
    expect(calendarToText(event)).toContain('noname@example.com')
  })

  it('strips HTML tags from description', () => {
    const event: CalendarEvent = {
      id: 'evt1',
      summary: 'HTML desc',
      description: '<p>Agenda:<br/><b>1.</b> Review</p>'
    }
    const text = calendarToText(event)
    expect(text).not.toContain('<p>')
    expect(text).toContain('Agenda:')
    expect(text).toContain('1.')
    expect(text).toContain('Review')
  })

  it('uses all-day date when dateTime is absent', () => {
    const event: CalendarEvent = {
      id: 'evt1',
      summary: 'All-day',
      start: { date: '2026-06-15' },
      end: { date: '2026-06-16' }
    }
    const text = calendarToText(event)
    expect(text).toContain('Start: 2026-06-15')
    expect(text).toContain('End: 2026-06-16')
  })

  it('returns empty string for a minimal event with no renderable fields', () => {
    expect(calendarToText({ id: 'evt1' })).toBe('')
  })
})
