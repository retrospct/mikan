/**
 * Dev-only OAuth loopback callback listener (RFC 8252 native-app pattern).
 *
 * In `pnpm dev` on macOS, the `<scheme>://callback` deep link resolves to a
 * freshly-launched vanilla Electron.app instead of the already-running dev
 * instance — Launch Services registers the bare dev binary as the scheme
 * handler, and the dev process never receives the `open-url` event (see the
 * dev-loopback amendment in docs/adr/0002-authentication.md). A loopback
 * redirect sidesteps this: the browser hits an HTTP server the dev process
 * is already listening on, so no app hand-off is needed. Packaged builds
 * don't use this — see `currentRedirectUri()` in ./logto.ts.
 *
 * Modeled on the connectors/google-auth.ts loopback server, which uses a
 * random OS-assigned port. This one takes a caller-supplied port because the
 * redirect_uri must be pre-registered in the Logto console ahead of time.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export const DEV_LOOPBACK_PORT = Number(import.meta.env.MAIN_VITE_LOGTO_DEV_PORT ?? 51703)

const SUCCESS_PAGE =
  '<html><head><meta charset="utf-8"></head><body>' +
  '<h2>Signed in &#8212; you can return to Mikan.</h2></body></html>'
const CANCELLED_PAGE =
  '<html><head><meta charset="utf-8"></head><body>' +
  '<h2>Sign-in cancelled &#8212; you can return to Mikan.</h2></body></html>'

export interface DevCallbackServerOptions {
  /** Fixed port to bind (must match the redirect_uri registered with the provider). */
  port: number
  /** Called once with the full callback URL when the browser hits GET /callback. */
  onCallback: (fullUrl: string) => void
  /** Called if no callback arrives within `timeoutMs`. The server is already closed by then. */
  onTimeout?: () => void
  /** Default 5 minutes — matches the connectors/google-auth.ts loopback timeout. */
  timeoutMs?: number
}

export interface DevCallbackServerHandle {
  close: () => void
}

interface ActiveServer {
  server: Server
  timer: NodeJS.Timeout
}

// One flow at a time. A fresh login click supersedes any listener still open
// from a prior click — the newest attempt wins, matching `pending` in logto.ts.
let active: ActiveServer | null = null

function closeActive(): void {
  if (!active) return
  clearTimeout(active.timer)
  active.server.close()
  active = null
}

/** Start a one-shot loopback listener for the OAuth callback. Closes itself after use. */
export function startDevCallbackServer(
  opts: DevCallbackServerOptions
): Promise<DevCallbackServerHandle> {
  closeActive()

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (active?.server !== server) return // superseded by a newer flow; ignore
      if (!req.url || !req.url.startsWith('/callback')) {
        res.writeHead(404)
        res.end('Not found')
        return
      }
      const port = (server.address() as AddressInfo).port
      const fullUrl = `http://127.0.0.1:${port}${req.url}`
      const isError = new URL(fullUrl).searchParams.has('error')

      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(isError ? CANCELLED_PAGE : SUCCESS_PAGE)

      closeActive()
      opts.onCallback(fullUrl)
    })

    const timer = setTimeout(
      () => {
        closeActive()
        opts.onTimeout?.()
      },
      opts.timeoutMs ?? 5 * 60 * 1000
    )
    timer.unref()

    server.once('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      reject(
        err.code === 'EADDRINUSE'
          ? new Error(
              `Port ${opts.port} is already in use — close the conflicting app or set ` +
                'MAIN_VITE_LOGTO_DEV_PORT to a free port (and register it in the Logto console).'
            )
          : err
      )
    })

    server.listen(opts.port, '127.0.0.1', () => {
      active = { server, timer }
      resolve({ close: closeActive })
    })
  })
}
