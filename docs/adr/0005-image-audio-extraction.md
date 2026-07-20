# ADR 0005 — Image + audio extraction (OCR / ASR)

**Status:** Accepted — implemented (roadmap #5)
**Date:** 2026-06-01
**Context owners:** jlee (+ Claude)
**Related:** extends [[0003-all-typescript-on-device-pipeline]] (capability→TS mapping); unblocks roadmap #5; feeds the same capture→chunk→embed→index path

## Problem

The pipeline extracts text from `text` and `pdf` items (via `unpdf`). **Images** (screenshots,
photos) and **audio** (voice memos) are captured but not turned into text — so they can't be
chunked, embedded, or searched, and they show as `pending` in the feed forever. This ADR
decides how to extract: OCR for images, ASR (transcription) for audio.

Unlike the drafting LLM (0004), on-device OCR/ASR is **mature and small**, and the privacy
case is strong (photos and voice are the most sensitive captures). So the on-device-first
default is easier to defend here than it was for drafting.

## Options considered

Legend: ✅ strong · ⚠️ caveats · ❌ poor

| Option                                                                                                  | Quality                | Offline | Privacy | Cross-platform | Notes                                                      |
| ------------------------------------------------------------------------------------------------------- | ---------------------- | ------- | ------- | -------------- | ---------------------------------------------------------- |
| A. On-device portable (`tesseract.js` OCR, `whisper.cpp`/`transformers.js` ASR) _(recommended default)_ | ⚠️→✅                  | ✅      | ✅      | ✅             | lazy-download models, runs in the worker like the embedder |
| B. macOS-native (Vision OCR, Speech ASR) _(recommended fast path on Mac)_                               | ✅                     | ✅      | ✅      | ❌ Mac-only    | free, fast, excellent; needs a tiny native module          |
| C. Cloud (vision OCR/caption, Whisper API / Deepgram)                                                   | ✅ (handwriting/noisy) | ❌      | ⚠️      | ✅             | best for hard cases; cost + network                        |
| D. Defer (keep image/audio capture-only)                                                                | —                      | —       | —       | —              | searchable corpus stays text/PDF-only                      |

### Notes

- **A** — the cross-platform floor. `tesseract.js` (WASM) and a Whisper build (`whisper.cpp`
  bindings or `transformers.js` whisper, ONNX — same `onnxruntime-node` we already ship) run
  in the **worker**, lazy-download their models, cache in userData. Slots into the existing
  `Extractor` path next to `unpdf`. Quality is fine for clean screenshots/clear speech.
- **B** — on macOS, the **Vision** (OCR) and **Speech** (ASR) frameworks are free, on-device,
  and beat tesseract/base-Whisper — at the cost of a small native module and being Mac-only.
  Since macOS is the happy path (per 0003's packaging note), it's worth wiring as an
  _accelerated path_ with A as the portable fallback.
- **C** — reserve for hard cases (handwriting, noisy audio) as a later **offload**, opt-in
  like the cloud drafter (0004). Not the default — defeats the privacy/offline win.
- **D** — only acceptable very short-term; it leaves a visible hole (voice memos / screenshots
  are core capture modes for a memory app).

## Recommendation

**On-device by default, behind an `Extractor`-per-type seam** (mirrors `Embedder`/`Drafter`):

- **Portable default (A):** `tesseract.js` for images, a Whisper build for audio — worker-side,
  lazy models, cached. Gets every platform to "searchable."
- **macOS fast path (B):** detect Darwin → use Vision/Speech for better quality, free. Tiny
  native module; fall back to A elsewhere.
- **Cloud (C) as a later opt-in offload** for hard inputs, gated by the same consent/key
  pattern as 0004's cloud drafter.

This keeps the most privacy-sensitive captures (photos, voice) **on the device** by default,
exactly the on-device-first intent of 0003, while leaving a quality escape hatch.

Same **measure-first** rule as 0004: ship on-device, benchmark against a quality bar (clean
screenshot OCR accuracy, clear-speech WER, latency on a low-end device), and cut a capability
to cloud only where it misses. On-device OCR/ASR is mature, so the bar should clear easily —
unlike drafting, this is the case least likely to ever need the cloud fallback.

## Consequences

- **Easier:** image/audio become first-class searchable memories; feed `pending → done`
  actually resolves; no new privacy exposure by default.
- **Harder:** more lazy-downloaded models (size/first-use latency — same playbook as the
  embedder); a macOS native module adds to the packaging matrix; HEIC decode for iPhone
  photos is the known image-prep risk flagged in 0003 (verify `sharp`/`heic-convert`).

## Open questions

- Whisper runtime: `whisper.cpp` native bindings vs `transformers.js` whisper on the
  `onnxruntime-node` we already have (one fewer addon)?
- Model sizes/tiers per device (tiny vs base vs small) — auto-pick by hardware?
- Do we caption images (VLM) in addition to OCR, or is OCR enough for v1 search?
- Where does extraction run in the lifecycle — at capture (blocks `done`) or async after?

## Action items

1. [x] Extend `extract.ts` with image + audio branches behind a per-type seam (`extractMedia`, routes to `ocr`/`asr` singletons).
2. [x] Portable path: `tesseract.js` (OCR) + `WhisperAsr` (transformers.js Whisper tiny + ffmpeg decode), lazy-load + cache under `userData/models/`.
3. [x] macOS Vision/Speech fast path via `mikan-extract.swift` CLI helper (`resources/mac/`); `NEEME_MAC_HELPER` injected by `worker/client.ts`; falls back to portable when helper absent or `NEEME_EXTRACTOR=portable`.
4. [x] HEIC decode handled: `TesseractOcr` converts HEIC → JPEG via `heic-convert` before Tesseract; `MacVisionOcr` reads HEIC natively via `CGImageSource`. **Note on native Speech ASR:** TCC authorization flows through the parent Electron app; on macOS, `SFSpeechRecognizer` with `requiresOnDeviceRecognition = true` runs entirely on-device. Falls back to portable Whisper if helper is absent.

### Env knobs

| Env var | Values | Default |
|---------|--------|---------|
| `NEEME_EXTRACTOR` | `off` / `portable` / unset | unset (native on darwin if helper exists) |
| `NEEME_OCR_LANG` | any tesseract lang code | `eng` |
| `NEEME_WHISPER_MODEL` | any Xenova/whisper-* model | `Xenova/whisper-tiny` |

### Build helper (macOS)

```bash
pnpm --filter @mikan/desktop build:mac-helper
# or directly:
swiftc resources/mac/mikan-extract.swift -O -target arm64-apple-macosx13.0 -o resources/mac/mikan-extract
```
