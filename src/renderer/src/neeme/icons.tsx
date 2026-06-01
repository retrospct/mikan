// icons.tsx — line icon set (1.6px stroke, round caps) + a few solid glyphs.
import type { CSSProperties, JSX, ReactNode } from 'react'

const NM_PATHS: Record<string, ReactNode> = {
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12M18 6L6 18" />
    </>
  ),
  check: (
    <>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </>
  ),
  chevDown: (
    <>
      <path d="M6 9.5l6 6 6-6" />
    </>
  ),
  chevUp: (
    <>
      <path d="M6 14.5l6-6 6 6" />
    </>
  ),
  chevLeft: (
    <>
      <path d="M14.5 6l-6 6 6 6" />
    </>
  ),
  chevRight: (
    <>
      <path d="M9.5 6l6 6-6 6" />
    </>
  ),
  arrowUp: (
    <>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </>
  ),
  back: (
    <>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </>
  ),

  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.7" />
      <path d="M4.5 17l4.5-4 4 3.2L17 12l3 3" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2L9 4.8h6L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="12.8" r="3.2" />
    </>
  ),
  file: (
    <>
      <path d="M7 3.5h7L19 8v12a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 1.5-1.5z" />
      <path d="M14 3.5V8h5" />
    </>
  ),
  note: (
    <>
      <path d="M6 3.5h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z" />
      <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4.5 7l7.5 5.5L19.5 7" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="15" rx="2.4" />
      <path d="M4 9.5h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 6 .4l2.5-2.5a4 4 0 0 0-5.6-5.6L11.5 7.5M14 10a4 4 0 0 0-6-.4L5.5 12.1a4 4 0 0 0 5.6 5.6L12.5 16.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M3.6 12h16.8M12 3.6c2.3 2.2 3.4 5.2 3.4 8.4s-1.1 6.2-3.4 8.4c-2.3-2.2-3.4-5.2-3.4-8.4S9.7 5.8 12 3.6z" />
    </>
  ),
  audio: (
    <>
      <path d="M4 12v0M8 8.5v7M12 5.5v13M16 8.5v7M20 11v2" />
    </>
  ),
  paperclip: (
    <>
      <path d="M17.5 8.5l-7.8 7.8a3 3 0 0 1-4.2-4.2l8.4-8.4a4.4 4.4 0 0 1 6.2 6.2l-8.2 8.2a5.8 5.8 0 0 1-8.2-8.2L11 3.4" />
    </>
  ),

  pin: (
    <>
      <path d="M9 3.5h6l-1 6 3.5 3v2H6.5v-2l3.5-3z" />
      <path d="M12 14.5V20.5" />
    </>
  ),
  pinFill: (
    <>
      <path d="M9 3.5h6l-1 6 3.5 3v2H6.5v-2l3.5-3z" fill="currentColor" stroke="none" />
      <path d="M12 14.5V20.5" />
    </>
  ),
  sweep: (
    <>
      <path d="M16.5 3.5l4 4M14 6l4 4-7.5 7.5-4-4zM6.5 13.5L4 20l6.5-2.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.4" />
      <path d="M16 16l4 4" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-.5 4M20 5v6h-6" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3.5c.6 3.7 1.8 4.9 5.5 5.5-3.7.6-4.9 1.8-5.5 5.5-.6-3.7-1.8-4.9-5.5-5.5 3.7-.6 4.9-1.8 5.5-5.5zM18.5 14.5c.3 1.8.9 2.4 2.7 2.7-1.8.3-2.4.9-2.7 2.7-.3-1.8-.9-2.4-2.7-2.7 1.8-.3 2.4-.9 2.7-2.7z" />
    </>
  ),
  lock: (
    <>
      <rect x="5.5" y="10.5" width="13" height="9" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  trash: (
    <>
      <path d="M5.5 7h13M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7M7 7l.8 12.2A1.5 1.5 0 0 0 9.3 20.6h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4l10-10-4-4L4 16zM14 6l4 4" />
    </>
  ),
  dots: (
    <>
      <circle cx="6" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="18" cy="12" r="1.4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  bolt: (
    <>
      <path d="M13 3.5L5.5 13.5H12l-1 7 7.5-10H12z" />
    </>
  ),
  layers: (
    <>
      <path d="M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4" />
    </>
  ),
  today: (
    <>
      <rect x="4" y="5.5" width="16" height="15" rx="2.4" />
      <path d="M4 9.5h16M8.5 3.5v4M15.5 3.5v4" />
      <path d="M8 14l2.5 2.5L16 11" />
    </>
  ),
  dayNext: (
    <>
      <rect x="4" y="5.5" width="16" height="15" rx="2.4" />
      <path d="M4 9.5h16M8.5 3.5v4M15.5 3.5v4" />
      <path d="M8.7 15h5.2M11.6 12.4l2.6 2.6-2.6 2.6" />
    </>
  ),
  archive: (
    <>
      <rect x="3.6" y="4.5" width="16.8" height="4.6" rx="1.4" />
      <path d="M5 9.1v8.9A1.5 1.5 0 0 0 6.5 19.5h11A1.5 1.5 0 0 0 19 18V9.1M9.7 12.6h4.6" />
    </>
  ),
  film: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.4" />
      <path d="M3.5 9.5h17M3.5 14.5h17M8 5v14M16 5v14" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 13.5L6 5.5a1.5 1.5 0 0 1 1.4-1.1h9.2A1.5 1.5 0 0 1 18 5.5l2 8M4 13.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-5.5M4 13.5h4l1.5 2.5h5L16 13.5h4" />
    </>
  ),
  feed: (
    <>
      <circle cx="6" cy="18" r="2" />
      <path d="M4 11a9 9 0 0 1 9 9M4 5a15 15 0 0 1 15 15" />
    </>
  ),
  play: (
    <>
      <path d="M8 5.5l11 6.5-11 6.5z" />
    </>
  ),
  stop: (
    <>
      <rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2.6" />
    </>
  ),
  heart: (
    <>
      <path d="M12 20s-7-4.5-9.2-9C1.3 8 3 4.5 6.3 4.5c2 0 3.2 1.2 3.7 2.2.5-1 1.7-2.2 3.7-2.2 3.3 0 5 3.5 3.5 6.5C19 15.5 12 20 12 20z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5l7 2.6v5.2c0 4.3-3 7.4-7 9.2-4-1.8-7-4.9-7-9.2V6.1z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  filter: (
    <>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    </>
  )
}

export type IconName = keyof typeof NM_PATHS

interface NIconProps {
  name: IconName | string
  size?: number
  stroke?: number
  fill?: string
  style?: CSSProperties
  className?: string
}

export function NIcon({
  name,
  size = 20,
  stroke = 1.6,
  fill = 'none',
  style,
  className
}: NIconProps): JSX.Element | null {
  const p = NM_PATHS[name]
  if (!p) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      aria-hidden="true"
    >
      {p}
    </svg>
  )
}
