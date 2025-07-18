---
description: Next.js web app - App Router patterns, SSR/SSG, API routes, and performance
globs: apps/web/**/*.ts, apps/web/**/*.tsx, apps/web/**/*.js, apps/web/next.config.ts
---

# Next.js Web App Rules

## App Router Architecture

### Component Types

**Server Components (default)**: Use for static content, data fetching, and SEO

```tsx
// No 'use client' directive - runs on server
export default async function Page() {
  const data = await fetchData() // Direct async/await
  return <div>{data}</div>
}
```

**Client Components**: Use only when needed for interactivity

```tsx
'use client' // Required at top of file

import { useState } from 'react'

export default function InteractiveComponent() {
  const [state, setState] = useState()
  // Client-side logic
}
```

### When to Use Client Components

Only use `'use client'` when you need:

- React hooks (useState, useEffect, etc.)
- Browser APIs (window, document, localStorage)
- Event handlers (onClick, onChange)
- Third-party client libraries

## File Organization

### App Directory Structure

```
app/
├── (auth)/          # Route groups (no URL impact)
│   ├── login/
│   └── register/
├── api/             # API routes
│   └── trpc/        # tRPC endpoints
├── tasks/           # Feature routes
│   ├── [id]/        # Dynamic routes
│   └── page.tsx
├── layout.tsx       # Root layout
├── page.tsx         # Home page
└── globals.css      # Global styles
```

### Naming Conventions

- `page.tsx` - Page component (creates route)
- `layout.tsx` - Shared layout wrapper
- `loading.tsx` - Loading UI
- `error.tsx` - Error boundary
- `not-found.tsx` - 404 page
- `route.ts` - API route handler

## Data Fetching Patterns

### Server Components (Preferred)

```tsx
// Automatic request deduplication
async function getTasks() {
  const res = await fetch('https://api.example.com/tasks', {
    next: { revalidate: 3600 } // ISR: revalidate every hour
  })
  return res.json()
}

export default async function TasksPage() {
  const tasks = await getTasks()
  return <TaskList tasks={tasks} />
}
```

### Client-Side Fetching (When Needed)

```tsx
'use client'
// Use tRPC for type-safe API calls
import { trpc } from '@/lib/trpc'

export function TaskManager() {
  const { data, isLoading } = trpc.tasks.getAll.useQuery()
  const createTask = trpc.tasks.create.useMutation()

  // Handle loading and mutations
}
```

## API Routes with tRPC

### Route Handler Pattern

```typescript
// app/api/trpc/[trpc]/route.ts
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '@/server/routers/_app'

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => ({})
  })

export { handler as GET, handler as POST }
```

### Server Actions (Alternative to API Routes)

```tsx
// app/actions/tasks.ts
'use server'

import { revalidatePath } from 'next/cache'

export async function createTask(formData: FormData) {
  // Validate and process
  await db.task.create({ data: {...} })

  revalidatePath('/tasks')
}
```

## Performance Optimization

### Image Optimization

```tsx
import Image from 'next/image'

// Always use next/image for automatic optimization
;<Image
  src="/hero.jpg"
  alt="Description"
  width={1200}
  height={600}
  priority // For above-fold images
  placeholder="blur" // With blurDataURL
/>
```

### Font Optimization

```tsx
// Use next/font for automatic optimization
import { Geist, Geist_Mono } from 'next/font/google'

const geist = Geist({
  subsets: ['latin'],
  display: 'swap' // Prevent FOIT
})
```

### Dynamic Imports

```tsx
// Lazy load heavy components
import dynamic from 'next/dynamic'

const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <Skeleton />,
  ssr: false // Disable SSR if not needed
})
```

## SEO & Metadata

### Static Metadata

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Mikan | AI-powered minimalist daily todo app',
  description: 'Get things done with AI assistance',
  openGraph: {
    title: 'Mikan',
    description: 'AI-powered minimalist daily todo app',
    images: ['/og-image.png']
  }
}
```

### Dynamic Metadata

```tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const task = await getTask(params.id)

  return {
    title: `${task.title} | Mikan`,
    description: task.description
  }
}
```

## State Management

### Component State

- Use React hooks for local state
- Lift state only when necessary
- Consider URL state for shareable UI state

### Global State (When Needed)

```tsx
// Prefer tRPC query cache over global state
// If needed, use Zustand or Jotai (lighter than Redux)
import { create } from 'zustand'

const useStore = create((set) => ({
  tasks: [],
  addTask: (task) =>
    set((state) => ({
      tasks: [...state.tasks, task]
    }))
}))
```

## Styling Guidelines

- Use Tailwind CSS classes directly (no ui: prefix in apps)
- Support dark mode by default
- Use CSS Modules for component-specific styles if needed
- Maintain consistent spacing and color scales

## Environment Variables

```typescript
// Always validate environment variables
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEXT_PUBLIC_API_URL: z.string().url()
})

export const env = envSchema.parse(process.env)
```

## Build Configuration

### Fix Build Issues

**IMPORTANT**: Remove these from next.config.ts:

```typescript
// ❌ Don't ignore errors
typescript: {
  ignoreBuildErrors: true
}
eslint: {
  ignoreDuringBuilds: true
}
```

### Proper Error Handling

- Fix TypeScript errors before committing
- Address ESLint warnings
- Use proper error boundaries

## Testing Strategy

- Unit tests for utilities and hooks
- Integration tests for API routes
- E2E tests with Playwright for critical user flows
- Visual regression tests for UI components

## Deployment Considerations

- Optimize for Vercel deployment
- Use Edge Runtime for lightweight API routes
- Configure proper caching headers
- Monitor Core Web Vitals

## Security Best Practices

- Validate all user inputs
- Use CSRF protection for mutations
- Implement rate limiting on API routes
- Sanitize data before rendering
- Use Content Security Policy headers
