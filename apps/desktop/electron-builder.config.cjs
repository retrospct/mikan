// electron-builder configuration, parameterized by the active brand.
//
// Replaces the former electron-builder.yml: YAML can't read identity.json, but
// build identity (productName, appId, deep-link scheme, icon, publish target) is
// owned by @nimi/brand so the TS app and the packager can't drift. Run via the
// build:* scripts, which set BRAND (default: mikan). Keep in sync with the
// electron-vite `define` that bakes BRAND into the JS bundles.
const identity = require('@nimi/brand/identity.json')

const BRAND = process.env.BRAND || 'mikan'
const meta = identity[BRAND]

if (!meta) {
  throw new Error(
    `[electron-builder] Unknown BRAND="${BRAND}". Expected one of: ${Object.keys(identity).join(
      ', '
    )}.`
  )
}

// User-facing binary/artifact name per brand (mikan/momo). The internal namespace
// (nimi/neeme) stays untouched elsewhere — brand lives only at the client edge.
const slug = meta.scheme

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: meta.appId,
  productName: meta.productName,
  directories: {
    buildResources: 'build',
    // Per-brand output dir so Mikan and Momo builds don't overwrite each other.
    output: `release/${BRAND}`
  },
  files: [
    '!**/.vscode/*',
    '!src/*',
    '!electron.vite.config.{js,ts,mjs,cjs}',
    '!electron-builder.config.cjs',
    '!{.eslintcache,eslint.config.mjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}',
    '!{.env,.env.*,.npmrc,pnpm-lock.yaml}',
    '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}'
  ],
  asarUnpack: ['resources/**', 'node_modules/ffmpeg-static/**'],
  // Register the brand's deep-link scheme (e.g. mikan://) in the bundle (macOS
  // Info.plist CFBundleURLTypes / Windows registry) so the Logto OAuth callback
  // (<scheme>://callback) routes back to the app. Without this, runtime
  // setAsDefaultProtocolClient is the only registration and the packaged login
  // round-trip is unreliable.
  protocols: [
    {
      name: meta.productName,
      schemes: [meta.scheme]
    }
  ],
  win: {
    icon: meta.icon,
    executableName: slug
  },
  nsis: {
    artifactName: `${slug}-\${version}-setup.\${ext}`,
    shortcutName: '${productName}',
    uninstallDisplayName: '${productName}',
    createDesktopShortcut: 'always'
  },
  mac: {
    icon: meta.icon,
    entitlementsInherit: 'build/entitlements.mac.plist',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    extendInfo: [
      { NSCameraUsageDescription: "Application requests access to the device's camera." },
      { NSMicrophoneUsageDescription: "Application requests access to the device's microphone." },
      {
        NSDocumentsFolderUsageDescription:
          "Application requests access to the user's Documents folder."
      },
      {
        NSDownloadsFolderUsageDescription:
          "Application requests access to the user's Downloads folder."
      },
      {
        NSSpeechRecognitionUsageDescription: `${meta.productName} uses on-device speech recognition to transcribe voice memos into searchable memories.`
      }
    ],
    notarize: true
  },
  dmg: {
    artifactName: `${slug}-\${version}.\${ext}`
  },
  linux: {
    icon: meta.icon,
    target: ['AppImage', 'snap', 'deb'],
    maintainer: 'electronjs.org',
    category: 'Utility'
  },
  appImage: {
    artifactName: `${slug}-\${version}.\${ext}`
  },
  npmRebuild: false,
  publish: {
    provider: 'github',
    owner: meta.publish.owner,
    repo: meta.publish.repo,
    releaseType: 'release'
  }
}
