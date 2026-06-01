---
name: "Test captureFile #4"
overview: "The item #4 implementation (captureFile IPC + drag-drop/picker UX) is complete on `origin/main` but this worktree is ~13 commits behind. The plan merges main, runs all static checks, and verifies correctness of the key touchpoints against the spec."
todos:
  - id: merge-main
    content: Merge origin/main into this worktree
    status: completed
  - id: run-static-checks
    content: Run pnpm typecheck, pnpm lint, pnpm build
    status: completed
  - id: verify-touchpoints
    content: Spot-check the 7 key implementation files for spec compliance
    status: completed
  - id: smoke-test
    content: Run NEEME_EMBEDDER=hash pnpm dev and execute the 5 manual smoke-test scenarios
    status: completed
  - id: update-roadmap
    content: "Mark ROADMAP item #4 as done after smoke-test passes"
    status: completed
isProject: false
---

# Test captureFile (Roadmap #4)

## Situation

This worktree (`cursor/8dfacfaf`) is at `63d07dc` — **13 commits behind `origin/main`**.  
The captureFile implementation landed in `origin/main` via the `frosty-mccarthy` PR (commit `edc50da`).  
All referenced files (`capture-file.ts`, `mock.ts`, updated `ipc.ts`, etc.) exist on `origin/main` but **not locally**.

## Step 1 — Sync the worktree

```bash
git merge origin/main
```

No code changes needed; this is a fast-forward-style merge.

## Step 2 — Run static checks

These all delegate through Turbo from the repo root:

```bash
pnpm typecheck   # turbo → tsc (node + web tsconfigs)
pnpm lint        # eslint --cache .
pnpm build       # turbo → electron-vite build
```

The transcript reports these passed. We re-run to confirm on the current worktree after merge.  
Known pre-existing noise: ESLint warnings in `generated/**` (documented in `CLAUDE.md` as not ours); ignore those.

## Step 3 — Verify correctness of key touchpoints

After merge, spot-check these files for spec compliance:

**Contract** — [`packages/contract/src/ipc.ts`](packages/contract/src/ipc.ts)
- `pipelineCaptureFile` channel name defined
- `PipelineApi.captureFile: (bytes: Uint8Array, name: string, mime?: string) => Promise<CaptureResult>`

**IPC plumbing** (all three must align):
- [`apps/desktop/src/main/worker/index.ts`](apps/desktop/src/main/worker/index.ts): `captureFile` handler calls `pipelineService.captureFile(bytes, name, mime)` with the right cast to `Uint8Array`
- [`apps/desktop/src/main/index.ts`](apps/desktop/src/main/index.ts): `IPC.pipelineCaptureFile` is in `DATA_CHANNELS`
- [`apps/desktop/src/preload/index.ts`](apps/desktop/src/preload/index.ts): bridge uses `ipcRenderer.invoke` (structured-clone preserves `Uint8Array`)

**Renderer helper** — [`apps/desktop/src/renderer/src/nimi/capture-file.ts`](apps/desktop/src/renderer/src/nimi/capture-file.ts)
- `kindOfFile(file)` returns `MemoryKind` via extension + MIME fallback
- `captureFiles(files)` skips zero-byte entries, swallows per-file errors, returns only successes

**Feed maw** — [`apps/desktop/src/renderer/src/nimi/feed.tsx`](apps/desktop/src/renderer/src/nimi/feed.tsx)
- `.maw` has `onDragOver/onDragLeave/onDrop` handlers
- `busy.current` ref acts as a semaphore (prevents concurrent captures)
- Hidden `<input type="file" multiple>` bound to `fileRef`

**Nav guard** — [`apps/desktop/src/renderer/src/nimi/NimiApp.tsx`](apps/desktop/src/renderer/src/nimi/NimiApp.tsx)
- `window.addEventListener('dragover', stop)` and `window.addEventListener('drop', stop)` are registered (not `document` — covers frameless window chrome)
- Listeners are cleaned up in the `useEffect` return

**Mock parity** — [`apps/desktop/src/renderer/src/nimi/mock.ts`](apps/desktop/src/renderer/src/nimi/mock.ts)
- `captureFile` present in `pipeline` section with inline kind derivation (no import from `capture-file.ts` to avoid circular dep)

**Deduplication** — [`apps/desktop/src/main/services/pipeline-service.ts`](apps/desktop/src/main/services/pipeline-service.ts)
- `capture()` calls `putRaw(bytes, ...)` to get content-hash id, then checks `db.select().from(items).where(eq(items.id, id))` before inserting — returns `{ created: false }` on duplicate

## Step 4 — Manual smoke test (Electron only, no CI)

```bash
NEEME_EMBEDDER=hash pnpm dev
```

| Scenario | Expected result |
|---|---|
| Drag a PDF onto the feed maw | Maw animates (eating), feed refreshes with the PDF entry, toast confirms capture |
| Pick a `.txt` via the add-sheet paperclip | File captured, feed entry added |
| Drop a PNG onto the maw | Entry appears with `kind: photo`; status may be `pending` (OCR not yet wired, roadmap #5) |
| Re-drop the same PDF | Feed does NOT get a duplicate (`created: false` from backend dedup via content hash) |
| Drag a file onto window chrome (outside maw) | Nothing happens — nav guard swallows it |

## Notes

- **No automated tests exist yet** (roadmap #7). All correctness is covered by TypeScript + manual smoke test.
- The ROADMAP item #4 should be marked `✅ done` in [`docs/ROADMAP.md`](docs/ROADMAP.md) after smoke-test passes.
- The add-sheet animation timing (`setPhase('done')` after 1.75 s) is intentionally decoupled from actual capture completion — UX-optimistic, capture runs in the background via `Promise.all`.
