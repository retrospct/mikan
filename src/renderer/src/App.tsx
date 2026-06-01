import NeemeApp from './neeme/NeemeApp'

// The renderer now mounts the Neeme desktop surface ported from the Claude Design
// handoff (neeme-desktop.html): a capped daily focus list with context pools, the
// "+" capture/index flow, the diamond Neeme mark, voice recorder, planning ritual,
// and the all-done celebration. It runs on hand-authored sample data (see
// src/renderer/src/neeme/data.ts).
//
// The auth hook (src/renderer/src/hooks) and the on-device data seam
// (window.api.{pipeline,todos}.* in main/preload) are wired and ready; this view
// still runs on sample data. Swapping data.ts → window.api.* is tracked in
// docs/INTEGRATION.md (the contract returns the same view shapes; AI-only fields
// come back null until the drafting layer lands). See ADR 0003.
function App(): React.JSX.Element {
  return <NeemeApp />
}

export default App
