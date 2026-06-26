/**
 * Single encrypted secrets vault for the main process.
 *
 * The desktop client holds a handful of at-rest secrets — the Logto refresh
 * token, Google connector refresh tokens, the broker sync token, and the
 * per-device encryption key. Historically each lived in its own
 * `safeStorage`-sealed file under `userData`, and each was decrypted separately
 * at startup. On macOS every `safeStorage.decryptString()` is a fetch of the
 * app's Keychain master key, and an untrusted (ad-hoc / unsigned dev) build
 * re-prompts for every fetch — so four files meant four Keychain prompts on
 * every launch.
 *
 * This module collapses them into ONE sealed file (`neeme-secrets.bin`) read
 * exactly once at boot via `loadAll()`. After that, `get()` is a pure in-memory
 * lookup (zero Keychain touches); only `set()` — driven by user actions like
 * login / connect / sync-toggle — re-seals, and that's elided when nothing
 * changed. Net result: a single Keychain decrypt per launch (which a properly
 * code-signed build only ever prompts for once, via "Always Allow").
 *
 * `safeStorage` stays the at-rest primitive (Keychain on macOS, DPAPI on
 * Windows, libsecret/kwallet on Linux); we keep the existing plaintext fallback
 * for platforms without a backing keyring.
 */
import type { AuthClaims, BrokerTokenResponse } from '@mikan/contract/ipc'
import { app, safeStorage } from 'electron'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Everything sealed in the vault. Each key is owned by one main-process module. */
export interface SecretsShape {
  /** Logto: refresh token + display claims (auth/logto.ts). */
  auth?: { refreshToken: string; claims: AuthClaims | null }
  /** Google OAuth refresh tokens (connectors/google-auth.ts). */
  connectors?: { gmail?: { refreshToken: string }; gcal?: { refreshToken: string } }
  /** Broker-issued Turso sync token (sync/broker.ts). */
  broker?: BrokerTokenResponse
  /** Per-device AES-256-GCM key, 64-hex (sync/sync-prefs.ts). */
  syncKey?: string
}

let mem: SecretsShape = {}
// Last plaintext sealed to disk; lets flush() skip a redundant re-seal — a
// Keychain touch — when a write doesn't actually change anything.
let lastSealed: string | null = null
let loaded = false

function vaultFile(): string {
  return join(app.getPath('userData'), 'neeme-secrets.bin')
}

function seal(plain: string): Buffer {
  return safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(plain)
    : Buffer.from(plain, 'utf8') // fallback (e.g. Linux w/o keyring); still inside userData
}

function open(blob: Buffer): string {
  return safeStorage.isEncryptionAvailable()
    ? safeStorage.decryptString(blob)
    : blob.toString('utf8')
}

/**
 * Load the vault into memory. Idempotent; the one Keychain decrypt at startup.
 * Falls back to a one-time migration of the legacy per-secret files when the
 * consolidated vault doesn't exist yet.
 */
export async function loadAll(): Promise<void> {
  if (loaded) return
  loaded = true
  try {
    const plain = open(await readFile(vaultFile()))
    mem = JSON.parse(plain) as SecretsShape
    lastSealed = plain
  } catch {
    // No consolidated vault yet — try migrating the legacy files (or start empty).
    await migrateLegacy()
  }
}

/** In-memory read; never touches the Keychain. */
export function get<K extends keyof SecretsShape>(key: K): SecretsShape[K] {
  return mem[key]
}

/** Set (or clear, when value is undefined) a slice and re-seal the vault. */
export async function set<K extends keyof SecretsShape>(
  key: K,
  value: SecretsShape[K]
): Promise<void> {
  if (value === undefined) delete mem[key]
  else mem[key] = value
  await flush()
}

async function flush(): Promise<void> {
  const plain = JSON.stringify(mem)
  if (plain === lastSealed) return // nothing changed — skip the re-seal (Keychain touch)
  await writeFile(vaultFile(), seal(plain))
  lastSealed = plain
}

/**
 * One-time migration from the four legacy `safeStorage` files into the vault.
 * Each decrypt is the same Keychain access those files cost today, so the first
 * launch after upgrading may still show up to four prompts; afterwards the
 * legacy files are gone and every launch is a single vault read.
 */
async function migrateLegacy(): Promise<void> {
  const dir = app.getPath('userData')
  const legacy = {
    auth: join(dir, 'neeme-auth.bin'),
    connectors: join(dir, 'neeme-connectors.bin'),
    broker: join(dir, 'neeme-sync-token.bin'),
    syncKey: join(dir, 'neeme-sync-key.bin')
  }
  let migrated = false

  // Each file decrypts + parses independently so one corrupt/absent file can't
  // sink the rest. The sync key is a bare hex string; the others are JSON.
  const readJson = async <T>(path: string): Promise<T | undefined> => {
    try {
      return JSON.parse(open(await readFile(path))) as T
    } catch {
      return undefined
    }
  }

  mem.auth = await readJson<SecretsShape['auth']>(legacy.auth)
  mem.connectors = await readJson<SecretsShape['connectors']>(legacy.connectors)
  mem.broker = await readJson<SecretsShape['broker']>(legacy.broker)
  try {
    const hex = open(await readFile(legacy.syncKey)).trim()
    if (hex) mem.syncKey = hex
  } catch {
    /* no legacy sync key */
  }

  for (const key of Object.keys(mem) as (keyof SecretsShape)[]) {
    if (mem[key] === undefined) delete mem[key]
    else migrated = true
  }

  if (!migrated) return // nothing to carry over — leave the vault unwritten

  await flush() // write the consolidated vault once...
  // ...then drop the legacy files so subsequent boots take the single-read path.
  await Promise.all(Object.values(legacy).map((p) => rm(p, { force: true }).catch(() => {})))
}
