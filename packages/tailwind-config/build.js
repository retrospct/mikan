#!/usr/bin/env node

import { tailwindV4ThemeCSS } from '@mikan/design-tokens/v4'
import { writeFileSync } from 'fs'

/**
 * Build script to generate shared-styles.css from design tokens
 */

const css = `@import 'tailwindcss';

@theme {
${tailwindV4ThemeCSS}
}
`

writeFileSync('shared-styles.css', css)
console.log('✅ Generated shared-styles.css from design tokens')
