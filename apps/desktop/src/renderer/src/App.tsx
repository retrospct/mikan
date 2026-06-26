import MikanApp from './mikan/MikanApp'

// The renderer mounts the Nimi desktop surface ported from the Claude Design
// handoff (nimi.html): a capped daily focus list with context pools, the
// "+" capture/index flow, the diamond Nimi mark, voice recorder, planning ritual,
// and the all-done celebration.
//
// It is wired to the real backend through the `data` seam (src/renderer/src/nimi/
// api.ts): `window.api.{pipeline,todos,ui}.*` in Electron, an in-memory mock
// (src/renderer/src/nimi/mock.ts) in the browser preview. Structural data is real;
// AI-only fields come back null until the drafting layer lands (docs/INTEGRATION.md).
// Auth is wired separately via src/renderer/src/hooks. See ADR 0003.
function App(): React.JSX.Element {
  return <MikanApp />
}

export default App
