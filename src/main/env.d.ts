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
}
