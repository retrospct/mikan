import { createContext, useContext } from 'react'
import type { BrandConfig } from '../types'
import { brand as activeBrand } from '../index'

// Context + hook live apart from the provider component so the renderer's
// react-refresh boundary stays clean (a file may export components OR shared
// values, not both).
export const BrandContext = createContext<BrandConfig>(activeBrand)

// Identity/copy access: useBrand().productName, .tagline, .urls.site, etc.
export function useBrand(): BrandConfig {
  return useContext(BrandContext)
}
