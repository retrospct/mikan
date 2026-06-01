// celebrate.tsx — the "all five, done" payoff. The day's pieces assemble into one.
import { useState } from 'react'
import type { CSSProperties, JSX } from 'react'
import { NIcon } from './icons'
import { NeemeMark } from './mark'

interface ConfPiece {
  x: number
  d: number
  r: number
  s: number
  dur: number
}

// Randomised confetti scatter. Lives at module scope (not in render) so the
// random draw is pure-by-the-rules; fed once through a useState lazy initializer.
function makeConfetti(): ConfPiece[] {
  return Array.from({ length: 18 }).map(() => ({
    x: (Math.random() * 2 - 1) * 150,
    d: Math.random() * 0.5,
    r: (Math.random() * 2 - 1) * 320,
    s: 0.5 + Math.random() * 0.7,
    dur: 1.5 + Math.random() * 1.3
  }))
}

export function AllDone({
  count = 5,
  onPlan,
  onClose
}: {
  count?: number
  onPlan: () => void
  onClose: () => void
}): JSX.Element {
  const [conf] = useState(makeConfetti)
  const shards = [0, 1, 2, 3, 4].map((i) => {
    const ang = ((-90 + i * 72) * Math.PI) / 180
    return { sx: Math.cos(ang) * 64, sy: Math.sin(ang) * 64 }
  })
  return (
    <div className="win">
      <div className="win-scrim" onClick={onClose} />
      <div className="win-card">
        <div className="win-stage">
          {shards.map((s, i) => (
            <span
              key={i}
              className="win-shard"
              style={
                {
                  '--sx': s.sx + 'px',
                  '--sy': s.sy + 'px',
                  animationDelay: i * 0.05 + 's'
                } as CSSProperties
              }
            >
              <NeemeMark state="done" fill={9} size={22} />
            </span>
          ))}
          <span className="win-big">
            <NeemeMark state="happy" fill={9} size={86} />
          </span>
          {conf.map((c, i) => (
            <span
              key={i}
              className={'win-conf' + (i % 2 ? ' alt' : '')}
              style={
                {
                  '--cx': c.x + 'px',
                  '--cr': c.r + 'deg',
                  '--cs': c.s,
                  animationDelay: 0.55 + c.d + 's',
                  animationDuration: c.dur + 's'
                } as CSSProperties
              }
            />
          ))}
        </div>
        <div className="win-h">{count >= 5 ? 'All five. Done.' : "That's everything."}</div>
        <div className="win-s">
          A full, honest day — everything you set out to do. Rest easy, or line up tomorrow.
        </div>
        <div className="win-actions">
          <button className="btn primary" onClick={onPlan}>
            <NIcon name="today" size={16} /> Plan tomorrow
          </button>
          <button className="btn ghost" onClick={onClose}>
            Bask a moment
          </button>
        </div>
      </div>
    </div>
  )
}
