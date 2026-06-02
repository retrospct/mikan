/**
 * Live sync + encryption-at-rest smoke (ROADMAP #10).
 *
 * Verifies the two guarantees that matter most for cloud sync:
 *   1. Encryption at rest — content written to the Turso primary is ciphertext.
 *   2. Cross-device replica — a second, independent replica pulls + decrypts it.
 * Plus the fail-closed gate: NEEME_SYNC=on without a valid key stays local.
 *
 * No credentials? The script still runs the gate check and exits 0 (the live
 * loop is skipped with a clear note) so it's safe to run anywhere.
 *
 * Run (gate-only, no creds needed):
 *   pnpm --filter @nimi/desktop test:smoke:sync
 *
 * Run the full two-device loop (set all four, see docs/setup/turso-credentials.md):
 *   NEEME_SYNC=on \
 *   NEEME_SYNC_URL=libsql://<db>.turso.io \
 *   NEEME_SYNC_AUTH_TOKEN=<token> \
 *   NEEME_SYNC_ENCRYPTION_KEY=<64-hex> \
 *   pnpm --filter @nimi/desktop test:smoke:sync
 *
 * Internals: the db layer builds its libSQL client once per process from the env,
 * so each "device" is a separate child process with its own NEEME_USER_DATA. The
 * top-level (no-arg) invocation orchestrates the children and asserts the result.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'

const mode = process.argv[2] ?? 'orchestrate'
const NONCE = process.env.SYNC_NONCE ?? `smoke-${Date.now()}`
const SOURCE = `sync-live-${NONCE}.txt`
const NOTE = `Sync-live note ${NONCE}: buy oat milk and book a dentist appointment`
const TODO_TITLE = `Sync-live todo ${NONCE}: file quarterly taxes`

const KEY_HEX = /^[0-9a-f]{64}$/i
function hasCreds(): boolean {
  return (
    process.env.NEEME_SYNC === 'on' &&
    !!process.env.NEEME_SYNC_URL &&
    !!process.env.NEEME_SYNC_AUTH_TOKEN &&
    KEY_HEX.test(process.env.NEEME_SYNC_ENCRYPTION_KEY ?? '')
  )
}

function remoteClient(): ReturnType<typeof createClient> {
  return createClient({
    url: process.env.NEEME_SYNC_URL!,
    authToken: process.env.NEEME_SYNC_AUTH_TOKEN
  })
}

/** Device A: boot like the worker, capture a note + todo, push to the primary. */
async function deviceA(): Promise<void> {
  const { initDb, syncNow } = await import('../../src/main/db/index')
  const { pipelineService } = await import('../../src/main/services/pipeline-service')
  const { todoService } = await import('../../src/main/services/todo-service')
  await initDb()
  await syncNow()
  const cap = await pipelineService.captureText(NOTE, SOURCE)
  const todo = await todoService.add(TODO_TITLE)
  await syncNow()
  // Emit machine-parseable ids so the orchestrator can clean up afterward.
  // (todos.title is encrypted at rest, so cleanup must target the id, not the title.)
  console.log(`[A] itemId=${cap.memory.id}`)
  console.log(`[A] todoId=${todo.id}`)
  console.log(`[A] captured + pushed item ${cap.memory.id}`)
}

/** Inspect the remote primary directly — proves ciphertext at rest. */
async function primaryCheck(): Promise<void> {
  const c = remoteClient()
  const r = await c.execute({ sql: 'SELECT text FROM items WHERE source_name = ?', args: [SOURCE] })
  const stored = String(r.rows[0]?.text ?? '')
  const enc = stored.startsWith('enc:')
  console.log(`[primary] item present: ${r.rows.length === 1} | ciphertext: ${enc}`)
  console.log(`[primary] stored: ${stored.slice(0, 48)}${stored.length > 48 ? '…' : ''}`)
  if (r.rows.length !== 1 || !enc) process.exit(1)
}

/** Device B: a fresh, separate replica pulls, decrypts, reindexes, and searches. */
async function deviceB(): Promise<void> {
  const { initDb, syncNow } = await import('../../src/main/db/index')
  const { pipelineService } = await import('../../src/main/services/pipeline-service')
  const { todoService } = await import('../../src/main/services/todo-service')
  await initDb()
  await syncNow()
  await pipelineService.reindexAll()
  const items = await pipelineService.listItems()
  const mine = items.find((i) => i.text === NOTE)
  const hits = await pipelineService.match('dentist appointment and milk', 5)
  const topIsMine = !!mine && hits.length > 0 && hits[0]!.id === mine.id
  const tasks = [...(await todoService.today()), ...(await todoService.backlog())]
  const myTodo = tasks.find((t) => t.title === TODO_TITLE)
  console.log(
    `[B] decrypted note: ${!!mine} | search top-hit is note: ${topIsMine} | decrypted todo: ${!!myTodo}`
  )
  if (!mine || !topIsMine || !myTodo) process.exit(1)
}

