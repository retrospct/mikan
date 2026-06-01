import NeemeApp from './neeme/NeemeApp'

// The renderer now mounts the Neeme desktop surface ported from the Claude Design
// handoff (neeme-desktop.html): a capped daily focus list with context pools, the
// "+" capture/index flow, the diamond Neeme mark, voice recorder, planning ritual,
// and the all-done celebration. It runs on hand-authored sample data (see
// src/renderer/src/neeme/data.ts).
//
// The backend API client (src/shared/api), the auth hook (src/renderer/src/hooks),
// and the local libSQL seam (window.api.memory.* in main/preload) are intentionally
// left in place but unwired — unifying these views with real local/backend storage
// is a separate, parked decision (see ADR 0003 / the sync spike).
function App(): React.JSX.Element {
  return <NeemeApp />
}

export default App
