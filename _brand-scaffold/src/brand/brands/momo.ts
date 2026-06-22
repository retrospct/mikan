import identity from '../identity.json';
import type { BrandConfig } from '../types';

// Momo = peach. Softer and pinker than Mikan: blush ground, coral primary,
// a rose accent in place of Mikan's leaf-green. Placeholder until Momo
// graduates from contender to a brand you're actually shipping.
export const momo: BrandConfig = {
  id: 'momo',
  productName: identity.momo.productName,
  appId: identity.momo.appId,
  icon: identity.momo.icon,
  tagline: 'Your private, searchable memory.',
  urls: {
    site: 'https://getmomo.now',
    support: 'https://getmomo.now/support',
  },
  theme: {
    bg: '#FFF8F5',
    surface: '#FFFFFF',
    surfaceMuted: '#FDEFEA',
    border: '#F3DDD4',
    text: '#241B17',
    textMuted: '#6E5A50',
    primary: '#EF7E66',
    primaryHover: '#D9684F',
    onPrimary: '#FFFFFF',
    accent: '#E27D9A',
    success: '#3F8F5B',
    warning: '#E0A100',
    danger: '#DC2626',
    ring: '#EF7E66',
  },
};
