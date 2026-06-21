// electron-builder configuration, parameterized by the active brand.
// Run via the package.json scripts (build:mikan / build:momo), which set BRAND.
const identity = require('./src/brand/identity.json');

const BRAND = process.env.BRAND || 'mikan';
const meta = identity[BRAND];

if (!meta) {
  throw new Error(
    `[electron-builder] Unknown BRAND="${BRAND}". Expected one of: ${Object.keys(
      identity,
    ).join(', ')}.`,
  );
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: meta.appId,
  productName: meta.productName,
  // Per-brand output dir so Mikan and Momo builds don't overwrite each other.
  directories: {
    output: `release/${BRAND}`,
  },
  files: ['dist/**/*', 'package.json'],
  mac: {
    icon: meta.icon,
    category: 'public.app-category.productivity',
    target: ['dmg', 'zip'],
  },
  win: {
    icon: meta.icon,
    target: ['nsis'],
  },
  linux: {
    icon: meta.icon,
    target: ['AppImage'],
    category: 'Utility',
  },
};
