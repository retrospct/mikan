/**
 * Data utilityProcess — a plain Node child that owns the libSQL DB and the
 * data services (pipeline / todos), so the heavy + native work runs OFF the
 * Electron main loop. Main forks this and proxies IPC to it; the renderer is
 * unaware (same `window.api.*` contract).
 *
 * Protocol over `process.parentPort`:
 *   parent → worker : { id, channel, args }
 *   worker → parent : { id, ok: true, value } | { id, ok: false, error }
 *   worker → parent : { ready: true }  (once the schema is up)  | { fatal }
 */
import { IPC } from '@nimi/contract/ipc'
import { initDb } from '../db'
import { pipelineService } from '../services/pipeline-service'
import { todoService } from '../services/todo-service'
import { uncoverService } from '../services/uncover-service'

type Handler = (args: unknown[]) => unknown | Promise<unknown>

const handlers: Record<string, Handler> = {
  [IPC.pipelineCaptureText]: ([text, name]) =>
    pipelineService.captureText(text as string, name as string | undefined),
  [IPC.pipelineCaptureFile]: ([bytes, name, mime]) =>
    pipelineService.captureFile(bytes as Uint8Array, name as string, mime as string | undefined),
  [IPC.pipelineArchive]: () => pipelineService.archive(),
  [IPC.pipelineFeed]: () => pipelineService.feed(),
  [IPC.pipelineUncoverTodos]: () => uncoverService.uncoverTodos(),
  [IPC.pipelineSearch]: ([query, topK]) =>
    pipelineService.match(query as string, topK as number | undefined),

  [IPC.todoAdd]: ([title, notes]) => todoService.add(title as string, notes as string | undefined),
  [IPC.todoToday]: ([day]) => todoService.today(day as string | undefined),
  [IPC.todoBacklog]: () => todoService.backlog(),
  [IPC.todoDone]: ([limit]) => todoService.done(limit as number | undefined),
  [IPC.todoComplete]: ([id]) => todoService.complete(id as string),
  [IPC.todoReopen]: ([id]) => todoService.reopen(id as string),
  [IPC.todoPlan]: ([keep, day]) => todoService.plan(keep as string[], day as string | undefined),
  [IPC.todoSchedule]: ([id, day]) => todoService.schedule(id as string, day as string | undefined),
  [IPC.todoContextSearch]: ([id]) => todoService.searchMoreContext(id as string),
  [IPC.todoContextPin]: ([id, itemId]) => todoService.pinContext(id as string, itemId as string),
  [IPC.todoContextDismiss]: ([id, itemId]) =>
    todoService.dismissContext(id as string, itemId as string)
}

interface CallMessage {
  id: number
  channel: string
  args: unknown[]
}

async function start(): Promise<void> {
  const port = process.parentPort
  await initDb()

  // Keep the vector index consistent with the active embedder (reindex if it
  // changed). Best-effort: a model-load/network failure must not block startup —
  // search stays on the prior index until a later boot succeeds.
  try {
    await pipelineService.syncEmbedder()
  } catch (err) {
    console.error('[worker] embedder sync/reindex failed; search may be degraded', err)
  }

  // Re-enqueue any image/audio items still pending from a prior session (crash
  // recovery or NEEME_EXTRACTOR=off → on transition). Best-effort.
  try {
    await pipelineService.resumeMediaExtraction()
  } catch (err) {
    console.error('[worker] media resume pass failed; pending items will stay pending', err)
  }

  port.on('message', (event) => {
    const msg = event.data as CallMessage
    const handler = handlers[msg.channel]
    const run = handler
      ? Promise.resolve(handler(msg.args))
      : Promise.reject(new Error(`unknown channel: ${msg.channel}`))
    run
      .then((value) => port.postMessage({ id: msg.id, ok: true, value }))
      .catch((err: unknown) =>
        port.postMessage({
          id: msg.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        })
      )
  })

  port.postMessage({ ready: true })
}

start().catch((err: unknown) => {
  process.parentPort.postMessage({ fatal: err instanceof Error ? err.message : String(err) })
  process.exit(1)
})
