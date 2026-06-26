// Web/Electron adapter entry. DOM-dependent — imported via `@mikan/brand/web` so a
// React Native bundle can never accidentally pull in `document`.
export { applyBrandTheme, currentMode } from './theme'
export { BrandProvider } from './BrandProvider'
export { useBrand } from './useBrand'
