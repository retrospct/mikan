// feed.tsx — the "feed me" capture surface. Absorbing content is the fun part.
import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { NIcon } from './icons'
import { kindIcon } from './iconKind'
import { NimiMark } from './mark'
import { VoiceRecorder } from './voice'
import { data } from './api'
import { captureFiles, kindOfFile } from './capture-file'
import type { FedItem, MemoryKind } from '@nimi/contract/views'
import type { IconName } from './icons'

interface FeedKind {
  kind: MemoryKind
  label: string
  ico: IconName
}

const FEED_KINDS: FeedKind[] = [
  { kind: 'note', label: 'Note', ico: 'note' },
  { kind: 'photo', label: 'Photo', ico: 'image' },
  { kind: 'pdf', label: 'File', ico: 'file' },
  { kind: 'voice', label: 'Voice', ico: 'mic' },
  { kind: 'link', label: 'Link', ico: 'link' }
]
const SAMPLE_TITLES: Record<string, string> = {
  note: 'Quick note',
  photo: 'New photo',
  pdf: 'Document.pdf',
  voice: 'voice memo · 0:18',
  link: 'Saved link'
}
// manual quick-feed modes; files arrive via the dropzone (real) or picker
const FEED_MODES: FeedKind[] = [
  { kind: 'note', label: 'Note', ico: 'note' },
  { kind: 'voice', label: 'Voice', ico: 'mic' },
  { kind: 'link', label: 'Link', ico: 'link' }
]

