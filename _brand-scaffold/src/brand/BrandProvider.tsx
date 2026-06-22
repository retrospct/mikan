import {
  createContext,
  useContext,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { BrandConfig } from './types';
import { brand as activeBrand } from './index';
import { brandCssVars } from './theme';

const BrandContext = createContext<BrandConfig>(activeBrand);

// Wrap the app once. Injects the active brand's tokens as CSS variables on a
// wrapper element and exposes the config via useBrand(). Components then read
// colors with var(--brand-primary) and copy with useBrand().productName, so
// nothing downstream knows which brand it is.
export function BrandProvider({ children }: { children: ReactNode }) {
  const style = useMemo(
    () => brandCssVars(activeBrand.theme) as CSSProperties,
    [],
  );
  return (
    <BrandContext.Provider value={activeBrand}>
      <div data-brand={activeBrand.id} style={style}>
        {children}
      </div>
    </BrandContext.Provider>
  );
}

export function useBrand(): BrandConfig {
  return useContext(BrandContext);
}
