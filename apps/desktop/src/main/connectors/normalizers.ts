/**
 * Pure normalization helpers for Gmail messages and Google Calendar events.
 * Extracted here so they can be unit-tested without a DB or network.
 * Imported by connector-service.ts.
 */

// ── Gmail ───────────────────────────────────────────────────────────────────

export interface GmailMessage {
  id: string
  threadId?: string
  payload?: GmailPayload
  snippet?: string
  internalDate?: string
}

export interface GmailPayload {
  mimeType?: string
  headers?: Array<{ name: string; value: string }>
  body?: { data?: string }
  parts?: GmailPayload[]
}

/** Extract the best plain-text body from a Gmail message payload (recursive). */
export function extractGmailText(payload: GmailPayload): string {
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf8')
  }
  if (payload.parts) {
    // Prefer text/plain, fall back to text/html → strip tags.
    const plain = payload.parts.find((p) => p.mimeType === 'text/plain')
    if (plain) return extractGmailText(plain)
    const html = payload.parts.find((p) => p.mimeType === 'text/html')
    if (html) return extractGmailText(html)
    // Recurse into multipart containers.
    for (const part of payload.parts) {
      const text = extractGmailText(part)
      if (text) return text
    }
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    const html = Buffer.from(payload.body.data, 'base64url').toString('utf8')
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  return ''
}

export function gmailHeader(payload: GmailPayload, name: string): string {
  return payload.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

/** Compose a human-readable title for a Gmail message. */
export function gmailTitle(msg: GmailMessage): string {
  if (!msg.payload) return `Gmail message ${msg.id}`
  const subject = gmailHeader(msg.payload, 'Subject') || '(no subject)'
  const from = gmailHeader(msg.payload, 'From') || ''
  return from ? `${subject} — from ${from}` : subject
}

/** Build the full text representation of a Gmail message. */
export function gmailToText(msg: GmailMessage): string {
  if (!msg.payload) return msg.snippet ?? ''
  const subject = gmailHeader(msg.payload, 'Subject')
  const from = gmailHeader(msg.payload, 'From')
  const to = gmailHeader(msg.payload, 'To')
  const date = gmailHeader(msg.payload, 'Date')
  const body = extractGmailText(msg.payload) || msg.snippet || ''
  return [subject && `Subject: ${subject}`, from && `From: ${from}`, to && `To: ${to}`, date && `Date: ${date}`, '', body]
    .filter((l) => l !== undefined)
    .join('\n')
    .trim()
}

// ── Calendar ─────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string
  summary?: string
  description?: string
  location?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  organizer?: { email?: string; displayName?: string }
  attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string }>
  htmlLink?: string
  status?: string
}

/** Build a plain-text representation of a Calendar event. */
export function calendarToText(event: CalendarEvent): string {
  const lines: string[] = []
  if (event.summary) lines.push(`Event: ${event.summary}`)
  const start = event.start?.dateTime ?? event.start?.date ?? ''
  const end = event.end?.dateTime ?? event.end?.date ?? ''
  if (start) lines.push(`Start: ${start}`)
  if (end) lines.push(`End: ${end}`)
  if (event.location) lines.push(`Location: ${event.location}`)
  if (event.organizer?.displayName || event.organizer?.email) {
    lines.push(`Organizer: ${event.organizer.displayName ?? event.organizer.email}`)
  }
  if (event.attendees?.length) {
    const names = event.attendees
      .map((a) => a.displayName ?? a.email ?? '')
      .filter(Boolean)
      .slice(0, 10)
      .join(', ')
    lines.push(`Attendees: ${names}`)
  }
  if (event.description) {
    lines.push('', event.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
  }
  return lines.join('\n').trim()
}
