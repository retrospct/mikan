/**
 * Crypto interop parity test — runs in Node with `tsx` (no Expo/RN required).
 *
 * Proves that the mobile codec (@noble/ciphers/aes) and the desktop codec
 * (node:crypto AES-256-GCM) produce byte-for-byte compatible enc:<iv>:<tag>:<ct>
 * values that each implementation can decrypt.
 *
 * Run from the repo root:
 *   cd apps/mobile
 *   pnpm exec tsx scripts/crypto-parity.ts
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { gcm } from '@noble/ciphers/aes.js'
import { bytesToHex, hexToBytes } from '@noble/ciphers/utils.js'

const IV_LENGTH = 12
const TAG_LENGTH = 16
const PREFIX = 'enc:'

// ── Desktop codec (node:crypto, identical to apps/desktop/src/main/db/crypto.ts) ──

function desktopEncrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`
}

function desktopDecrypt(value: string, keyHex: string): string {
  if (!value.startsWith(PREFIX)) return value
  const body = value.slice(PREFIX.length)
  const [ivHex, tagHex, ctHex] = body.split(':')
  const key = Buffer.from(keyHex, 'hex')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const ct = Buffer.from(ctHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ct).toString('utf8') + decipher.final('utf8')
}

// ── Mobile codec (@noble/ciphers, mirrors apps/mobile/src/db/crypto.ts) ──
// IV is passed in for determinism in tests; production uses expo-crypto.getRandomBytes.

function mobileEncrypt(plaintext: string, keyHex: string, ivBytes?: Uint8Array): string {
  const key = hexToBytes(keyHex)
  const iv = ivBytes ?? randomBytes(IV_LENGTH) as unknown as Uint8Array
  const encrypted = gcm(key, iv).encrypt(new TextEncoder().encode(plaintext))
  const ct = encrypted.slice(0, encrypted.length - TAG_LENGTH)
  const tag = encrypted.slice(encrypted.length - TAG_LENGTH)
  return `${PREFIX}${bytesToHex(iv)}:${bytesToHex(tag)}:${bytesToHex(ct)}`
}

function mobileDecrypt(value: string, keyHex: string): string {
  if (!value.startsWith(PREFIX)) return value
  const body = value.slice(PREFIX.length)
  const first = body.indexOf(':')
  const second = body.indexOf(':', first + 1)
  const iv = hexToBytes(body.slice(0, first))
  const tag = hexToBytes(body.slice(first + 1, second))
  const ct = hexToBytes(body.slice(second + 1))
  const combined = new Uint8Array(ct.length + tag.length)
  combined.set(ct)
  combined.set(tag, ct.length)
  return new TextDecoder().decode(gcm(hexToBytes(keyHex), iv).decrypt(combined))
}

// ── Test harness ──

let passed = 0
let failed = 0

function assert(label: string, actual: string, expected: string): void {
  if (actual === expected) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label}`)
    console.error(`    expected: ${expected}`)
    console.error(`    actual:   ${actual}`)
    failed++
  }
}

const KEY = 'a'.repeat(64) // 32 bytes, all 0xaa — deterministic test key

console.log('\n=== Crypto parity test ===\n')

const testCases = [
  'Hello, world!',
  'Note with unicode: café résumé 日本語',
  'enc:thisLooksLikeEncryptedButIsPlaintext',
  'x'.repeat(1000),
  ''
]

console.log('1. Desktop encrypts → mobile decrypts')
for (const msg of testCases) {
  if (msg === '') {
    // Empty string: both should be identity pass-through when no enc: prefix
    const r = mobileDecrypt(msg, KEY)
    assert(`empty string passthrough`, r, '')
    continue
  }
  const enc = desktopEncrypt(msg, KEY)
  const dec = mobileDecrypt(enc, KEY)
  assert(`"${msg.slice(0, 30)}"`, dec, msg)
}

console.log('\n2. Mobile encrypts → desktop decrypts')
for (const msg of testCases) {
  if (msg === '') {
    const r = desktopDecrypt(msg, KEY)
    assert(`empty string passthrough`, r, '')
    continue
  }
  const enc = mobileEncrypt(msg, KEY)
  const dec = desktopDecrypt(enc, KEY)
  assert(`"${msg.slice(0, 30)}"`, dec, msg)
}

console.log('\n3. enc: format matches desktop spec')
const sample = desktopEncrypt('test', KEY)
const parts = sample.slice(PREFIX.length).split(':')
assert('prefix', sample.startsWith('enc:') ? 'ok' : 'fail', 'ok')
assert('exactly 3 colon-separated segments', parts.length === 3 ? 'ok' : 'fail', 'ok')
assert('iv = 24 hex chars (12 bytes)', parts[0].length === 24 ? 'ok' : 'fail', 'ok')
assert('tag = 32 hex chars (16 bytes)', parts[1].length === 32 ? 'ok' : 'fail', 'ok')

const mobileSample = mobileEncrypt('test', KEY)
const mobileParts = mobileSample.slice(PREFIX.length).split(':')
assert('mobile: prefix', mobileSample.startsWith('enc:') ? 'ok' : 'fail', 'ok')
assert('mobile: iv = 24 hex chars', mobileParts[0].length === 24 ? 'ok' : 'fail', 'ok')
assert('mobile: tag = 32 hex chars', mobileParts[1].length === 32 ? 'ok' : 'fail', 'ok')

console.log('\n4. Non-enc: values pass through unchanged (legacy rows)')
const plain = 'just a plain note'
assert('mobile passthrough (no key prefix)', mobileDecrypt(plain, KEY), plain)
assert('desktop passthrough (no key prefix)', desktopDecrypt(plain, KEY), plain)

console.log(`\n${'─'.repeat(40)}`)
console.log(`Result: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
} else {
  console.log('All parity checks passed. Mobile codec is byte-compatible with desktop.\n')
}
