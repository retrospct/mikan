---
description: Electron desktop app - security, architecture, and development patterns
globs: apps/desktop/**/*.ts, apps/desktop/**/*.tsx, apps/desktop/**/*.js, apps/desktop/electron.vite.config.ts, apps/desktop/electron-builder.yml
---

# Electron Desktop App Rules

## Security First Approach

**CRITICAL**: All Electron code must follow security best practices to prevent vulnerabilities.

### Main Process Security

- **Context Isolation**: Always enable (`contextIsolation: true`)
- **Sandbox**: Enable sandbox mode (`sandbox: true`) unless absolutely necessary
- **Node Integration**: Never enable `nodeIntegration: true` in renderer
- **Remote Module**: Never use deprecated remote module
- **Web Security**: Keep `webSecurity: true` in production

### Preload Script Guidelines

- Use `contextBridge.exposeInMainWorld()` for all API exposure
- Validate and sanitize all IPC inputs
- Expose minimal APIs - only what's absolutely needed
- Never expose powerful Node.js APIs directly

Example pattern:

```typescript
contextBridge.exposeInMainWorld('mikanAPI', {
  // Specific, limited APIs only
  saveTask: (task: Task) => ipcRenderer.invoke('save-task', sanitizeTask(task)),
  getTasks: () => ipcRenderer.invoke('get-tasks')
})
```

## Process Architecture

### Main Process (`src/main/`)

- Handles system operations, file access, and native APIs
- Manages window lifecycle and app state
- Implements IPC handlers with proper validation
- No direct UI logic - purely backend operations

### Renderer Process (`src/renderer/`)

- React application with TypeScript
- Uses shared @mikan/ui components
- Communicates only through exposed preload APIs
- No direct file system or native API access

### Preload Scripts (`src/preload/`)

- Bridge between main and renderer
- Minimal code - just API exposure
- Type-safe API definitions in `index.d.ts`

## IPC Communication Patterns

### Invoke/Handle Pattern (Preferred)

```typescript
// Main process
ipcMain.handle('get-tasks', async (event, filter) => {
  validateFilter(filter) // Always validate inputs
  return await taskService.getTasks(filter)
})

// Renderer (via preload)
const tasks = await window.mikanAPI.getTasks(filter)
```

### Security Rules for IPC

1. Always validate inputs in main process
2. Never trust renderer input
3. Use invoke/handle for request-response
4. Sanitize file paths and user input
5. Implement rate limiting for sensitive operations

## Development Workflow

### Local Development

```bash
pnpm dev  # Runs electron-vite in dev mode with HMR
```

### Building

```bash
pnpm build        # Type check + build
pnpm build:mac    # macOS build
pnpm build:win    # Windows build
pnpm build:linux  # Linux build
```

### Window Configuration

- Hidden title bar with overlay for modern UI
- Fixed dimensions for consistent experience
- Show window only when ready to prevent flash

## Styling & UI

- Use Tailwind CSS with @mikan/tailwind-config
- Import shared components from @mikan/ui
- Platform-specific styling when needed
- Dark mode support required

## Performance Guidelines

- Lazy load heavy components
- Use React.memo for expensive renders
- Minimize main process blocking operations
- Offload heavy computation to worker threads

## Error Handling

- Graceful degradation for all features
- User-friendly error messages
- Log errors appropriately (not to console in production)
- Implement crash reporting (with user consent)

## Auto-Update Implementation

- Use electron-updater for updates
- Test update flow thoroughly
- Provide manual update option
- Clear update notifications

## Native Integration

- Use electron APIs sparingly
- Prefer web standards when possible
- Document all native dependencies
- Plan for cross-platform compatibility

## Testing Requirements

- Unit tests for IPC handlers
- Integration tests for main-renderer communication
- E2E tests with Playwright for critical flows
- Security testing for all IPC endpoints
