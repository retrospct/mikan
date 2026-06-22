import { useEffect, type ReactNode } from 'react'
import { brand as activeBrand } from '../index'
import { applyBrandTheme, currentMode } from './theme'
import { BrandContext } from './useBrand'

// Wrap the renderer root once. On mount it applies the active brand's tokens as
// CSS variables on :root (so utilities like `bg-brand` resolve everywhere, not
// just under a wrapper), sets the window title from the brand, and re-applies the
// vars whenever the app flips <html data-theme>. Components read colour with
// var(--brand-*) / Tailwind utilities and copy with useBrand() — nothing
// downstream knows which brand it is.
export function BrandProvider({ children }: { children: ReactNode }): ReactNode {
  useEffect(() => {
    applyBrandTheme(currentMode())
    document.title = activeBrand.productName

    // Re-apply when the renderer toggles light/dark so brand vars track the mode.
    const observer = new MutationObserver(() => applyBrandTheme(currentMode()))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    })
    return () => observer.disconnect()
  }, [])

  return <BrandContext.Provider value={activeBrand}>{children}</BrandContext.Provider>
}
