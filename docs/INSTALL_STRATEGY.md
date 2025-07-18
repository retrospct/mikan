# Install Strategy for Electron App Dependencies

## Problem

The desktop app's `postinstall` script runs `electron-builder install-app-deps` during `pnpm install`, which is problematic because:

1. It causes issues with pnpm workspace bootstrap
2. It's redundant since electron-builder rebuilds native modules again during packaging
3. The `--disable-rebuild` flag was causing errors with the current electron-builder version

## Solution

The postinstall script is now conditional and will be skipped during workspace bootstrap:

```json
"postinstall": "[ -n \"$SKIP_POSTINSTALL\" ] || electron-builder install-app-deps"
```

## Usage

### For Workspace Bootstrap (Skip Postinstall)

Use the new script that sets the environment variable:

```bash
npm run install:skip-postinstall
```

Or manually set the environment variable:

```bash
SKIP_POSTINSTALL=1 pnpm install
```

### For Development (Run Install-App-Deps)

When you need to rebuild native modules for development:

```bash
cd apps/desktop
npm run install-app-deps
```

### For Production Builds

The build scripts will automatically run electron-builder which handles native module rebuilding:

```bash
npm run build:win    # Windows build
npm run build:mac    # macOS build
npm run build:linux  # Linux build
```

## What This Achieves

- ✅ Workspace bootstrap with `pnpm install` no longer fails
- ✅ Development workflow preserved - you can manually run install-app-deps when needed
- ✅ Production builds still work - electron-builder handles native module rebuilding during packaging
- ✅ No redundant native module rebuilding during install phase

## Migration Notes

- Replace `pnpm install` with `npm run install:skip-postinstall` for workspace bootstrap
- Use `npm run install-app-deps` in the desktop app directory when you need to rebuild native modules for development
- Production builds remain unchanged
