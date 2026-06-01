import { join } from 'path'
import { app, utilityProcess, type UtilityProcess } from 'electron'

/**
 * Main-side handle to the data utilityProcess. Main stays a thin router: it forks
 * the worker (passing the userData dir via env, since the child has no
 * `electron.app`) and proxies each data IPC channel to it over a small id↔promise
 * RPC. See src/main/worker/index.ts for the worker side.
 */
type Reply =
  | { ready: true }
  | { fatal: string }
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; error: string }

let child: UtilityProcess | null = null
let ready: Promise<void> | null = null
let seq = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

export function startWorker(): Promise<void> {
  if (ready) return ready
  const worker = utilityProcess.fork(join(__dirname, 'worker.js'), [], {
    serviceName: 'neeme-data',
    env: { ...process.env, NEEME_USER_DATA: app.getPath('userData') }
  })
  child = worker

  ready = new Promise<void>((resolve, reject) => {
    worker.on('message', (raw: unknown) => {
      const msg = raw as Reply
      if ('ready' in msg) return resolve()
      if ('fatal' in msg) return reject(new Error(msg.fatal))
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)
      if (msg.ok) p.resolve(msg.value)
      else p.reject(new Error(msg.error))
    })
    worker.on('exit', (code) => {
      const err = new Error(`data worker exited (code ${code})`)
      for (const p of pending.values()) p.reject(err)
      pending.clear()
      child = null
      ready = null
    })
  })
  return ready
}

/** Forward an IPC call to the worker and await its reply. */
export function call<T = unknown>(channel: string, args: unknown[]): Promise<T> {
  if (!child) return Promise.reject(new Error('data worker not started'))
  const id = ++seq
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    child!.postMessage({ id, channel, args })
  })
}
