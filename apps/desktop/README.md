# mikan-desktop-evite

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Skipping install-app-deps with pnpm

The `install-app-deps` script is skipped under pnpm to avoid issues specific to the pnpm workspace setup. This can prevent the automatic installation of native dependencies during the postinstall phase. To manually rebuild native dependencies, run the following command:

```bash
$ npx electron-builder install-app-deps
```

## Project Setup

### Install

```bash
$ pnpm install
```

### Development

```bash
$ pnpm dev
```

### Build

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```
