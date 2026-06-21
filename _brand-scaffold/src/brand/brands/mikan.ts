import identity from '../identity.json';
import type { BrandConfig } from '../types';

// Mikan = mandarin orange. Bright citrus rind, warm paper-white ground,
// a single leaf-green accent. Clean and a little playful.
export const mikan: BrandConfig = {
  id: 'mikan',
  productName: identity.mikan.productName,
  appId: identity.mikan.appId,
  icon: identity.mikan.icon,
  tagline: 'Your private, searchable memory.',
  urls: {
    site: 'https://getmikan.com',
    support: 'https://getmikan.com/support',
  },
  theme: {
    bg: '#FFFCF7',
    surface: '#FFFFFF',
    surfaceMuted: '#FBF3EA',
    border: '#ECE0D2',
    text: '#211A14',
    textMuted: '#6B5D50',
    primary: '#F2741A',
    primaryHover: '#D8610E',
    onPrimary: '#FFFFFF',
    accent: '#3F8F5B',
    success: '#3F8F5B',
    warning: '#E0A100',
    danger: '#DC2626',
    ring: '#F2741A',
  },
};
