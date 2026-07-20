import MikanApp from './mikan/MikanApp'

// The renderer mounts the Mikan desktop surface ported from the Claude Design
// handoff (mikan.html): a capped daily focus list with context pools, the
// "+" capture/index flow, the diamond Mikan mark, voice recorder, planning ritual,
// and the all-done celebration.
//
// It is wired to the real backend through the `data` seam (src/renderer/src/mikan/
// api.ts): `window.api.{pipeline,todos,ui}.*` in Electron, an in-memory mock
// (src/renderer/src/mikan/mock.ts) in the browser preview. Structural data is real;
// AI-only fields come back null until the drafting layer lands (docs/INTEGRATION.md).
// Auth is wired separately via src/renderer/src/hooks. See ADR 0003.
function App(): React.JSX.Element {
  return <MikanApp />
}

export default App
