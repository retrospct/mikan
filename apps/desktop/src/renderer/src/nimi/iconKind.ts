// iconKind.ts — map a memory/content kind to an icon name.
// Kept in its own (component-free) module so icons.tsx can export only the <NIcon>
// component, satisfying react-refresh/only-export-components.
import type { IconName } from './icons'
import type { MemoryKind } from '@mikan/contract/views'

export const KIND_ICON: Record<string, IconName> = {
  note: 'note',
  text: 'note',
  pdf: 'file',
  doc: 'file',
  txt: 'file',
  image: 'image',
  photo: 'image',
  screenshot: 'image',
  voice: 'audio',
  audio: 'audio',
  video: 'film',
  mp4: 'film',
  zip: 'archive',
  email: 'mail',
  calendar: 'calendar',
  event: 'calendar',
  link: 'link',
  web: 'globe'
}
export const kindIcon = (k: MemoryKind | string): IconName => KIND_ICON[k] || 'file'
