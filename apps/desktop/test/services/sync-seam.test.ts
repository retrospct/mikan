/**
 * Unit tests for the sync seam and crypto module.
 *
 * Verifies the hard guarantee: NEEME_SYNC off = zero behaviour change.
 * No DB access — these are pure env/logic tests.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getSyncConfig } from '../../src/main/db/sync-config'
import { encrypt, decrypt, generateKey, hasValidEncryptionKey } from '../../src/main/db/crypto'

// ── Sync config seam ──────────────────────────────────────────────────────

describe('getSyncConfig', () => {
  const envKeys = [
    'NEEME_SYNC',
    'NEEME_SYNC_URL',
    'NEEME_SYNC_AUTH_TOKEN',
    'NEEME_SYNC_INTERVAL_S',
    'NEEME_SYNC_ENCRYPTION_KEY'
  ]

  // A valid 64-hex (32-byte) key — sync now requires one to enable.
  const VALID_KEY = 'a'.repeat(64)

  // Snapshot env before each test; restore after.
  let saved: Record<string, string | undefined> = {}
  beforeEach(() => {
    saved = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]))
    for (const k of envKeys) delete process.env[k]
  })
  afterEach(() => {
    for (const k of envKeys) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('is disabled when NEEME_SYNC is absent', () => {
    expect(getSyncConfig().enabled).toBe(false)
  })

  it('is disabled when NEEME_SYNC is "false"', () => {
    process.env.NEEME_SYNC = 'false'
    expect(getSyncConfig().enabled).toBe(false)
  })

  it('is disabled when NEEME_SYNC is "1"', () => {
    process.env.NEEME_SYNC = '1'
    expect(getSyncConfig().enabled).toBe(false)
  })

  it('is disabled when NEEME_SYNC=on but NEEME_SYNC_URL is missing', () => {
    process.env.NEEME_SYNC = 'on'
    const cfg = getSyncConfig()
    expect(cfg.enabled).toBe(false)
    expect(cfg.disabledReason).toBe('missing-url')
  })

  it('is disabled when NEEME_SYNC=on + URL set but NEEME_SYNC_ENCRYPTION_KEY is missing', () => {
    process.env.NEEME_SYNC = 'on'
    process.env.NEEME_SYNC_URL = 'libsql://test.turso.io'
    const cfg = getSyncConfig()
    expect(cfg.enabled).toBe(false)
    expect(cfg.disabledReason).toBe('missing-or-invalid-key')
  })

  it('is disabled when the encryption key is the wrong length', () => {
    process.env.NEEME_SYNC = 'on'
    process.env.NEEME_SYNC_URL = 'libsql://test.turso.io'
    process.env.NEEME_SYNC_ENCRYPTION_KEY = 'abc123'
    const cfg = getSyncConfig()
    expect(cfg.enabled).toBe(false)
    expect(cfg.disabledReason).toBe('missing-or-invalid-key')
  })

  it('is disabled when the encryption key is 64 chars but not hex', () => {
    process.env.NEEME_SYNC = 'on'
    process.env.NEEME_SYNC_URL = 'libsql://test.turso.io'
    process.env.NEEME_SYNC_ENCRYPTION_KEY = 'z'.repeat(64)
    expect(getSyncConfig().enabled).toBe(false)
  })

  it('is enabled when NEEME_SYNC=on, NEEME_SYNC_URL, and a valid encryption key are all set', () => {
    process.env.NEEME_SYNC = 'on'
    process.env.NEEME_SYNC_URL = 'libsql://test.turso.io'
    process.env.NEEME_SYNC_ENCRYPTION_KEY = VALID_KEY
    const cfg = getSyncConfig()
    expect(cfg.enabled).toBe(true)
    expect(cfg.syncUrl).toBe('libsql://test.turso.io')
    expect(cfg.disabledReason).toBeUndefined()
  })

  it('uses default 5-minute interval when NEEME_SYNC_INTERVAL_S is absent', () => {
    expect(getSyncConfig().syncIntervalMs).toBe(300_000)
  })

  it('respects NEEME_SYNC_INTERVAL_S', () => {
    process.env.NEEME_SYNC_INTERVAL_S = '60'
    expect(getSyncConfig().syncIntervalMs).toBe(60_000)
  })

  it('clamps NEEME_SYNC_INTERVAL_S below the minimum to the default', () => {
    process.env.NEEME_SYNC_INTERVAL_S = '5'
    expect(getSyncConfig().syncIntervalMs).toBe(300_000)
  })

  it('includes authToken when NEEME_SYNC_AUTH_TOKEN is set', () => {
    process.env.NEEME_SYNC = 'on'
    process.env.NEEME_SYNC_URL = 'libsql://test.turso.io'
    process.env.NEEME_SYNC_AUTH_TOKEN = 'tok_abc'
    process.env.NEEME_SYNC_ENCRYPTION_KEY = VALID_KEY
    const cfg = getSyncConfig()
    expect(cfg.enabled).toBe(true)
    expect(cfg.authToken).toBe('tok_abc')
  })
})

// ── Crypto seam ───────────────────────────────────────────────────────────

describe('encrypt / decrypt', () => {
  const KEY_ENV = 'NEEME_SYNC_ENCRYPTION_KEY'

  let savedKey: string | undefined
  beforeEach(() => {
    savedKey = process.env[KEY_ENV]
    delete process.env[KEY_ENV]
  })
  afterEach(() => {
    if (savedKey === undefined) delete process.env[KEY_ENV]
    else process.env[KEY_ENV] = savedKey
  })

  it('is a no-op pass-through when the key is not set', () => {
    expect(encrypt('hello world')).toBe('hello world')
    expect(decrypt('hello world')).toBe('hello world')
  })

  it('leaves non-encrypted values alone when decrypting (key present)', () => {
    process.env[KEY_ENV] = generateKey()
    // A plain text value without the "enc:" prefix passes through.
    expect(decrypt('plain legacy text')).toBe('plain legacy text')
  })

  it('round-trips plaintext correctly', () => {
    process.env[KEY_ENV] = generateKey()
    const plaintext = 'My secret todo: buy milk'
    expect(decrypt(encrypt(plaintext))).toBe(plaintext)
  })

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    process.env[KEY_ENV] = generateKey()
    const c1 = encrypt('same')
    const c2 = encrypt('same')
    expect(c1).not.toBe(c2)
    expect(decrypt(c1)).toBe('same')
    expect(decrypt(c2)).toBe('same')
  })

  it('round-trips an empty string', () => {
    process.env[KEY_ENV] = generateKey()
    expect(decrypt(encrypt(''))).toBe('')
  })

  it('round-trips unicode content', () => {
    process.env[KEY_ENV] = generateKey()
    const text = '日本語テスト 🔑 émoji'
    expect(decrypt(encrypt(text))).toBe(text)
  })

  it('produces a value starting with "enc:"', () => {
    process.env[KEY_ENV] = generateKey()
    expect(encrypt('test')).toMatch(/^enc:/)
  })

  it('returns raw value on decryption with wrong key (no crash)', () => {
    process.env[KEY_ENV] = generateKey()
    const encryptedWithKey1 = encrypt('secret data')

    // Switch to a different key — decryption should fail gracefully.
    process.env[KEY_ENV] = generateKey()
    const result = decrypt(encryptedWithKey1)
    // Should return the raw encrypted string (not throw, not return plaintext).
    expect(result).toBe(encryptedWithKey1)
  })
})

// ── Encryption key validator (sync gate) ──────────────────────────────────

describe('hasValidEncryptionKey', () => {
  const KEY_ENV = 'NEEME_SYNC_ENCRYPTION_KEY'
  let savedKey: string | undefined
  beforeEach(() => {
    savedKey = process.env[KEY_ENV]
    delete process.env[KEY_ENV]
  })
  afterEach(() => {
    if (savedKey === undefined) delete process.env[KEY_ENV]
    else process.env[KEY_ENV] = savedKey
  })

  it('is false when the key is absent', () => {
    expect(hasValidEncryptionKey()).toBe(false)
  })

  it('is false when the key is the wrong length', () => {
    process.env[KEY_ENV] = 'deadbeef'
    expect(hasValidEncryptionKey()).toBe(false)
  })

  it('is false when the key is 64 chars but not hex', () => {
    process.env[KEY_ENV] = 'z'.repeat(64)
    expect(hasValidEncryptionKey()).toBe(false)
  })

  it('is true for a valid 64-hex key (incl. generateKey output)', () => {
    process.env[KEY_ENV] = 'A'.repeat(64) // hex is case-insensitive
    expect(hasValidEncryptionKey()).toBe(true)
    process.env[KEY_ENV] = generateKey()
    expect(hasValidEncryptionKey()).toBe(true)
  })
})
