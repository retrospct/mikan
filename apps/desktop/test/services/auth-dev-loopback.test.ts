/**
 * Unit tests for the dev-only OAuth loopback listener (src/main/auth/dev-loopback.ts).
 *
 * Tier A: plain Node, real loopback sockets on a fixed test port (no Electron).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { get } from 'node:http'
import {
  startDevCallbackServer,
  type DevCallbackServerHandle
} from '../../src/main/auth/dev-loopback'

const PORT = 51799

function fetchText(path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    get(`http://127.0.0.1:${PORT}${path}`, { agent: false }, (res) => {
      let body = ''
      res.on('data', (chunk: Buffer) => (body += chunk.toString()))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    }).on('error', reject)
  })
}

let handle: DevCallbackServerHandle | null = null

afterEach(() => {
  handle?.close()
  handle = null
})

describe('startDevCallbackServer', () => {
  it('forwards the full callback URL to onCallback and closes after one request', async () => {
    const received: string[] = []
    handle = await startDevCallbackServer({
      port: PORT,
      onCallback: (url) => received.push(url)
    })

    const { status, body } = await fetchText('/callback?code=abc&state=xyz')
    expect(status).toBe(200)
    expect(body).toContain('Signed in')
    expect(received).toEqual([`http://127.0.0.1:${PORT}/callback?code=abc&state=xyz`])

    // one-shot: the server closed itself after handling the request above
    await expect(fetchText('/callback?code=abc2')).rejects.toThrow()
  })

  it('serves a cancelled page and still forwards the URL when the callback carries ?error', async () => {
    let received = ''
    handle = await startDevCallbackServer({
      port: PORT,
      onCallback: (url) => (received = url)
    })

    const { body } = await fetchText('/callback?error=access_denied&state=xyz')
    expect(body).toContain('cancelled')
    expect(received).toContain('error=access_denied')
  })

  it('a fresh start replaces a still-open listener from a prior flow', async () => {
    await startDevCallbackServer({ port: PORT, onCallback: () => {} })
    // A second flow before the first completes must close the first server —
    // otherwise this rebind on the same port would reject with EADDRINUSE.
    handle = await startDevCallbackServer({ port: PORT, onCallback: () => {} })
  })

  it('closes the server and fires onTimeout when nothing arrives in time', async () => {
    let timedOut = false
    handle = await startDevCallbackServer({
      port: PORT,
      onCallback: () => {},
      onTimeout: () => {
        timedOut = true
      },
      timeoutMs: 20
    })

    await new Promise((r) => setTimeout(r, 60))
    expect(timedOut).toBe(true)
    await expect(fetchText('/callback')).rejects.toThrow()
  })
})
