# Mikan

A minimalist daily to do AI assistant that proactively helps you get things done.

## Views & Pages

- Home
  - Default view: Minimalist to do list using @today-card.png as inspiration with to do tasks and minimal indicators of associated context and AI drafts.
  - To Do - expanded view: clicking on a To Do item expands a UI with added UI/UX for managing currently associated context, options to add more context, view AI drafts AI input.
- Next: Same style as Home but using @next-card.png as inspiration with added UI/UX for managing associated context and AI input.
- Capture: A quick capture input similar to the [lazy.so](https://lazy.so) UI but more focus an intuitive and easy UI to add links, screenshots, files, @context-from-integration, and/or @context-from-mcp.
- Sign up/Login
- Settings
  - Personal Context
    - Permissions
    - Manage local context
    - Manage vector DB context (TBD, if needed)
    - Manage MCP integrations
    - Manage other integrations
  - Selfs: user writing styles and personalizations generated from personal context or user created.
    - Professional
    - Friends
    - Family
    - My Boss (style used to generate content from me to my boss)
    - {{ insert more examples here }}
  - Preferences
    - Profile
    - Security
    - Advanced

## Key Features

1. Capture context, quickly and without friction be able to:
   1. Quickly capture/input content like links, documents, images, videos, audio, and text
   2. Uses sources like a quick capture UI, MCP servers, files, folders, screenshots, meetings, integrations, tweets, emails, messages, and calendars
2. Uses AI to create your personal productivity context:
   1. Automatically associates relevant content to a to do task
   2. Organizes associated and unassociated content
   3. Enrich to do tasks with content data
   4. Allow for manually adding content to a to do task
3. Your AI productivity companion:
   1. Drafts: proactively encourages you to start a task by getting it started for you. A draft is the AI's attempt at completing a task. It helps get the ball rolling, starting a task is often the hardest part.
      1. When it can, it will draft email or message replies, summaries, outlines, research, web search, RAG search, meeting invites, and other content for your review and iteration.
      2. Draft creation have two modes: autonomous and on-demand modes.
      3. There is UI for user review and iteration of a draft through prompting and adding context with suggested prompt quick action buttons.
      4. Drafts have version history that can be rolled back to like checkpoints.
      5. It uses your writing style and tone based off recommended and available style/personalizations.
      6. It does not nag and it is not annoying. It's your companion to getting things done.
   2. Organizes your content and to do tasks so you don't have to. Make productivity apps productive and not time wasted tagging, sorting, assigning, and organizing your tasks.

## What's inside?

This Turborepo includes the following packages/apps:

### Apps

- `desktop`: a [Electron.js](https://electronjs.org/) app with [Tailwind CSS](https://tailwindcss.com/)
- `home`: a public marketing & landing website [Next.js](https://nextjs.org/) app with [Tailwind CSS](https://tailwindcss.com/)
- `mobile`: a [React Native](https://reactnative.dev/) app with [Expo](https://expo.dev/)
- `web`: a [Next.js](https://nextjs.org/) app with [Tailwind CSS](https://tailwindcss.com/)

### Packages

- `@mikan/ui`: a stub React component library with [Tailwind CSS](https://tailwindcss.com/) shared by both `web` and `electron` applications
- `@mikan/tailwind-config`: shared tailwind configs for packages & apps using `@mikan/ui`
- `@mikan/eslint-config`: `eslint` configurations (includes `eslint-config-next` and `eslint-config-prettier`)
- `@mikan/typescript-config`: `tsconfig.json`s used throughout the monorepo

### Building Packages

[@mikan/ui build details](./packages/ui/README.md)

### Utilities

This Turborepo has some additional tools already setup for you:

- [Tailwind CSS](https://tailwindcss.com/) for styles
- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [ESLint](https://eslint.org/) for code linting
- [Prettier](https://prettier.io) for code formatting
