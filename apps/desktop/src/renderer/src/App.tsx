import NimiApp from './nimi/NimiApp'

// The renderer now mounts the Nimi desktop surface ported from the Claude Design
// handoff (nimi.html): a capped daily focus list with context pools, the
// "+" capture/index flow, the diamond Nimi mark, voice recorder, planning ritual,
// and the all-done celebration. It runs on hand-authored sample data (see
// src/renderer/src/nimi/data.ts).
//
// The auth hook (src/renderer/src/hooks) and the on-device data seam
// (window.api.{pipeline,todos}.* in main/preload) are wired and ready; this view
// still runs on sample data. Swapping data.ts → window.api.* is tracked in
// docs/INTEGRATION.md (the contract returns the same view shapes; AI-only fields
// come back null until the drafting layer lands). See ADR 0003.
function App(): React.JSX.Element {
  return <NimiApp />
}

export default App
