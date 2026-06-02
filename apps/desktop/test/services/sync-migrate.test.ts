/**
 * Unit tests for the pre-sync → replica migration (db/migrate.ts).
 *
 * Pure logic against two local libSQL files (no replica, no network): proves that
 * enabling sync on a device with offline data copies that data into the new
 * replica, encrypting content at rest, without duplicating rows already pulled
 * from the primary.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  migrateUserData,
  isReplicaStateMismatch,
  buildReplicaWithRecovery
} from '../../src/main/db/migrate'
import { encrypt, decrypt } from '../../src/main/db/crypto'

const STATE_MISMATCH = new Error(
  'sync error: invalid local state: db file exists but metadata file does not'
)
const FAKE_CLIENT = {} as unknown as Client

const KEY_ENV = 'NEEME_SYNC_ENCRYPTION_KEY'
const VALID_KEY = 'a'.repeat(64)

async function makeDb(path: string): Promise<Client> {
  const c = createClient({ url: `file:${path}` })
  await c.executeMultiple(`
    CREATE TABLE items (
      id TEXT PRIMARY KEY, source_name TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'text',
      size_bytes INTEGER NOT NULL DEFAULT 0, text TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'captured', created_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE todos (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT, status TEXT NOT NULL DEFAULT 'open',
      day TEXT, position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0,
      completed_at INTEGER
    );
  `)
  return c
}

describe('isReplicaStateMismatch', () => {
  it('matches libSQL invalid-local-state / metadata errors', () => {
    expect(
      isReplicaStateMismatch(
        new Error('sync error: invalid local state: db file exists but metadata file does not')
      )
    ).toBe(true)
    expect(isReplicaStateMismatch(new Error('replica metadata file missing'))).toBe(true)
  })

  it('rejects unrelated errors', () => {
    expect(isReplicaStateMismatch(new Error('Replication(PrimaryHandshakeTimeout)'))).toBe(false)
    expect(isReplicaStateMismatch(new Error('network unreachable'))).toBe(false)
  })
})

describe('buildReplicaWithRecovery', () => {
  it('returns the replica with no backup when construction succeeds', () => {
    let calls = 0
    let backedUp = false
    const res = buildReplicaWithRecovery({
      makeReplica: () => {
        calls++
        return FAKE_CLIENT
      },
      dbExists: () => true,
      backupAside: () => {
        backedUp = true
      },
      dbPath: '/data/neeme.db'
    })
    expect(res.backupPath).toBeNull()
    expect(calls).toBe(1)
    expect(backedUp).toBe(false)
  })

  it('on a state mismatch with an existing DB, backs it up and rebuilds', () => {
    let calls = 0
    let backupArg: string | undefined
    const res = buildReplicaWithRecovery({
      makeReplica: () => {
        calls++
        if (calls === 1) throw STATE_MISMATCH
        return FAKE_CLIENT
      },
      dbExists: () => true,
      backupAside: (p) => {
        backupArg = p
      },
      restoreBackup: () => {},
      dbPath: '/data/neeme.db',
      now: () => 123
    })
    expect(calls).toBe(2)
    expect(res.backupPath).toBe('/data/neeme.db.pre-sync-123')
    expect(backupArg).toBe('/data/neeme.db.pre-sync-123')
  })

  it('re-throws a state mismatch when no DB exists to back up', () => {
    expect(() =>
      buildReplicaWithRecovery({
        makeReplica: () => {
          throw STATE_MISMATCH
        },
        dbExists: () => false,
        backupAside: () => {},
        restoreBackup: () => {},
        dbPath: '/data/neeme.db'
      })
    ).toThrow(/invalid local state/)
  })

  it('re-throws non-recoverable first-call errors without touching the backup', () => {
    let backedUp = false
    expect(() =>
      buildReplicaWithRecovery({
        makeReplica: () => {
          throw new Error('error trying to connect: tls handshake eof')
        },
        dbExists: () => true,
        backupAside: () => {
          backedUp = true
        },
        restoreBackup: () => {},
        dbPath: '/data/neeme.db'
      })
    ).toThrow(/tls handshake/)
    expect(backedUp).toBe(false)
  })

  it('restores the backup when the second makeReplica fails (e.g. transient network error)', () => {
    let calls = 0
    let restored: string | undefined
    expect(() =>
      buildReplicaWithRecovery({
        makeReplica: () => {
          calls++
          if (calls === 1) throw STATE_MISMATCH
          throw new Error('error trying to connect: tls handshake eof') // second call fails
        },
        dbExists: () => true,
        backupAside: () => {},
        restoreBackup: (p) => {
          restored = p
        },
        dbPath: '/data/neeme.db',
        now: () => 456
      })
    ).toThrow(/tls handshake/)
    expect(calls).toBe(2)
    expect(restored).toBe('/data/neeme.db.pre-sync-456') // backup restored, user not left broken
  })
})

describe('migrateUserData', () => {
  let dir: string
  let src: Client
  let dest: Client
  let savedKey: string | undefined

  beforeEach(async () => {
    savedKey = process.env[KEY_ENV]
    process.env[KEY_ENV] = VALID_KEY // migration only runs with sync on (key required)
    dir = mkdtempSync(join(tmpdir(), 'nimi-migrate-'))
    src = await makeDb(join(dir, 'src.db'))
    dest = await makeDb(join(dir, 'dest.db'))
  })

  afterEach(() => {
    src.close()
    dest.close()
    rmSync(dir, { recursive: true, force: true })
    if (savedKey === undefined) delete process.env[KEY_ENV]
    else process.env[KEY_ENV] = savedKey
  })

  it('copies items + todos and encrypts content at rest', async () => {
    await src.execute({
      sql: 'INSERT INTO items (id, source_name, text, status) VALUES (?, ?, ?, ?)',
      args: ['i1', 'note.txt', 'buy oat milk', 'captured']
    })
    await src.execute({
      sql: 'INSERT INTO todos (id, title, notes) VALUES (?, ?, ?)',
      args: ['t1', 'renew passport', 'gate code 4821']
    })

    expect(await migrateUserData(src, dest)).toBe(2)

    const item = (await dest.execute({ sql: 'SELECT text FROM items WHERE id = ?', args: ['i1'] }))
      .rows[0]!
    const todo = (
      await dest.execute({ sql: 'SELECT title, notes FROM todos WHERE id = ?', args: ['t1'] })
    ).rows[0]!
    expect(String(item.text)).toMatch(/^enc:/)
    expect(decrypt(String(item.text))).toBe('buy oat milk')
    expect(String(todo.title)).toMatch(/^enc:/)
    expect(decrypt(String(todo.title))).toBe('renew passport')
    expect(decrypt(String(todo.notes))).toBe('gate code 4821')
  })

  it('is idempotent — INSERT OR IGNORE keeps rows already pulled from the primary', async () => {
    await src.execute({
      sql: 'INSERT INTO items (id, source_name, text, status) VALUES (?, ?, ?, ?)',
      args: ['i1', 'n', 'hello', 'captured']
    })
    // dest already has this id (as if pulled from the primary during first sync)
    await dest.execute({
      sql: 'INSERT INTO items (id, source_name, text, status) VALUES (?, ?, ?, ?)',
      args: ['i1', 'n', 'enc:primary-wins', 'captured']
    })

    const inserted = await migrateUserData(src, dest)
    expect(inserted).toBe(0) // all rows ignored (already present from primary pull)

    const row = (await dest.execute({ sql: 'SELECT text FROM items WHERE id = ?', args: ['i1'] }))
      .rows[0]!
    expect(String(row.text)).toBe('enc:primary-wins')
    expect(Number((await dest.execute('SELECT count(*) c FROM items')).rows[0]!.c)).toBe(1)
  })

  it('passes already-encrypted values through unchanged (no double-encrypt)', async () => {
    const ct = encrypt('already secret')
    expect(ct).toMatch(/^enc:/)
    await src.execute({
      sql: 'INSERT INTO items (id, source_name, text, status) VALUES (?, ?, ?, ?)',
      args: ['i2', 'n', ct, 'captured']
    })

    await migrateUserData(src, dest)

    const row = (await dest.execute({ sql: 'SELECT text FROM items WHERE id = ?', args: ['i2'] }))
      .rows[0]!
    expect(String(row.text)).toBe(ct)
    expect(decrypt(String(row.text))).toBe('already secret')
  })
})
