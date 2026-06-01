/**
 * Connector sync engine — runs in the utilityProcess worker.
 *
 * Given `{ provider, accessToken }` (main passes a fresh token via IPC), this
 * service fetches delta messages/events from the Google APIs, normalises each to
 * plain text, calls `pipelineService.captureExternal`, and persists the new
 * sync cursor. Returns `{ ingested, lastSyncAt }` for main to broadcast.
 *
 * API docs:
 *   Gmail:    https://developers.google.com/gmail/api/reference/rest
 *   Calendar: https://developers.google.com/calendar/api/v3/reference/events/list
 *
 * Sync strategy:
 *   Gmail:    historyId cursor (incremental via users.history.list). On first run
 *             or expired cursor → full inbox list (INBOX, newest 200).
 *   Calendar: syncToken cursor (incremental via events.list?syncToken=…). On first
 *             run or expired token (HTTP 410) → full events list.
 */
import { pipelineService, type ExternalProvenance } from './pipeline-service'
import type { ConnectorId, IngestResult } from '@nimi/contract/ipc'
import {
  gmailToText,
  gmailTitle,
  calendarToText,
  type GmailMessage,
  type CalendarEvent
} from '../connectors/normalizers'

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary'

// ── Google API fetch helper ─────────────────────────────────────────────────

async function gFetch<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const err = new Error(`Google API error ${res.status}: ${body.slice(0, 200)}`) as Error & { status: number }
    err.status = res.status
    throw err
  }
  return res.json() as Promise<T>
}

// ── Gmail sync ──────────────────────────────────────────────────────────────

async function syncGmail(accessToken: string): Promise<number> {
  const cursor = await pipelineService.getConnectorCursor('gmail')
  let messageIds: string[] = []

  if (cursor) {
    // Incremental: fetch message ids added since the stored historyId.
    try {
      const historyRes = await gFetch<{ history?: Array<{ messagesAdded?: Array<{ message: { id: string } }> }>; historyId?: string }>(
        `${GMAIL_BASE}/history?startHistoryId=${encodeURIComponent(cursor)}&historyTypes=messageAdded&labelId=INBOX`,
        accessToken
      )
      const added = historyRes.history?.flatMap((h) => h.messagesAdded?.map((m) => m.message.id) ?? []) ?? []
      messageIds = added
      // Update cursor to the latest historyId even if there are no new messages.
      if (historyRes.historyId) {
        await pipelineService.setConnectorCursor('gmail', historyRes.historyId, 0)
      }
    } catch (err: unknown) {
      const status = (err as { status?: number }).status
      if (status === 404) {
        // historyId expired — fall through to full re-list.
        console.warn('[connectors:gmail] historyId expired, falling back to full list')
      } else {
        throw err
      }
    }
  }

  if (!cursor || messageIds.length === 0) {
    // Full list: grab the 200 most recent INBOX messages.
    const listRes = await gFetch<{ messages?: Array<{ id: string }>; historyId?: string }>(
      `${GMAIL_BASE}/messages?labelIds=INBOX&maxResults=200`,
      accessToken
    )
    messageIds = listRes.messages?.map((m) => m.id) ?? []
    if (listRes.historyId) {
      await pipelineService.setConnectorCursor('gmail', listRes.historyId, 0)
    }
  }

  let ingested = 0
  for (const msgId of messageIds) {
    try {
      const msg = await gFetch<GmailMessage>(
        `${GMAIL_BASE}/messages/${msgId}?format=full`,
        accessToken
      )
      const text = gmailToText(msg)
      if (!text.trim()) continue
      const name = gmailTitle(msg)
      const uri = `https://mail.google.com/mail/u/0/#inbox/${msg.id}`
      const provenance: ExternalProvenance = { connector: 'gmail', externalId: msg.id, uri }
      const result = await pipelineService.captureExternal(text, name, provenance)
      if (result.created) ingested++
    } catch (err) {
      console.warn(`[connectors:gmail] failed to fetch message ${msgId}`, err)
    }
  }

  if (ingested > 0) {
    // Increment item count for the UI.
    await pipelineService.setConnectorCursor(
      'gmail',
      await pipelineService.getConnectorCursor('gmail'),
      ingested
    )
  }
  return ingested
}

// ── Calendar sync ───────────────────────────────────────────────────────────

async function syncCalendar(accessToken: string): Promise<number> {
  const syncToken = await pipelineService.getConnectorCursor('gcal')
  let events: CalendarEvent[] = []
  let nextSyncToken: string | null = null

  const doFullList = async (): Promise<void> => {
    const url = `${CALENDAR_BASE}/events?singleEvents=true&orderBy=startTime&maxResults=500`
    const res = await gFetch<{ items?: CalendarEvent[]; nextSyncToken?: string }>(url, accessToken)
    events = res.items ?? []
    nextSyncToken = res.nextSyncToken ?? null
  }

  if (syncToken) {
    try {
      const url = `${CALENDAR_BASE}/events?syncToken=${encodeURIComponent(syncToken)}&singleEvents=true`
      const res = await gFetch<{ items?: CalendarEvent[]; nextSyncToken?: string }>(url, accessToken)
      events = res.items ?? []
      nextSyncToken = res.nextSyncToken ?? null
    } catch (err: unknown) {
      const status = (err as { status?: number }).status
      if (status === 410) {
        // syncToken expired — full re-list.
        console.warn('[connectors:gcal] syncToken expired, doing full list')
        await pipelineService.resetConnectorCursor('gcal')
        await doFullList()
      } else {
        throw err
      }
    }
  } else {
    await doFullList()
  }

  let ingested = 0
  for (const event of events) {
    if (!event.id || event.status === 'cancelled') continue
    const text = calendarToText(event)
    if (!text.trim()) continue
    const name = event.summary ?? `Calendar event ${event.id}`
    const uri = event.htmlLink ?? undefined
    const provenance: ExternalProvenance = { connector: 'gcal', externalId: event.id, uri }
    const result = await pipelineService.captureExternal(text, name, provenance)
    if (result.created) ingested++
  }

  if (nextSyncToken) {
    await pipelineService.setConnectorCursor('gcal', nextSyncToken, ingested)
  } else if (ingested > 0) {
    await pipelineService.setConnectorCursor('gcal', null, ingested)
  }

  return ingested
}

// ── Public service ──────────────────────────────────────────────────────────

export const connectorService = {
  /**
   * Run an incremental sync for the given provider using the supplied access token.
   * Returns the number of newly ingested items and the ISO timestamp of this sync.
   * Called by the worker handler (channel `connectors:ingest`).
   */
  async ingest(provider: ConnectorId, accessToken: string): Promise<IngestResult> {
    const ingested =
      provider === 'gmail'
        ? await syncGmail(accessToken)
        : await syncCalendar(accessToken)

    const lastSyncAt = new Date().toISOString()
    console.log(`[connectors:${provider}] ingested ${ingested} item(s)`)
    return { ingested, lastSyncAt }
  }
}
