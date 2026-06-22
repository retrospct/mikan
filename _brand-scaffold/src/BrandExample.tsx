// Example only — delete once you've seen the pattern. Shows the two ways the
// app reads brand: useBrand() for copy/identity, CSS variables for color.
import { useBrand } from './brand/BrandProvider';

export function BrandExample() {
  const brand = useBrand();

  return (
    <main
      style={{
        background: 'var(--brand-bg)',
        color: 'var(--brand-text)',
        minHeight: '100vh',
        padding: '3rem',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ margin: 0 }}>{brand.productName}</h1>
      <p style={{ color: 'var(--brand-text-muted)' }}>{brand.tagline}</p>

      <button
        style={{
          background: 'var(--brand-primary)',
          color: 'var(--brand-on-primary)',
          border: 'none',
          borderRadius: 10,
          padding: '0.6rem 1.1rem',
          fontSize: '1rem',
          cursor: 'pointer',
        }}
        // Note: same verb through the whole flow — this saves, so it says Save.
      >
        Save
      </button>

      <p style={{ marginTop: '2rem', color: 'var(--brand-text-muted)' }}>
        Building as <code>{brand.id}</code> · {brand.urls.site}
      </p>
    </main>
  );
}