/** Gate check (no creds needed): NEEME_SYNC=on without a valid key must stay local. */
async function gateCheck(): Promise<void> {
  const saved = {
    on: process.env.NEEME_SYNC,
    url: process.env.NEEME_SYNC_URL,
    key: process.env.NEEME_SYNC_ENCRYPTION_KEY
  }
  process.env.NEEME_SYNC = 'on'
  process.env.NEEME_SYNC_URL = 'libsql://gate-check.invalid.turso.io'
  delete process.env.NEEME_SYNC_ENCRYPTION_KEY
  const { getSyncConfig } = await import('../../src/main/db/sync-config')
  const cfg = getSyncConfig()
  process.env.NEEME_SYNC = saved.on
  process.env.NEEME_SYNC_URL = saved.url
  if (saved.key !== undefined) process.env.NEEME_SYNC_ENCRYPTION_KEY = saved.key
  const ok = cfg.enabled === false && cfg.disabledReason === 'missing-or-invalid-key'
  console.log(
    `[gate] on + url + no key => enabled=${cfg.enabled} reason=${cfg.disabledReason} (${ok ? 'PASS' : 'FAIL'})`
  )
  if (!ok) process.exit(1)
}

/**
 * Spawn this script in a child process for one "device" with an isolated data dir.
 * Captures stdout (and echoes it) so the orchestrator can parse ids for cleanup.
 */
function runChild(childMode: string, userDataDir: string): string {
  const res = spawnSync('pnpm', ['exec', 'tsx', __filename, childMode], {
    stdio: ['inherit', 'pipe', 'inherit'],
    encoding: 'utf8',
    env: { ...process.env, NEEME_USER_DATA: userDataDir, NEEME_EMBEDDER: 'hash', SYNC_NONCE: NONCE }
  })
  if (res.stdout) process.stdout.write(res.stdout)
  if (res.status !== 0) {
    console.error(`[orchestrate] child "${childMode}" failed (exit ${res.status})`)
    process.exit(1)
  }
  return res.stdout ?? ''
}

async function orchestrate(): Promise<void> {
  console.log(`=== sync-live (#10): encryption-at-rest + two-device replica ===\nnonce: ${NONCE}`)
  await gateCheck()

  if (!hasCreds()) {
    console.log(
      '\n[orchestrate] no Turso creds set — skipping the live two-device loop.\n' +
        '  Set NEEME_SYNC=on + NEEME_SYNC_URL + NEEME_SYNC_AUTH_TOKEN + NEEME_SYNC_ENCRYPTION_KEY\n' +
        '  (see docs/setup/turso-credentials.md) to run it. Gate check passed; exiting 0.'
    )
    return
  }

  const dirA = mkdtempSync(join(tmpdir(), 'nimi-sync-a-'))
  const dirB = mkdtempSync(join(tmpdir(), 'nimi-sync-b-'))
  let todoId: string | undefined
  try {
    console.log('\n-- Device A: capture + push --')
    const outA = runChild('a', dirA)
    todoId = /\[A\] todoId=([\w-]+)/.exec(outA)?.[1]
    console.log('\n-- Remote primary: at-rest check --')
    runChild('primary', mkdtempSync(join(tmpdir(), 'nimi-sync-p-')))
    console.log('\n-- Device B: pull + decrypt + search --')
    runChild('b', dirB)
    console.log('\n✓ PASS — encrypted note + todo synced A → primary (ciphertext) → B (decrypted).')
  } finally {
    // Clean up this run's rows. items match on source_name (plaintext metadata);
    // todos must match on id, since todos.title is encrypted at rest.
    const c = remoteClient()
    await c
      .execute({ sql: 'DELETE FROM items WHERE source_name = ?', args: [SOURCE] })
      .catch(() => {})
    if (todoId) {
      await c.execute({ sql: 'DELETE FROM todos WHERE id = ?', args: [todoId] }).catch(() => {})
    }
    console.log('[orchestrate] cleaned up this run’s rows from the primary.')
  }
}

async function main(): Promise<void> {
  if (mode === 'a') await deviceA()
  else if (mode === 'b') await deviceB()
  else if (mode === 'primary') await primaryCheck()
  else if (mode === 'gate') await gateCheck()
  else await orchestrate()
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[sync-live] threw:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
