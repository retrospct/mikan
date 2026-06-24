import { openDb } from './client'

const BROKER_URL = process.env.EXPO_PUBLIC_BROKER_URL ?? 'https://token-broker.vercel.app'

/**
 * Exchange a Logto access token with the token broker for per-user Turso
 * credentials, then open the local embedded replica (ADR 0008 + 0009).
 *
 * Shared by app startup (_layout, when a token is already persisted) and the
 * post-login flow (login screen, right after a fresh sign-in) so the DB is
 * ready immediately — no app restart needed.
 */
export async function bootstrapDb(accessToken: string): Promise<void> {
  const res = await fetch(`${BROKER_URL}/token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Broker ${res.status}`)
  const { syncUrl, authToken } = (await res.json()) as {
    syncUrl: string
    authToken: string
    expiresAt: number
  }
  await openDb({ syncUrl, authToken })
}
