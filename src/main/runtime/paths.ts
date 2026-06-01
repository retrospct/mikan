/**
 * The per-user data dir. `electron.app` isn't available in a utilityProcess (a
 * plain Node child), so main passes the path via `NEEME_USER_DATA` when forking
 * the worker. Centralized here so the data layer stays electron-free + testable.
 */
export function userDataDir(): string {
  const dir = process.env.NEEME_USER_DATA
  if (!dir) {
    throw new Error(
      'NEEME_USER_DATA is not set — data services must run in the utilityProcess forked by main'
    )
  }
  return dir
}
