/**
 * Mikan Design Tokens
 * Shared design system tokens across all applications
 */

// Export core tokens
export * from './colors.js'

// Export version-specific configurations
export * from './tailwind-v3.js'
export * from './tailwind-v4.js'

// Re-export for convenience
export { tailwindV3Theme as v3 } from './tailwind-v3.js'
export { tailwindV4Theme as v4 } from './tailwind-v4.js'
