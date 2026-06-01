// mark.tsx — the Neeme mark: a monoline rounded-diamond node whose dot-grid
// fills in as it thinks; the frame rotates subtly while it's working.
// states: idle | thinking | gathering | drafting | happy | done
import { useEffect, useState } from 'react'
import type { CSSProperties, JSX, ReactNode } from 'react'
import type { NeemeMarkState } from './types'

const NM_DOTS: Array<[number, number]> = [
  [7.7, 7.7],
  [12, 7.7],
  [16.3, 7.7],
  [7.7, 12],
  [12, 12],
  [16.3, 12],
  [7.7, 16.3],
  [12, 16.3],
  [16.3, 16.3]
]
const NM_QUINCUNX = new Set([0, 2, 4, 6, 8])
// center-out fill order: center, corners (→ quincunx), then edges (→ full grid)
const NM_FILL_ORDER = [4, 0, 2, 6, 8, 1, 3, 5, 7]

interface NeemeMarkProps {
  state?: NeemeMarkState
  size?: number
  fill?: number | null
  style?: CSSProperties
  className?: string
}

export function NeemeMark({
  state = 'idle',
  size = 34,
  fill = null,
  style,
  className = ''
}: NeemeMarkProps): JSX.Element {
  const fixed = fill != null
  const onSet = fixed ? new Set(NM_FILL_ORDER.slice(0, Math.max(0, Math.min(9, fill)))) : null
  return (
    <span
      className={`nm ${fixed ? 'nm-fixed ' : ''}${className}`}
      data-state={state}
      style={{ '--nm-size': size + 'px', ...(style || {}) } as CSSProperties}
      aria-hidden="true"
    >
      <svg className="nm-svg" viewBox="0 0 24 24" width={size} height={size}>
        <g className="nm-spin">
          <rect
            className="nm-dia"
            x="4.7"
            y="4.7"
            width="14.6"
            height="14.6"
            rx="4.1"
            transform="rotate(45 12 12)"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </g>
        <g className="nm-dots">
          {NM_DOTS.map((d, i) => (
            <circle
              key={i}
              className={
                'nm-dot' + (NM_QUINCUNX.has(i) ? ' q' : '') + (onSet && onSet.has(i) ? ' on' : '')
              }
              cx={d[0]}
              cy={d[1]}
              r="1.15"
              fill="currentColor"
              style={{ '--di': i } as CSSProperties}
            />
          ))}
        </g>
      </svg>
    </span>
  )
}

// A small "Neeme is thinking…" status line with the mark + animated copy.
export function NeemeSay({
  state = 'thinking',
  size = 22,
  children
}: {
  state?: NeemeMarkState
  size?: number
  children: ReactNode
}): JSX.Element {
  return (
    <span className="nm-status">
      <NeemeMark state={state} size={size} />
      <span className="lbl">{children}</span>
    </span>
  )
}

// A quiet line in Neeme's voice: ready / open question / waiting on content.
// kind: ready | ask | wait | gathered | done
export function NeemeNote({
  kind = 'gathered',
  children
}: {
  kind?: 'ready' | 'ask' | 'wait' | 'gathered' | 'done'
  children: ReactNode
}): JSX.Element {
  const done = kind === 'ready' || kind === 'done'
  return (
    <span className={'nnote nnote-' + kind}>
      <NeemeMark state={done ? 'done' : 'idle'} fill={done ? 9 : null} size={14} />
      <span className="nnote-tx">{children}</span>
    </span>
  )
}

// Animated ellipsis
export function Dots(): JSX.Element {
  const [n, setN] = useState(1)
  useEffect(() => {
    const id = setInterval(() => setN((x) => (x % 3) + 1), 420)
    return () => clearInterval(id)
  }, [])
  return <span style={{ width: '1.1em', display: 'inline-block' }}>{'.'.repeat(n)}</span>
}
