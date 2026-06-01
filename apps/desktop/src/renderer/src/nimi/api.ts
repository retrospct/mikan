// api.ts — the single data seam the renderer talks to.
//
// In Electron, `window.api` (exposed by the preload via contextBridge) is the
// real on-device backend. In a plain browser (the `pnpm dev` web preview, where
// there is no `window.api`), we fall back to an in-memory mock so the UI stays
// fully exercisable without booting Electron. Every component imports `data`
// from here instead of touching `window.api` directly — that keeps the
// `window.api`-may-be-undefined reality in exactly one place.
import { createContext } from 'react'
import type { Memory } from '@nimi/contract/views'
import type { NimiApi } from '@nimi/contract/ipc'
import { makeMockApi } from './mock'

/** The slice of the contract the UI actually drives (auth is handled separately). */
type DataApi = Pick<NimiApi, 'pipeline' | 'todos' | 'ui'>

// `Window.api` types as non-optional `NimiApi` in the renderer (the preload's
// ambient d.ts flows in via tsconfig.web.json), but at runtime it is undefined
// outside Electron — so probe it honestly through an optional view.
export const isElectron =
  typeof window !== 'undefined' && Boolean((window as { api?: unknown }).api)

export const data: DataApi = isElectron ? (window.api as NimiApi) : makeMockApi()

/**
 * The archive (`pipeline.archive()`) projected to an id→Memory lookup, provided
 * by NimiApp. Components read it with `useContext` instead of prop-drilling so a
 * task's `ctx`/`pinned` ids resolve to display rows. The invariant (every ctx id
 * is in the archive — see docs/INTEGRATION.md) means these lookups resolve.
 */
export const MemoryContext = createContext<Record<string, Memory>>({})
