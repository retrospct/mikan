---
description: Mikan monorepo root - general project conventions and architecture
globs: turbo.json, package.json, pnpm-workspace.yaml, cliff.toml, README.md, scripts/**
---

# Mikan Monorepo Conventions

## Project Overview

Mikan is a minimalist AI-powered daily to-do assistant built as a Turborepo monorepo. The project emphasizes speed, privacy, and proactive assistance to help users get things done without friction.

## Architecture Principles

- **Monorepo Structure**: Use Turborepo with pnpm workspaces for efficient builds and dependency management
- **Shared First**: Prioritize shared packages (@mikan/\*) for code reuse across apps
- **TypeScript Everywhere**: All code should be TypeScript with strict type checking
- **Performance Focus**: Prioritize speed and minimal bundle sizes across all platforms

## Development Workflow

1. **Package Manager**: Always use `pnpm` (never npm or yarn)
2. **Dependencies**: Add shared dependencies to root, app-specific to individual apps
3. **Scripts**: Use turbo commands for parallel execution (e.g., `pnpm turbo build`)
4. **Imports**: Use workspace protocol for internal packages (e.g., `"@mikan/ui": "workspace:*"`)

## Code Standards

- **Framework**: React with TypeScript for all UI applications
- **Styling**: Tailwind CSS with shared config from @mikan/tailwind-config
- **Components**: Build reusable components in @mikan/ui, platform-specific in apps
- **State Management**: Keep it simple - React hooks first, add complexity only when needed
- **Testing**: Vitest for unit tests, Playwright for E2E (when configured)

## AI Integration Guidelines

- Design for local-first privacy when possible
- Consider vector DB security if cloud storage is needed
- Use AI SDK for LLM integrations
- Keep AI responses fast and non-intrusive

## Versioning & Releases

- Use git-cliff for changelog generation (`pnpm run version-update`)
- Follow conventional commits for automatic versioning
- Release with `pnpm run release`

## Package Creation Pattern

When creating new packages:

1. Add to packages/ directory
2. Include proper package.json with workspace protocol
3. Add TypeScript config extending @mikan/typescript-config
4. Include README with purpose and usage
5. Export from src/index.ts

## Key Commands

- `pnpm install` - Install all dependencies
- `pnpm turbo build` - Build all packages and apps
- `pnpm turbo dev` - Run all apps in development
- `pnpm turbo lint` - Lint entire codebase
- `pnpm run version-update` - Update changelog with git-cliff
