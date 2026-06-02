/* eslint-disable @typescript-eslint/no-require-imports */
// t3-turbo pattern: Expo SDK 52+ getDefaultConfig auto-detects the pnpm
// workspace root and sets watchFolders / nodeModulesPaths. One addition
// nimi needs that t3-turbo doesn't: unstable_enablePackageExports because
// @nimi/contract has 5 subpath exports (./views, ./api, ./ipc, etc.).
const { getDefaultConfig } = require('expo/metro-config')
const { FileStore } = require('metro-cache')
const path = require('path')

const config = getDefaultConfig(__dirname)

// Enable package.json `exports` field resolution so @nimi/contract/* subpaths
// (e.g. @nimi/contract/views, @nimi/contract/api) resolve correctly under Metro.
config.resolver.unstable_enablePackageExports = true

// Metro cache stored in node_modules/.cache/metro so Turborepo can cache it.
config.cacheStores = [new FileStore({ root: path.join(__dirname, 'node_modules/.cache/metro') })]

module.exports = config
