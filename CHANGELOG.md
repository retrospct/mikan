# Changelog

## [1.6.0](https://github.com/retrospct/mikan/compare/v1.5.0...v1.6.0) (2026-07-20)


### Features

* **auto-mode:** real run loop + Auto/Plan toggle (RETRO-15, S5) ([#119](https://github.com/retrospct/mikan/issues/119)) ([84b3d0f](https://github.com/retrospct/mikan/commit/84b3d0f2f19cc80c8725cb9dc6d14cb9f0a6f6af))
* **contract:** lifecycle integration — retire TaskStatus (RETRO-16, S6) ([#122](https://github.com/retrospct/mikan/issues/122)) ([6750d00](https://github.com/retrospct/mikan/commit/6750d0026b00a185f0ecbf2ad4db409e5ee3097d))
* **contract:** Mikan Flows task lifecycle foundation (RETRO-10) ([#110](https://github.com/retrospct/mikan/issues/110)) ([ab67f46](https://github.com/retrospct/mikan/commit/ab67f4649170a3e2b34592f3a419db533db46f5f))
* **renderer:** growing-card component (Group 07) ([#115](https://github.com/retrospct/mikan/issues/115)) ([2456870](https://github.com/retrospct/mikan/commit/245687009c9f6451a2990ebb5324db16e74e9452))
* **renderer:** plan mode — the plan review/accept + auto/ask (Group 12, RETRO-14) ([#118](https://github.com/retrospct/mikan/issues/118)) ([a85295c](https://github.com/retrospct/mikan/commit/a85295c329086a965a010aa286f2c65827c987e2))
* **renderer:** task expand → workspace (Group 02, RETRO-13) ([#116](https://github.com/retrospct/mikan/issues/116)) ([0b37c3d](https://github.com/retrospct/mikan/commit/0b37c3d90a969aa3ded10770b090a25ca33cf2be))
* **renderer:** wire Today/Stack to the task lifecycle (RETRO-12, S2) ([#117](https://github.com/retrospct/mikan/issues/117)) ([d55bb8e](https://github.com/retrospct/mikan/commit/d55bb8ea4181e8ae156f651e474ad37363e62850))


### Bug Fixes

* **desktop:** brand tray tooltip + Show/Quit labels (Nimi → Mikan) ([#96](https://github.com/retrospct/mikan/issues/96)) ([dc5d57c](https://github.com/retrospct/mikan/commit/dc5d57c7147f232bdde8fadcfa68c93a7f2d6761))
* **desktop:** dev-mode Logto login via loopback redirect + sync correctness ([#136](https://github.com/retrospct/mikan/issues/136)) ([7934e0b](https://github.com/retrospct/mikan/commit/7934e0b52a350d50e91a37902249ccb558a90b74))
* inline feedback for Settings "Check for updates" (RETRO-7) ([#113](https://github.com/retrospct/mikan/issues/113)) ([22e0d94](https://github.com/retrospct/mikan/commit/22e0d94ef05ce2c727b250416bc809e2c00377df))
* route chunks to vecClient, trim NEEME_* env flags (RETRO-6) ([#99](https://github.com/retrospct/mikan/issues/99)) ([c1504fa](https://github.com/retrospct/mikan/commit/c1504fadb96439fe87fdc23e9ddfc082eecc745a))
* **test:** update broker-client tests for secrets-vault persistence ([#114](https://github.com/retrospct/mikan/issues/114)) ([ae44d11](https://github.com/retrospct/mikan/commit/ae44d11ccd3ccdb7c55884b22250d1003f23e77f))

## [1.5.0](https://github.com/retrospct/nimi/compare/v1.4.0...v1.5.0) (2026-06-25)


### Features

* **sync:** transfer recovery key via QR (desktop render + mobile scan) ([#89](https://github.com/retrospct/nimi/issues/89)) ([ba99f7d](https://github.com/retrospct/nimi/commit/ba99f7df1b68ac123c9a9e57091b0846303283d7))


### Bug Fixes

* **desktop:** consolidate at-rest secrets into one keychain-sealed vault ([#92](https://github.com/retrospct/nimi/issues/92)) ([e19bdb0](https://github.com/retrospct/nimi/commit/e19bdb058983fb8ecb2da96ed9db4369122ba479))
* **desktop:** wire renderer prototype stubs to real backend (UX punch list §A–C) ([#90](https://github.com/retrospct/nimi/issues/90)) ([ecd01bc](https://github.com/retrospct/nimi/commit/ecd01bc302fa3baeba3cb0a67c8f03b5d1d163ba))

## [1.4.0](https://github.com/retrospct/nimi/compare/v1.3.0...v1.4.0) (2026-06-25)


### Features

* **mobile:** validate Phase 0 mobile RN + Turso + cloud-AI pipeline (V1–V6) ([#86](https://github.com/retrospct/nimi/issues/86)) ([00b72eb](https://github.com/retrospct/nimi/commit/00b72ebaec99c8680b9302e2bb66a60701532dc3))

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
