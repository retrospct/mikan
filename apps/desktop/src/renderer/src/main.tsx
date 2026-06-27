import './assets/main.css'

// Bundle the UI fonts locally (offline-first) so the renderer never fetches from
// Google Fonts — this is what lets the CSP drop the fonts.googleapis.com /
// fonts.gstatic.com origins. Weights mirror mikan.css's --sans/--mono usage
// (Hanken Grotesk 400/500/600/700, JetBrains Mono 400/500/600).
import '@fontsource/hanken-grotesk/400.css'
import '@fontsource/hanken-grotesk/500.css'
import '@fontsource/hanken-grotesk/600.css'
import '@fontsource/hanken-grotesk/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { configureClient } from '@mikan/contract/api/runtime'
import { applyBrandTheme, BrandProvider } from '@mikan/brand/web'

// t3-turbo pattern: app layer injects its env var into the shared client.
// Desktop uses VITE_NEEME_API_URL (statically replaced by electron-vite at build).
configureClient({ baseUrl: import.meta.env.VITE_NEEME_API_URL })

// Apply the active brand's tokens to :root before the first paint so brand-mapped
// utilities/vars resolve immediately (no flash). BrandProvider re-applies on
// light/dark changes and exposes the brand identity via useBrand().
applyBrandTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrandProvider>
      <App />
    </BrandProvider>
  </StrictMode>
)
