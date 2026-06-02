import './assets/main.css'

// Bundle the UI fonts locally (offline-first) so the renderer never fetches from
// Google Fonts — this is what lets the CSP drop the fonts.googleapis.com /
// fonts.gstatic.com origins. Weights mirror nimi.css's --sans/--mono usage
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
