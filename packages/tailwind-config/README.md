# @mikan/tailwind-config

Shared Tailwind CSS configuration for the Mikan monorepo, powered by `@mikan/design-tokens`.

## Overview

This package provides a consistent Tailwind CSS configuration that generates CSS custom properties from the centralized design tokens. It ensures all applications in the monorepo use the same design system values.

## Usage

### In CSS/SCSS files:

```css
@import '@mikan/tailwind-config';
```

### In PostCSS configuration:

```javascript
import postcssConfig from '@mikan/tailwind-config/postcss'

export default postcssConfig
```

## Development

### Building

The CSS file is generated from design tokens using:

```bash
pnpm build
```

### Watch mode

For development, you can watch for changes to design tokens:

```bash
pnpm dev
```

## Generated Design Tokens

The package generates CSS custom properties for:

- **Brand colors**: `--color-blue-1000`, `--color-purple-1000`, `--color-red-1000`
- **Gray palette**: `--color-gray-50` through `--color-gray-950`
- **Task status colors**: `--color-task-*-bg/border/text` for different task states
- **Spacing**: Custom spacing values like `--spacing-18`, `--spacing-88`
- **Typography**: Font family variables for Geist and Geist Mono

## Integration

This package automatically stays in sync with `@mikan/design-tokens`. When design tokens are updated, rebuild this package to get the latest values.

## Apps Using This Package

- **Web**: Next.js app with Tailwind CSS v4
- **Desktop**: Electron app with Tailwind CSS v4
- **Docs**: Documentation site with Tailwind CSS v4
