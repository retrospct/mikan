/**
 * Persisted sync preferences + the per-device at-rest encryption key.
 *
 * Two artifacts:
 *   - neeme-sync-prefs.json (plain JSON `{ enabled }` under `userData`) — the
 *     Settings toggle's *intent*; not a secret.
 *   - the 64-hex AES-256-GCM key (see db/crypto.ts), held in the shared secrets
 *     vault (secrets/store.ts) under `syncKey` — sealed in the OS keychain via
 *     `safeStorage`, alongside the Logto refresh token and the broker token.
 *
 * The key is generated once on this device the first time sync is enabled, and is
 * "sticky": once it exists it's always injected into the worker env so any rows
 * encrypted at rest stay readable even after sync is turned back off. To add a
 * second device, the user reveals the key here and imports it there
 * (setRecoveryKey) — this is the recovery/export path in ADR 0008.
 */
import { app } from 'electron'
import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as secrets from '../secrets/store'

/** A 32-byte key encoded as exactly 64 hex characters (matches db/crypto.ts). */
const KEY_HEX = /^[0-9a-f]{64}$/i

function prefsFile(): string {
  return join(app.getPath('userData'), 'neeme-sync-prefs.json')
}

/** Whether the user has turned the cloud replica on (persisted intent). */
export async function isSyncEnabled(): Promise<boolean> {
  try {
    const raw = await readFile(prefsFile(), 'utf8')
    return (JSON.parse(raw) as { enabled?: boolean }).enabled === true
  } catch {
    return false
  }
}

export async function setSyncEnabledPref(enabled: boolean): Promise<void> {
  await writeFile(prefsFile(), JSON.stringify({ enabled }))
}

/** The device key if one exists, normalized to lowercase hex; null otherwise. */
export async function getExistingKey(): Promise<string | null> {
  // From the in-memory vault (loaded once at startup — no Keychain touch here).
  const hex = secrets.get('syncKey')
  return hex && KEY_HEX.test(hex) ? hex.toLowerCase() : null
}

async function persistKey(hex: string): Promise<void> {
  await secrets.set('syncKey', hex)
}

/** Return the device key, generating + sealing a fresh one on first use. */
export async function getOrCreateKey(): Promise<string> {
  const existing = await getExistingKey()
  if (existing) return existing
  const hex = randomBytes(32).toString('hex')
  await persistKey(hex)
  return hex
}

/**
 * Import a recovery key from another device. Replaces this device's key — callers
 * must restart the worker afterward so the new key takes effect. Intended for a
 * fresh device joining; on a device that already has encrypted-at-rest rows under
 * a different key, those rows would no longer decrypt.
 */
export async function setRecoveryKey(hex: string): Promise<void> {
  const norm = hex.trim().toLowerCase()
  if (!KEY_HEX.test(norm)) {
    throw new Error('Recovery key must be 64 hexadecimal characters.')
  }
  await persistKey(norm)
}
