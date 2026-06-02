/**
 * Client-side field encryption for synced data (AES-256-GCM).
 *
 * When NEEME_SYNC_ENCRYPTION_KEY is set, encrypt() wraps values with
 * authenticated encryption before they are written to the DB; decrypt()
 * unwraps them on read. When the key is NOT set both functions are
 * identity pass-throughs — existing unencrypted local usage is unaffected.
 *
 * Security posture: application-level encryption of content fields so the
 * cloud primary holds ciphertext, not plaintext. Metadata (ids, timestamps,
 * statuses, sha256 content-hashes) is visible. This is "trusted cloud with
 * encrypted content", not zero-knowledge. See sync-cloud-offload.plan.md §
 * "Privacy finalists" and the "at-rest-encryption" todo.
 *
 * Key management:
 *   - Generate once with generateKey() and store in Electron safeStorage.
 *   - 32 bytes (256 bits) encoded as 64 hex characters.
 *   - Losing the key means losing at-rest data on the cloud primary.
 *
 * Format of an encrypted value:
 *   "enc:<iv_hex>:<tag_hex>:<ciphertext_hex>"
 *   where iv = 12 bytes (GCM recommended), tag = 16 bytes (full GCM auth tag).
 *   The "enc:" prefix lets decrypt() distinguish encrypted from legacy plain rows.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm' as const
const IV_LENGTH = 12 // 96-bit nonce — GCM standard recommendation
const TAG_LENGTH = 16 // 128-bit auth tag
const PREFIX = 'enc:' // marks encrypted values; plain values pass through

/** A 32-byte key encoded as exactly 64 hexadecimal characters. */
const KEY_HEX = /^[0-9a-f]{64}$/i

function resolveKey(): Buffer | null {
  const hex = process.env.NEEME_SYNC_ENCRYPTION_KEY
  if (!hex) return null
  if (!KEY_HEX.test(hex)) {
    throw new Error(
      `NEEME_SYNC_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Got ${hex.length} chars${hex.length === 64 ? ' (non-hex)' : ''}.`
    )
  }
  return Buffer.from(hex, 'hex')
}

/**
 * True only when NEEME_SYNC_ENCRYPTION_KEY is present AND a valid 64-char hex
 * string (32 bytes). Non-throwing — the sync gate uses this to decide whether
 * encryption-at-rest is available before allowing any data to reach the cloud.
 */
export function hasValidEncryptionKey(): boolean {
  const hex = process.env.NEEME_SYNC_ENCRYPTION_KEY
  return typeof hex === 'string' && KEY_HEX.test(hex)
}

/**
 * Encrypt plaintext → "enc:<iv>:<tag>:<ciphertext>" (all hex).
 * Returns the original plaintext unchanged when the key env var is not set.
 */
export function encrypt(plaintext: string): string {
  const key = resolveKey()
  if (!key) return plaintext

  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`
}

/**
 * Decrypt a value produced by encrypt(). Returns the original value unchanged when:
 *   - NEEME_SYNC_ENCRYPTION_KEY is not set (pass-through / no key), or
 *   - the value does not start with "enc:" (legacy plain row — survives key rollout).
 *
 * On decryption failure (wrong key, corrupt data) the raw value is returned and
 * a warning is logged so the issue is visible without crashing.
 */
export function decrypt(value: string): string {
  const key = resolveKey()
  if (!key) return value
  if (!value.startsWith(PREFIX)) return value

  const body = value.slice(PREFIX.length)
  const first = body.indexOf(':')
  const second = body.indexOf(':', first + 1)
  if (first === -1 || second === -1) {
    console.warn('[crypto] decrypt: malformed encrypted value — returning raw')
    return value
  }

  const ivHex = body.slice(0, first)
  const tagHex = body.slice(first + 1, second)
  const ciphertextHex = body.slice(second + 1)

  try {
    const iv = Buffer.from(ivHex, 'hex')
    const tag = Buffer.from(tagHex, 'hex')
    const ciphertext = Buffer.from(ciphertextHex, 'hex')
    if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
      console.warn('[crypto] decrypt: unexpected iv/tag length — returning raw')
      return value
    }
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
  } catch (err) {
    console.warn('[crypto] decrypt failed (wrong key or corrupt data):', err)
    return value
  }
}

/**
 * Generate a fresh 32-byte random key as a 64-character hex string.
 *
 * Run once at device setup, then seal the result in Electron safeStorage:
 *   tsx -e "import { generateKey } from './src/main/db/crypto.ts'; generateKey()"
 *
 * Copy the printed line into your .env or safeStorage bootstrap code.
 * Never log or commit this value.
 */
export function generateKey(): string {
  const key = randomBytes(32).toString('hex')
  process.stdout.write(`NEEME_SYNC_ENCRYPTION_KEY=${key}\n`)
  return key
}
