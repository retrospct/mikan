/**
 * Local dev server — wraps the same handler Vercel runs in production.
 * Run with: pnpm dev (tsx watch src/index.ts)
 *
 * Production uses api/token.ts directly as a Vercel Serverless Function; this
 * file only exists so you can curl the broker locally. It deliberately reuses
 * the pure handleRequest() core so dev and prod behave identically.
 */
import { createServer } from 'node:http'
import { handleRequest, REQUIRED_ENV } from '../api/token'

const missing = REQUIRED_ENV.filter((k) => !process.env[k])
if (missing.length > 0) {
  console.warn(`[broker] Warning: missing env vars: ${missing.join(', ')}`)
  console.warn('[broker] /token will error; /health will report 503')
}

const port = parseInt(process.env.PORT ?? '3100', 10)

const server = createServer(async (req, res) => {
  const method = req.method ?? 'GET'
  const pathname = (req.url ?? '/').split('?')[0]
  const authHeader = (req.headers['authorization'] as string | undefined) ?? null

  const { status, body } = await handleRequest(method, pathname, authHeader)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
})

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[broker] Port ${port} is already in use — another dev/broker instance is ` +
        `still running. Stop it (e.g. \`lsof -ti :${port} | xargs kill\`) or set PORT.`
    )
    process.exit(1)
  }
  throw err
})

server.listen(port, () => {
  console.log(`[broker] Listening on http://localhost:${port}`)
})
