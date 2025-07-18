# @mikan/utils

Utility functions and constants for the Mikan monorepo.

## Installation

```bash
pnpm add @mikan/utils
```

## Usage

```typescript
import { cn, FRAMER_MOTION_LIST_ITEM_VARIANTS } from '@mikan/utils'

// Use the cn utility for conditional class names
const className = cn('base-class', {
  active: isActive,
  disabled: isDisabled
})

// Use framer motion variants
const variants = FRAMER_MOTION_LIST_ITEM_VARIANTS
```

## Available Exports

### Functions

- `cn()` - Utility for combining class names with conditional logic

### Constants

- `FRAMER_MOTION_LIST_ITEM_VARIANTS` - Animation variants for list items
- `STAGGER_CHILD_VARIANTS` - Animation variants for staggered children
- `TAB_ITEM_ANIMATION_SETTINGS` - Animation settings for tab items

## Development

```bash
# Build the package
pnpm build

# Start development mode with watch
pnpm dev

# Run type checking
pnpm check-types

# Lint the code
pnpm lint
```

## License

ISC