export function FeedView({
  captureStyle,
  onCaptured,
  onRecordingChange
}: {
  captureStyle: string
  onCaptured?: () => void
  onRecordingChange?: (v: boolean) => void
}): JSX.Element {
  const [fed, setFed] = useState<FedItem[]>([])
  const [morsel, setMorsel] = useState<FeedKind | null>(null)
  const [eating, setEating] = useState(false)
  const [over, setOver] = useState(false)
  const [toast, setToast] = useState<{ msg: string } | null>(null)
  const [recording, setRecording] = useState(false)
  const busy = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    onRecordingChange && onRecordingChange(recording)
  }, [recording, onRecordingChange])

  // the real recent-capture feed (remounts on each tab switch, so it picks up
  // captures made elsewhere). The quick-feed buttons below stay an optimistic
  // prepend — they're a zero-input demo affordance with no content to persist.
  useEffect(() => {
    let cancelled = false
    void data.pipeline.feed().then((items) => {
      if (!cancelled) setFed(items)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const refreshFeed = (): void => {
    void data.pipeline.feed().then(setFed)
  }

  const handleFiles = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return
    if (busy.current) return
    busy.current = true

    // Show the first file as the "morsel" while eating
    const firstFile = files[0]!
    const firstKind = kindOfFile(firstFile)
    const k = FEED_KINDS.find((x) => x.kind === firstKind) || FEED_KINDS[0]!
    setMorsel(k)
    setEating(true)
    setOver(false)

    const results = await captureFiles(Array.from(files))
    setEating(false)
    setMorsel(null)

    if (results.length === 0) {
      setToast({ msg: 'Nothing captured — try a different file.' })
    } else {
      refreshFeed()
      setToast({
        msg:
          results.length === 1
            ? "Got it — that's in your memory now."
            : `Got all ${results.length} — filed into your memory.`
      })
      onCaptured && onCaptured()
    }

    setTimeout(() => setToast(null), 2200)
    setTimeout(() => {
      busy.current = false
    }, 900)
  }

  const feedOne = (kind: MemoryKind): void => {
    if (busy.current) return
    busy.current = true
    const k = FEED_KINDS.find((x) => x.kind === kind) || FEED_KINDS[0]!
    setMorsel(k)
    setEating(true)
    setOver(false)
    setTimeout(() => {
      setEating(false)
      setMorsel(null)
      const item: FedItem = {
        id: 'f' + Date.now(),
        kind,
        title: SAMPLE_TITLES[kind],
        when: 'Just now',
        status: 'pending'
      }
      setFed((f) => [item, ...f])
      setToast({ msg: "Got it — that's in your memory now." })
      onCaptured && onCaptured()
      setTimeout(
        () => setFed((f) => f.map((x) => (x.id === item.id ? { ...x, status: 'done' } : x))),
        1100
      )
      setTimeout(() => {
        busy.current = false
      }, 900)
      setTimeout(() => setToast(null), 2200)
    }, 1000)
  }

  return (
    <div className="view feed">
      <div className="scroll">
        {captureStyle !== 'tray' && (
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => void handleFiles(e.target.files)}
              onClick={(e) => {
                // reset so the same file can be re-picked after removal
                ;(e.target as HTMLInputElement).value = ''
              }}
            />
            <div
              className={'maw' + (over ? ' over' : '') + (eating ? ' eating' : '')}
              onClick={() => {
                if (captureStyle === 'voice') {
                  setRecording(true)
                } else {
                  fileRef.current?.click()
                }
              }}
              onDragOver={(e) => {
                e.preventDefault()
                if (!busy.current) setOver(true)
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setOver(false)
                void handleFiles(e.dataTransfer.files)
              }}
              onMouseEnter={() => !busy.current && setOver(true)}
              onMouseLeave={() => setOver(false)}
            >
              <NimiMark
                className="maw-mark"
                state={eating ? 'gathering' : over ? 'thinking' : 'idle'}
                size={64}
              />
              <div className="maw-tx">
                {eating ? (
                  <b>Filing it into your memory…</b>
                ) : captureStyle === 'voice' ? (
                  <>
                    Tap to <b>record a thought</b>. I&apos;ll transcribe and file it.
                  </>
                ) : (
                  <>Drop files here — or click to choose. PDFs, text, images, audio.</>
                )}
              </div>
              {!eating && <div className="maw-hint">Drag in · or click</div>}
              {morsel && (
                <div className="morsel-wrap">
                  <div className="morsel go">
                    <NIcon name={morsel.ico} size={16} style={{ color: 'var(--accent-ink)' }} />
                    {morsel.label}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <div className="feed-tools">
          {FEED_MODES.map((k) => (
            <button
              key={k.kind}
              className="feed-tool"
              onClick={() => (k.kind === 'voice' ? setRecording(true) : feedOne(k.kind))}
            >
              <NIcon name={k.ico} size={16} /> {k.label}
            </button>
          ))}
        </div>

        <div className="feed-hero below">
          <div className="feed-hero-h">Feed me a memory</div>
          <div className="feed-hero-s">
            Anything you give me, I&apos;ll remember — and quietly bring back when it&apos;s useful.
          </div>
        </div>

        <div className="fed-list">
          <div className="fed-hd">
            <NIcon name="clock" size={12} /> Lately fed
          </div>
          {fed.map((f) => {
            const isImg = f.kind === 'photo' || f.kind === 'screenshot'
            return (
              <div className="fed-row" key={f.id}>
                <div className={'fed-thumb' + (isImg ? ' img' : '')}>
                  {!isImg && <NIcon name={kindIcon(f.kind)} size={16} />}
                </div>
                <div className="fed-main">
                  <div className="fed-t">{f.title}</div>
                  <div className="fed-s">{f.when}</div>
                </div>
                <span className={'fed-stat ' + f.status}>
                  {f.status === 'done' ? 'Filed' : 'Reading…'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {toast && (
        <div className="toast">
          <NimiMark state="happy" size={22} />
          <span>{toast.msg}</span>
        </div>
      )}

      {recording && (
        <div className="ov-root">
          <div className="scrim" />
          <div className="sheet">
            <div className="sheet-grab" />
            <VoiceRecorder
              onStop={() => {
                setRecording(false)
                feedOne('voice')
              }}
              onDiscard={() => setRecording(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
