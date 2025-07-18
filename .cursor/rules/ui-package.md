---
description: Shared UI package - component patterns, Tailwind conventions, and accessibility standards
globs: packages/ui/**/*.tsx, packages/ui/**/*.ts, packages/ui/**/*.css
---

# Shared UI Package Rules

## Component Architecture

### Component Guidelines

- **TypeScript Required**: All components must be written in TypeScript with proper types
- **Functional Components**: Use function components with TypeScript interfaces for props
- **Single Responsibility**: Each component should have one clear purpose
- **Composability**: Design components to work together seamlessly

### File Structure

```
packages/ui/src/
├── component-name.tsx      # Component implementation
├── component-types.ts      # Shared types/interfaces
├── index.ts               # Public exports
└── styles.css             # Global styles (minimal)
```

## Styling Conventions

### Tailwind CSS Prefix

**CRITICAL**: All Tailwind classes MUST use the `ui:` prefix to prevent class conflicts.

```tsx
// ✅ Correct
<div className="ui:rounded-lg ui:bg-white ui:p-4">

// ❌ Wrong - will cause conflicts
<div className="rounded-lg bg-white p-4">
```

### Styling Rules

1. Use Tailwind utility classes with `ui:` prefix
2. Avoid inline styles except for dynamic positioning
3. Group related utilities logically
4. Use consistent spacing scale
5. Support dark mode by default

### Responsive Design

```tsx
// Mobile-first responsive design
<div className="ui:w-full ui:px-4 md:ui:w-2/3 md:ui:px-8 lg:ui:w-1/2">
```

## Component Patterns

### Props Interface Pattern

```tsx
export interface ComponentNameProps {
  // Required props first
  title: string
  onAction: (value: string) => void

  // Optional props with defaults
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
  className?: string // For additional styling
  children?: ReactNode
}

export function ComponentName({
  title,
  onAction,
  variant = 'primary',
  size = 'md',
  className,
  children
}: ComponentNameProps) {
  // Implementation
}
```

### Accessibility Requirements

**MANDATORY**: All interactive components must be accessible.

```tsx
// ✅ Accessible button
<button
  onClick={handleClick}
  aria-label="Delete task"
  aria-pressed={isActive}
  className="ui:p-2 ui:rounded hover:ui:bg-gray-100"
>

// ✅ Accessible form input
<input
  type="text"
  id="task-title"
  aria-label="Task title"
  aria-describedby="task-title-error"
  className="ui:border ui:rounded"
/>
```

### Icon Usage

- Use `lucide-react` for all icons
- Always provide accessible labels
- Consistent sizing with text

```tsx
import { Check, X } from 'lucide-react'

;<Check className="ui:w-4 ui:h-4" aria-hidden="true" />
```

## State Management

- Keep component state minimal
- Lift state up when shared between components
- Use controlled components pattern
- Avoid internal state when possible

## Type Safety

### Export All Types

```tsx
// component-name.tsx
export interface ComponentNameProps { ... }
export type ComponentVariant = 'primary' | 'secondary'

// index.ts
export { ComponentName } from './component-name'
export type { ComponentNameProps, ComponentVariant } from './component-name'
```

### Strict Event Handlers

```tsx
// Always type event handlers
onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
onChange: (value: string) => void
onSubmit: (data: FormData) => void
```

## Animation & Transitions

- Use CSS transitions for simple animations
- Keep animations subtle and purposeful
- Respect `prefers-reduced-motion`

```tsx
className = 'ui:transition-colors ui:duration-150 hover:ui:bg-gray-100 motion-reduce:ui:transition-none'
```

## Component Documentation

Each component should include:

- JSDoc comments for public APIs
- Usage examples in comments
- Props documentation

```tsx
/**
 * TaskCard - Displays a task with status and actions
 *
 * @example
 * <TaskCard
 *   task={task}
 *   onStatusChange={handleStatusChange}
 *   onDelete={handleDelete}
 * />
 */
export function TaskCard({ ... }: TaskCardProps) { ... }
```

## Testing Requirements

- Unit tests for all utility functions
- Component tests for interactive behavior
- Accessibility tests (using Testing Library)
- Visual regression tests for critical components

## Bundle Optimization

- Tree-shakeable exports
- No side effects except styles
- Minimal dependencies
- Proper peer dependencies

## Platform Considerations

- Components should work in all app contexts (web, desktop)
- No platform-specific code in shared components
- Use feature detection, not platform detection

## Common Components to Build

Priority components for the Mikan project:

- Task components (TaskCard, TaskList, TaskIcon)
- Form elements (Input, Textarea, Select, Checkbox)
- Layout components (Container, Stack, Grid)
- Feedback (Toast, Alert, Loading)
- Navigation (Tabs, Menu, Breadcrumb)
- Overlay (Modal, Popover, Tooltip)
