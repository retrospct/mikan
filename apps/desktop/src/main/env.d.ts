/// <reference types="electron-vite/node" />

/**
 * Main-process env vars (electron-vite exposes only `MAIN_VITE_`-prefixed keys
 * on `import.meta.env`). Augments the base ImportMetaEnv from electron-vite/node.
 * Logto config is read here, not in the renderer — the OAuth flow runs in main.
 */
interface ImportMetaEnv {
  /** Logto tenant endpoint, e.g. https://xxxx.logto.app */
  readonly MAIN_VITE_LOGTO_ENDPOINT?: string
  /** Logto "Native app" application ID (public client, PKCE). */
  readonly MAIN_VITE_LOGTO_APP_ID?: string
  /** Optional API resource indicator the access token should be scoped to. */
  readonly MAIN_VITE_LOGTO_RESOURCE?: string
  /** Google Desktop-app OAuth client ID (for Gmail + Calendar connectors). */
  readonly MAIN_VITE_GOOGLE_CLIENT_ID?: string
  /** Google Desktop-app OAuth client secret (non-confidential in a native app). */
  readonly MAIN_VITE_GOOGLE_CLIENT_SECRET?: string
  /** Optional space-separated scope override for Google OAuth. */
  readonly MAIN_VITE_GOOGLE_SCOPES?: string
  /**
   * Token-broker URL (ADR 0008), inlined at build time so packaged releases
   * (which have no shell env) can reach the broker. `process.env.NEEME_SYNC_BROKER_URL`
   * overrides it at runtime for dev/tests. e.g. https://nimi-token-broker.vercel.app
   */
  readonly MAIN_VITE_NEEME_SYNC_BROKER_URL?: string
}
