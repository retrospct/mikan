# Changelog

## [1.3.0](https://github.com/retrospct/nimi/compare/v1.2.0...v1.3.0) (2026-06-23)


### Features

* build-time brand layer (Mikan/Momo) + cross-platform tokens + release pipeline ([#72](https://github.com/retrospct/nimi/issues/72)) ([0c1eaf0](https://github.com/retrospct/nimi/commit/0c1eaf0182bb6acf6df433ca2065a0d3b40218a9))
* **desktop:** default drafter model to Claude Sonnet 4.6 ([96a7076](https://github.com/retrospct/nimi/commit/96a707626bc5797505c4e464ac4369cc67073ae2))
* **desktop:** enableSandbox + deny-by-default permission allowlist ([181e070](https://github.com/retrospct/nimi/commit/181e0702e2ad98568aab074dff0b289ad0ab93c9))
* **desktop:** real 1024² Mikan app icon from the NimiMark ([cb14a4f](https://github.com/retrospct/nimi/commit/cb14a4fd519b7402430f3f499d293270d192706e))
* **desktop:** show app header on Feed; disable MemoryWeather banner ([a051121](https://github.com/retrospct/nimi/commit/a051121482fbf6ae6e15ff0d93774becafeb7ca6))
* **theme:** default accent to matcha (green) ([#64](https://github.com/retrospct/nimi/issues/64)) ([983a152](https://github.com/retrospct/nimi/commit/983a1522b8d73949bb931dca27aa9d281a24966f))
* **theme:** default to rose accent + add primary-color picker in Settings ([d3fbbc2](https://github.com/retrospct/nimi/commit/d3fbbc2a1a54bd0203dd8c27ef4a78b28e12cdb7))
* **updater:** add Check for Updates UI to Settings ([441fa00](https://github.com/retrospct/nimi/commit/441fa00ebcd036ab60645d3979736ed49c682379))
* **updater:** add native "Check for Updates…" app-menu item ([#67](https://github.com/retrospct/nimi/issues/67)) ([6db6d27](https://github.com/retrospct/nimi/commit/6db6d277b07f63c8abf6f27d59ce01c9f992e89a))


### Bug Fixes

* **build:** pin Vite to 7 to restore main/preload bundles ([#66](https://github.com/retrospct/nimi/issues/66)) ([d8d0934](https://github.com/retrospct/nimi/commit/d8d09345d38d265dcc65abbea26209486305b8b1))
* **desktop:** drag window from background; stop stray text selection ([2c9104c](https://github.com/retrospct/nimi/commit/2c9104cc578cb0ea683fe4cb4e8462d841098785))
* **mark:** rotate the dot grid with the diamond frame ([b3c33c3](https://github.com/retrospct/nimi/commit/b3c33c312a2668e4412f34debf05af39f5ffc2f2))
* **todos:** wire task context association end-to-end ([#63](https://github.com/retrospct/nimi/issues/63)) ([38e56d9](https://github.com/retrospct/nimi/commit/38e56d9ee723b0b260d79ead2523168e37d984ee))
* **token-broker:** exit cleanly on EADDRINUSE instead of crashing ([bc4eeee](https://github.com/retrospct/nimi/commit/bc4eeeecfc5613736e727800033b068a11fa264f))


### Performance Improvements

* **auth:** skip redundant safeStorage re-seal on boot ([7c89092](https://github.com/retrospct/nimi/commit/7c89092e644f8ad0ab5bc2bd671d3193eb0c706b))
