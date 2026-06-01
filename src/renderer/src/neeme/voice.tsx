// voice.tsx — the voice capture recorder. Uniform bars do a staggered
// scaleY wave (the envelope that reads as "listening"), with REC + timer.
// Lifted from the Mr. Matcha composer the team liked, restyled for Neeme.
import { useEffect, useState } from 'react'
import type { CSSProperties, JSX, ReactNode } from 'react'
import { NIcon } from './icons'

interface VoiceRecorderProps {
  onStop: (secs: number) => void
  onDiscard: () => void
  hint?: ReactNode
}

export function VoiceRecorder({ onStop, onDiscard, hint }: VoiceRecorderProps): JSX.Element {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const mm = String(Math.floor(secs / 60))
  const ss = String(secs % 60).padStart(2, '0')
  const bars = Array.from({ length: 38 })
  return (
    <div className="vrec">
      <div className="vrec-head">
        <span className="vrec-rec">
          <i />
          REC
        </span>
        <span className="vrec-time mono">
          {mm}:{ss}
        </span>
      </div>
      <div className="vrec-wave" aria-hidden="true">
        {bars.map((_, i) => (
          <span key={i} style={{ animationDelay: `${(i % 9) * 0.09}s` } as CSSProperties} />
        ))}
      </div>
      <p className="vrec-hint">
        {hint || <>Listening… speak naturally, I&apos;m transcribing privately.</>}
      </p>
      <div className="vrec-actions">
        <button className="vrec-discard" onClick={onDiscard}>
          <NIcon name="trash" size={16} />
          <span className="ovr">Discard</span>
        </button>
        <button className="vrec-stop" onClick={() => onStop(secs)} aria-label="Stop and transcribe">
          <NIcon name="stop" size={22} fill="currentColor" stroke={0} />
        </button>
        <div className="vrec-spacer" />
      </div>
    </div>
  )
}
