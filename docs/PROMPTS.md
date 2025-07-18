# Project Prompts

## Custom Cursor Commands

You can create AI prompts in Cursor’s custom command interface to automate workflows like:

### Command: Create Full Stack Feature

```text
You're working in a Turborepo monorepo. Add a new feature named "{featureName}".

1. In `apps/api`, create a new tRPC procedure under `src/router.ts` that returns mock data for "{featureName}".
2. In `apps/web`, create a React component at `src/features/{featureName}.tsx` that calls the tRPC procedure using `@trpc/react`.
3. Use `@ui/Button` in the new component to trigger the call.
4. Log the response to the console.
```

### Command: Refactor Utility

```text
Find all functions in `packages/utils/src/*.ts` that are not used in `apps/web` or `apps/api`. Delete them if unused. Otherwise, move them to grouped files by domain (e.g. string, date, math).
```

### Command: Generate Shared Component

```text
Create a reusable UI component named "{ComponentName}" in `packages/ui/src/{ComponentName}.tsx`.

- Use Tailwind styles
- Export as named export
- Include default props and types
- Add a Storybook story file in the same folder
```
