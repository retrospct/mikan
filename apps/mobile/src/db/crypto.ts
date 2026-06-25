/**
 * Client-side field encryption for synced data (AES-256-GCM).
 *
 * Byte-for-byte compatible with apps/desktop/src/main/db/crypto.ts.
 * Uses @noble/ciphers (pure-JS, no native rebuild) + expo-crypto for random IV.
 * node:crypto is unavailable in React Native / Hermes.
 *
 * Wire format: "enc:<iv_hex>:<tag_hex>:<ciphertext_hex>"
 *   iv  = 12 bytes (96-bit GCM nonce)
 *   tag = 16 bytes (128-bit GCM auth tag) — noble appends tag to ciphertext output;
 *         we split it out to match the desktop's separate :<tag>: segment.
 *
 * Key management:
 *   - 32 bytes encoded as 64 hexadecimal characters.
 *   - Obtained from the desktop's "reveal recovery key" UI and stored in
 *     expo-secure-store (see src/db/key-store.ts).
 *   - Key is passed explicitly (no process.env on RN).
 *
 * When keyHex is absent/null, both functions are identity pass-throughs — the
 * same semantics as the desktop when NEEME_SYNC_ENCRYPTION_KEY is unset.
 */
import { gcm } from '@noble/ciphers/aes.js'
import { bytesToHex, hexToBytes } from '@noble/ciphers/utils.js'
import { getRandomBytes } from 'expo-crypto'

const PREFIX = 'enc:'
const IV_LENGTH = 12
const TAG_LENGTH = 16

/** /^[0-9a-f]{64}$/i — same constraint as the desktop */
const KEY_HEX_RE = /^[0-9a-f]{64}$/i

export function hasValidKey(keyHex: string | null | undefined): boolean {
  return typeof keyHex === 'string' && KEY_HEX_RE.test(keyHex)
}

/**
 * Encrypt plaintext → "enc:<iv>:<tag>:<ciphertext>" (all hex).
 * Returns the original string unchanged when keyHex is absent or invalid.
 */
export function encrypt(plaintext: string, keyHex: string | null | undefined): string {
  if (!hasValidKey(keyHex)) return plaintext

  const key = hexToBytes(keyHex as string)
  const iv = getRandomBytes(IV_LENGTH)
  // noble gcm().encrypt() returns ct || tag (tag is last TAG_LENGTH bytes)
  const encrypted = gcm(key, iv).encrypt(new TextEncoder().encode(plaintext))
  const ct = encrypted.slice(0, encrypted.length - TAG_LENGTH)
  const tag = encrypted.slice(encrypted.length - TAG_LENGTH)
  return `${PREFIX}${bytesToHex(iv)}:${bytesToHex(tag)}:${bytesToHex(ct)}`
}

/**
 * Decrypt a value produced by encrypt(). Returns the original value unchanged when:
 *   - keyHex is absent/invalid (pass-through / no key), or
 *   - the value does not start with "enc:" (legacy plain row — survives key rollout).
 *
 * On decryption failure (wrong key, corrupt data) the raw value is returned and
 * a warning is logged so the issue is visible without crashing.
 */
export function decrypt(value: string, keyHex: string | null | undefined): string {
  if (!hasValidKey(keyHex)) return value
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
  const ctHex = body.slice(second + 1)

  try {
    const key = hexToBytes(keyHex as string)
    const iv = hexToBytes(ivHex)
    const tag = hexToBytes(tagHex)
    const ct = hexToBytes(ctHex)
    if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
      console.warn('[crypto] decrypt: unexpected iv/tag length — returning raw')
      return value
    }
    // noble gcm().decrypt() expects ct || tag concatenated
    const combined = new Uint8Array(ct.length + tag.length)
    combined.set(ct)
    combined.set(tag, ct.length)
    return new TextDecoder().decode(gcm(key, iv).decrypt(combined))
  } catch (err) {
    console.warn('[crypto] decrypt failed (wrong key or corrupt data):', err)
    return value
  }
}
