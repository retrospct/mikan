/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Nimi HTTP API. Defaults to http://localhost:8000. */
  readonly VITE_NEEME_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
