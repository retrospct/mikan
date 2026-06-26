---
todos:
  # --- #11 Vuln cleanup + CSP tighten (lane: back, size S, P1 quick) ---
  - id: v11-audit-baseline
    status: pending
    content: 'Capture the vuln baseline: `pnpm audit` (currently clean) + `gh api repos/retrospct/nimi/dependabot/alerts` (3 alerts: drizzle-orm GHSA-gpj5-g38j-94v9 x2, esbuild GHSA-67mh-4wv8-2f99 — all already "fixed"); record any newly-open ones and confirm the lockfile pins patched versions (drizzle-orm >=0.45.2, esbuild >=0.25 via vite 7)'
  - id: v11-electron-cve
    status: pending
    content: 'Check Electron itself for advisories at the pinned 42.x (`pnpm why electron`, electronjs.org/releases + GH advisories); bump within the supported major if a Chromium/V8 CVE applies, then re-run `pnpm build` + `pnpm dev` smoke'
  - id: v11-dependabot-config
    status: pending
    content: 'Add `.github/dependabot.yml` (npm ecosystem, weekly, grouped minor/patch) so future alerts auto-PR, closing the loop the INBOX opened'
  - id: v11-bundle-fonts
    status: pending
    content: 'Bundle Hanken Grotesk + JetBrains Mono locally (@fontsource) and import them in the renderer; remove the Google Fonts <link>/<preconnect> from apps/desktop/src/renderer/index.html so the app is fully offline-first'
  - id: v11-csp-meta-tighten
    status: pending
    content: 'Tighten the <meta> CSP in index.html: drop fonts.googleapis.com / fonts.gstatic.com, set font-src ''self'', narrow connect-src (drop http://localhost:8000 unless the HTTP API client is still in use), and attempt to remove style-src ''unsafe-inline'' (verify Tailwind v4 + the JS accent tweak still render)'
  - id: v11-csp-runtime-header
    status: pending
    content: 'Add a defense-in-depth response-header CSP in main via session.defaultSession.webRequest.onHeadersReceived (apps/desktop/src/main/index.ts) so the policy is enforced even if index.html is bypassed; keep it in sync with the meta policy'
  - id: v11-security-doc
    status: pending
    content: 'Update docs/SECURITY.md "Content Security Policy" section to reflect the tightened policy (local fonts, runtime header) and check the changes against the SECURITY.md invariant checklist'

  # --- Alpha scope (RESOLVED decisions) ---
  - id: v-alpha-scope-resolved
    status: done
    content: 'RESOLVED: friends-and-family open alpha. GitHub Releases as feed host (provider: github). macOS-only for alpha — Windows deferred. Cost: $99/yr Apple Developer Program only. No monetization pressure for this round.'

  # --- #13 Package macOS (sign + notarize) (lane: back/dist, size M, P1) ---
  - id: v13-decisions
    status: done
    content: 'RESOLVED: Apple Developer Program path confirmed (see Apple notarization instructions in plan). Windows deferred for alpha — ship unsigned only if/when a Windows tester asks; document SmartScreen bypass. Canary channel: use a prerelease tag (e.g. v0.x.0-alpha.N) on GitHub Releases.'
  - id: v13-apple-enroll
    status: pending
    content: 'HUMAN STEP 1: Enroll in Apple Developer Program at developer.apple.com/programs/enroll/ — choose Individual ($99/yr, credit card). Approval email arrives in minutes to a few hours. Record your Apple ID email for use in later steps.'
  - id: v13-apple-cert
    status: pending
    content: 'HUMAN STEP 2: Create Developer ID Application certificate. In Xcode: Xcode → Settings (⌘,) → Accounts → select your Apple ID → Manage Certificates → + → Developer ID Application. OR at developer.apple.com → Certificates, IDs & Profiles → + → Developer ID Application (requires generating a CSR from Keychain Access first). Note your 10-char Team ID at developer.apple.com → Account → Membership Details.'
  - id: v13-apple-apikey
    status: pending
    content: 'HUMAN STEP 3: Create App Store Connect API key at appstoreconnect.apple.com → Users and Access → Integrations → App Store Connect API → + (name: nimi-ci, Role: Developer). Download the .p8 file (one-time only — save it safely offline). Note the Key ID and Issuer ID shown on that page. Base64-encode the .p8 for CI: `base64 -i AuthKey_KEYID.p8 | tr -d "\\n"`'
  - id: v13-apple-ci-secrets
    status: pending
    content: 'HUMAN STEP 4: Export signing cert as .p12 from Keychain Access (right-click "Developer ID Application: <Name>" → Export → set a strong password). Base64-encode: `base64 -i YourCert.p12 | tr -d "\\n"`. Store GitHub repo secrets: CSC_LINK (base64 .p12), CSC_KEY_PASSWORD (.p12 password), APPLE_TEAM_ID (10-char), APPLE_API_KEY (base64 .p8), APPLE_API_KEY_ID, APPLE_API_ISSUER. Settings → Secrets and variables → Actions → New repository secret.'
  - id: v13-mac-sign-notarize
    status: pending
    content: 'Enable mac signing+notarization in apps/desktop/electron-builder.yml: set `mac.notarize: true` (electron-builder 26 notarytool), confirm hardenedRuntime + entitlements wiring (build/entitlements.mac.plist), gatekeeperAssess off; verify the JIT/unsigned-memory/dyld-env entitlements are still required by onnxruntime-node/ffmpeg and trim any that are not'
  - id: v13-native-asar
    status: pending
    content: 'Audit native modules for packaging: onnxruntime-node, @libsql/client, heic-convert, ffmpeg-static — confirm `electron-builder install-app-deps` (postinstall) rebuilds them and asarUnpack covers everything dlopen-ed at runtime (resources/** + ffmpeg-static already listed); add onnxruntime/libsql unpack entries if the signed app fails to load them'
  - id: v13-mac-build-verify
    status: pending
    content: 'Build + verify a signed/notarized mac dmg: `pnpm --filter @nimi/desktop build:mac`, then `codesign --verify --deep --strict`, `spctl -a -vvv`, and `stapler validate` on the .app; boot it and confirm the worker forks + DB writes to ~/Library/Application Support/Mikan/neeme.db'
  - id: v13-credential-audit
    status: pending
    content: 'Pre-release credential audit: (1) confirm no .env files committed (`git ls-files | grep "\.env"`); (2) verify CI build job env does NOT include NEEME_ANTHROPIC_KEY or any MAIN_VITE_ secret beyond the expected Google/Logto public OAuth params; (3) spot-check asar: `npx asar list dist/mac*/Mikan.app/Contents/Resources/app.asar | grep -i "env\|key\|secret\|token"` — no .env files, no embedded secrets.'
  - id: v13-win-canary
    status: pending
    content: 'DEFERRED (post-alpha): Windows is out of scope for the friends-and-family alpha. When revisited, recommended path is Azure Trusted Signing (~$120/yr, immediate SmartScreen clearance, no hardware token required). Workaround for any Windows alpha tester: run the unsigned .exe → SmartScreen prompt → "More info" → "Run anyway". Document in AGENTS.md Tier 3 if needed.'
  - id: v13-ci-release-workflow
    status: pending
    content: 'Add a tag-triggered GitHub Actions release workflow (macos-latest matrix) that runs typecheck/build then electron-builder publish, consuming CSC_LINK/CSC_KEY_PASSWORD + APPLE_TEAM_ID + APPLE_API_KEY/ID/ISSUER from repo secrets; mac job needs the unlocked keychain step. Windows runner added later when v13-win-canary is un-deferred.'

  # --- #12 Auto-updater (electron-updater) (lane: back/dist, size M, P1) ---
  - id: v12-feed-decision
    status: done
    content: 'RESOLVED: GitHub Releases (provider: github, owner: retrospct, repo: nimi). Update electron-builder.yml publish block (replace the generic/example.com placeholder) + dev-app-update.yml to match. Repo is public (or release assets are public) so no token needed for the update feed.'
  - id: v12-wire-autoupdater
    status: pending
    content: 'Wire electron-updater (already a dependency, currently unused) in apps/desktop/src/main: import autoUpdater, call checkForUpdatesAndNotify() after app.whenReady + window init, wire update-available / download-progress / update-downloaded → quitAndInstall, and log update errors without crashing the thin main router'
  - id: v12-update-ipc-surface
    status: pending
    content: 'Add an optional update surface to the contract: `update:*` channels + an UpdateApi (state event + "restart to update") in packages/contract/src/ipc.ts, bridge it in src/preload/index.ts, and surface a subtle "Update ready — restart" affordance in the tray window (keep main a router: autoUpdater lives in main, not the worker)'
  - id: v12-update-verify
    status: pending
    content: 'Verify the update flow end-to-end: publish vX, install it, publish vX+1, confirm the running app detects, downloads, and applies on relaunch (mac requires the notarized signed build from #13). Document a manual updater runbook under docs/testing/'
---
# Distribution & hardening — ROADMAP #11 / #12 / #13

The "make nimi distributable & hardened" workstream. Three interdependent punch-list items
shipped as one unit but tracked separately:

- **#11 Vuln cleanup + CSP tighten** (back, S, P1-quick) — close the dependabot alerts + tighten the renderer CSP.
- **#13 Package macOS (sign + notarize)** (back/dist, M, P1) — produce a trustworthy macOS installer for the alpha.
- **#12 Auto-updater (electron-updater)** (back/dist, M, P1) — testers auto-get each pushed build.

> **Why this order (and why it differs from the numeric order):** auto-update on macOS is
> only possible against a **signed + notarized** build (Squirrel.Mac refuses to apply an
> unsigned/un-notarized update), so **#13 is a hard prerequisite for #12**. CSP/vuln work
> (#11) is independent and cheap, so it can land first or in parallel, but it is part of
> *shipping a secure release*. Sequence: **#11 (cheap, parallel) → #13 (notarized build) →
> #12 (updater feed wired to that build)**.

This plan follows the Electron security spine in [`docs/SECURITY.md`](../SECURITY.md) and
the "Tier 3 — packaged installer" flow in the root [`AGENTS.md`](../../AGENTS.md). It changes
only `apps/desktop` build/main + the contract; the worker, DB, and renderer data paths are
untouched.

---

## Alpha/beta distribution scope

**Goal:** friends-and-family open alpha/beta. No monetization pressure, no public launch.
Cost sensitivity is low for this round — the only recurring spend is the Apple Developer
Program ($99/yr), which is unavoidable for signed/notarized macOS distribution.

**Feed host: GitHub Releases (confirmed).** Free, requires no infra, and electron-builder's
`provider: github` publishes both the installer artifacts and the `latest-mac.yml` channel
manifest that `electron-updater` polls. The repo is public (or release assets are public), so
testers can download directly from a GitHub Release URL and the updater feed needs no
auth token.

**Platform scope for alpha: macOS only.** Windows is deferred (see recommendation below).
The AGENTS.md Tier 3 section remains accurate for the current unsigned mac build; once #13
lands, the right-click/xattr workaround goes away for macOS.

### Windows recommendation: forgo for the alpha

For a friends-and-family GitHub Releases distribution (direct download, not the Microsoft
Store), a signing cert is **not required**. The app will install and run fine unsigned.
However, Windows Defender SmartScreen shows a blue/orange warning dialog on every install:
*"Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app
from starting."* The tester must click **"More info" → "Run anyway"** to proceed.

**Why not just get a cert?** The signing options and their costs:

| Option | Cost | SmartScreen effect | Notes |
|---|---|---|---|
| OV (Organization Validation) cert | ~$300–500/yr | Builds reputation slowly — still shows warning at first | Requires entity verification (D-U-N-S); no hardware token needed |
| EV (Extended Validation) cert | ~$400–700/yr | Clears SmartScreen immediately | Requires a hardware USB token (YubiKey-style) for every signing operation — painful for CI |
| **Azure Trusted Signing** | ~$120/yr | Clears SmartScreen immediately | Microsoft's modern path; no hardware token; works with GitHub Actions |

**Recommendation: skip Windows for the alpha entirely.** A handful of friends-and-family
testers does not justify the cert overhead, and macOS is the primary target. If a Windows
tester really wants to try it, provide them this exact workaround:

> 1. Download the `nimi-X.X.X-setup.exe` from the GitHub Release.
> 2. When SmartScreen appears, click **"More info"** (below the warning text).
> 3. Click **"Run anyway"**.
> 4. The installer proceeds normally.

When Windows support is revisited post-alpha, **Azure Trusted Signing** is the recommended
path (~$120/yr, immediate SmartScreen clearance, no hardware token, CI-friendly). See the
deferred `v13-win-canary` todo.

---

## #11 — Vuln cleanup + CSP tighten

### Current state

- **Vulns are effectively already remediated.** `pnpm audit` at repo root returns **"No known
  vulnerabilities found."** The three dependabot alerts the [`INBOX`](../agent-sync/INBOX.md)
  flags (`@back … clear the 3 dependabot vulns (#1, #11)`) are, per
  `gh api repos/retrospct/nimi/dependabot/alerts`:
  - `drizzle-orm` **GHSA-gpj5-g38j-94v9** (high, `< 0.45.2`) — alerts #1 and #3 — **state: fixed**
  - `esbuild` **GHSA-67mh-4wv8-2f99** (medium, `<= 0.24.2`) — alert #2 — **state: fixed**

  [`apps/desktop/package.json`](../../apps/desktop/package.json) pins `drizzle-orm ^0.45.2`
  (the patched line) and esbuild is transitive via `vite ^7.2.6` (esbuild ≥ 0.25). So the
  remaining #11 work is **verification + closing the loop**, not big version surgery.
- **CSP exists but is loose**, and lives only as a `<meta http-equiv>` in
  [`apps/desktop/src/renderer/index.html`](../../apps/desktop/src/renderer/index.html) (line 17-20):

```19:19:apps/desktop/src/renderer/index.html
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' http://localhost:8000"
```

  Loose spots: `style-src 'unsafe-inline'` + the two Google Fonts origins (the UI pulls Hanken
  Grotesk + JetBrains Mono from `fonts.googleapis.com`/`fonts.gstatic.com`, referenced in
  [`nimi.css`](../../apps/desktop/src/renderer/src/nimi/nimi.css) `--sans`/`--mono`), and
  `connect-src http://localhost:8000` (the legacy HTTP API base in
  [`packages/contract/src/api/runtime.ts`](../../packages/contract/src/api/runtime.ts), default
  `VITE_NEEME_API_URL`). There is **no runtime response-header CSP** — the meta tag is the only
  enforcement, and `script-src 'self'` is already strict (good). `docs/SECURITY.md` already
  names the two targets: *"Tighten `connect-src` once the legacy cloud API is fully retired"*
  and *"Bundling fonts locally would let us drop the Google Fonts origins entirely."*

### Decisions / open questions

- **Is the HTTP API client still live?** The renderer talks to the worker over IPC; the
  `packages/contract/src/api` HTTP client is for the sibling neeme FastAPI. If nothing in the
  renderer calls it, drop `connect-src http://localhost:8000` entirely. If it is still used in
  dev, gate the dev origin behind `import.meta.env.DEV` (Vite strips it from the prod meta tag)
  rather than shipping it.
- **Can we drop `style-src 'unsafe-inline'`?** Tailwind v4 (`@tailwindcss/vite`) and the
  runtime accent tweak that mutates CSS custom properties may both rely on inline styles.
  Verify the rendered app with `'unsafe-inline'` removed; if the accent tweak breaks, move it
  to a nonce'd style or a stylesheet rule and keep `style-src 'self'`.

### File-by-file changes

- [`apps/desktop/src/renderer/index.html`](../../apps/desktop/src/renderer/index.html) — remove
  the `fonts.googleapis.com`/`fonts.gstatic.com` `<link>`/`<preconnect>` (lines 21-26) and
  tighten the meta CSP (line 19) to roughly:
  `default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'`.
- **Renderer entry** (`apps/desktop/src/renderer/src/main.tsx`) — `import '@fontsource/hanken-grotesk'`
  and `'@fontsource/jetbrains-mono'`; add `@fontsource/*` to `apps/desktop/package.json`
  `dependencies`. `nimi.css` `--sans`/`--mono` stacks already name the families, so no CSS rule
  change beyond confirming the local faces register.
- [`apps/desktop/src/main/index.ts`](../../apps/desktop/src/main/index.ts) — inside
  `app.whenReady()`, add a `session.defaultSession.webRequest.onHeadersReceived` handler that
  injects a `Content-Security-Policy` **response header** matching the meta policy (belt-and-
  suspenders; the meta tag can be stripped by a compromised renderer bundle, the header cannot).
  This sits alongside the existing nav lockdown (`web-contents-created`, lines 50-58).
- **New** `.github/dependabot.yml` — npm ecosystem, weekly, grouped minor/patch updates, so the
  next CVE opens a PR automatically.
- [`docs/SECURITY.md`](../SECURITY.md) — update the "Content Security Policy" section to record
  the local-fonts + runtime-header outcome.

### Vuln list + remediation

| Alert | Package | Severity | Vulnerable | Patched | Status / action |
|---|---|---|---|---|---|
| #1, #3 | `drizzle-orm` | high | `< 0.45.2` | `0.45.2` | **Fixed** — pinned `^0.45.2`; verify lockfile resolves ≥ 0.45.2 |
| #2 | `esbuild` | medium | `<= 0.24.2` | `0.25.0` | **Fixed** — transitive via `vite ^7` (esbuild ≥ 0.25); verify `pnpm why esbuild` |
| — | `electron` | — | (check) | — | Confirm 42.x has no open Chromium/V8 advisory; bump within major if needed |

Primary remediation is **confirm + lock**, not bump. Run the audit, attach the output to the
PR, and let `.github/dependabot.yml` carry it forward.

---

## #13 — Package macOS (sign + notarize)

### Current state

- [`apps/desktop/electron-builder.yml`](../../apps/desktop/electron-builder.yml) exists and is
  mostly wired: `appId: dev.retro.mikan`, `productName: Mikan`, `directories.buildResources: build`,
  mac/win/linux/dmg/nsis/appImage targets, `asarUnpack` for `resources/**` + `ffmpeg-static`,
  `npmRebuild: false`, and `postinstall: electron-builder install-app-deps` in package.json.
- **Signing/notarization is OFF.** `mac.notarize: false` (line 30), no `Developer ID`
  identity, no `afterSign`/notarize hook, and no Windows signing block. Per the root `AGENTS.md`
  Tier 3 section, builds are **unsigned** today (mac → right-click Open / `xattr -dr`,
  Windows → SmartScreen "Run anyway").
- The mac entitlements [`build/entitlements.mac.plist`](../../apps/desktop/build/entitlements.mac.plist)
  already grant hardened-runtime-adjacent keys (`allow-jit`, `allow-unsigned-executable-memory`,
  `allow-dyld-environment-variables`, `device.audio-input`, `speech-recognition.local`) — these
  matter once hardened runtime is enabled for notarization (onnxruntime-node/ffmpeg need JIT).
- Icons exist: `build/icon.icns`, `build/icon.ico`, `build/icon.png`.
- The build scripts referenced in AGENTS.md are present:
  `build:mac` → `electron-vite build && electron-builder --mac`, `build:win`, `build:linux`,
  `build:unpack` ([`package.json`](../../apps/desktop/package.json) lines 22-26).

### Decisions: resolved

- **Feed host:** GitHub Releases (see #12 / alpha scope section above).
- **macOS-only for alpha.** Windows is deferred — see the Windows recommendation in the
  Alpha/beta distribution scope section above.

### Apple notarization — exact steps (non-expert guide)

**Before you start:** you need a Mac with Xcode installed, and a credit card. Plan for ~30
minutes of active work, then waiting 1–2 hours for Apple's systems to catch up.

#### Step 1 — Enroll in the Apple Developer Program

1. Go to [developer.apple.com/programs/enroll/](https://developer.apple.com/programs/enroll/)
2. Sign in with your Apple ID (personal is fine; you don't need to create a new one).
   If you don't have one yet, create it at [appleid.apple.com](https://appleid.apple.com) first.
3. Select **"Enroll as an Individual"** — no company, no D-U-N-S number needed.
4. Pay **$99/year** by credit card.
5. You'll get a confirmation email within minutes; full Developer portal access activates
   within a few hours (sometimes instantly).

#### Step 2 — Create a Developer ID Application certificate

This is the certificate that signs the `.app` bundle so macOS trusts it.

**Option A — Xcode (easiest):**
1. Open Xcode → **Xcode menu → Settings (⌘,) → Accounts tab**.
2. Click **"+"** at the bottom-left → **"Add Apple ID"** → sign in with your Developer account.
3. Select your team in the left list → click **"Manage Certificates…"** (bottom right).
4. Click **"+"** at the bottom-left → select **"Developer ID Application"**.
5. Xcode creates, signs, and installs the certificate in your login Keychain automatically.
   You're done with this step.

**Option B — Web (if you prefer not to use Xcode):**
1. Go to [developer.apple.com](https://developer.apple.com) → **Certificates, IDs & Profiles →
   Certificates → "+"**.
2. Select **"Developer ID Application"** → Continue.
3. You need a Certificate Signing Request (CSR): open **Keychain Access** → menu
   **Keychain Access → Certificate Assistant → Request a Certificate from a Certificate
   Authority** → enter your email, leave CA Email blank, select "Saved to disk" → Save.
4. Upload the saved `.certSigningRequest` file on the Apple page → Download the resulting
   `.cer` file → **double-click it** to install in Keychain.

#### Step 3 — Note your Team ID

1. Go to [developer.apple.com](https://developer.apple.com) → click your name top-right →
   **Account → Membership Details**.
2. Copy the **10-character Team ID** (e.g. `ABC123DEFG`). You'll need this in Step 5.

#### Step 4 — Choose a notarytool credential (App Store Connect API key — recommended)

You need a credential that `notarytool` (the Apple tool that submits your app for notarization)
uses to authenticate. There are two options:

**Option A: App-Specific Password** (simpler, but user-account-tied)
- Good for local one-off builds; not ideal for CI since it's tied to your Apple ID login.
- Go to [appleid.apple.com](https://appleid.apple.com) → **Security → App-Specific Passwords →
  Generate an app-specific password**.
- Name it "nimi-notarize" → copy the 16-character password (shown only once).
- You'll need: your Apple ID email, this password, and your Team ID.

**Option B: App Store Connect API key** ← *recommended for CI*
This is a machine credential — not tied to your personal account password, never expires unless
revoked, and can be stored cleanly as a GitHub secret.

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Users and Access**
   (top tab) → **Integrations → App Store Connect API**.
2. Click **"+"** → name it `nimi-ci` → Role: **Developer** → **Generate**.
3. **Download the `.p8` private key file immediately** — this is the only time Apple shows it.
   Save it safely (e.g. in a password manager as a file attachment, or 1Password attachment).
4. On the same page, note two values you'll need:
   - **Key ID** — shown in the table next to your key name (e.g. `ABCD123456`)
   - **Issuer ID** — shown at the top of the API Keys page (a UUID like
     `12ab3cd4-ef56-789a-bcde-f0123456789a`)

**Why the API key is better for CI:**
The App-Specific Password approach is fine for local builds but ties notarization to your
personal Apple ID password rotation. If you ever change your Apple ID password, you invalidate
the old app-specific password and your CI breaks. The API key is a machine credential scoped
to the minimum "Developer" role, has no expiry, and can be revoked individually without
touching your account. It's also the approach Apple's own documentation recommends for
automated pipelines.

#### Step 5 — Export the signing certificate for CI

electron-builder needs the signing certificate as a `.p12` file (a bundle of cert + private key)
to sign the app in a CI environment that has no Keychain.

1. Open **Keychain Access** on your Mac → search for `Developer ID Application`.
2. Find the entry with your name: **"Developer ID Application: Your Name (TEAMID)"**.
3. Right-click it → **Export "Developer ID Application: …"** → save as a `.p12` file → set a
   **strong export password** (you'll need this password again in Step 6).
4. Base64-encode it for storage as a GitHub secret:
   ```bash
   base64 -i YourCert.p12 | tr -d '\n'
   ```
   Copy the output — this is your `CSC_LINK` value.

For the `.p8` API key, base64-encode it too:
```bash
base64 -i AuthKey_KEYID.p8 | tr -d '\n'
```

#### Step 6 — Store everything as GitHub repository secrets

Go to your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**.
Add each of the following:

| Secret name | Value |
|---|---|
| `CSC_LINK` | Base64-encoded `.p12` certificate (from Step 5) |
| `CSC_KEY_PASSWORD` | The `.p12` export password you set in Step 5 |
| `APPLE_TEAM_ID` | Your 10-character Team ID (from Step 3) |
| `APPLE_API_KEY` | Base64-encoded `.p8` API key content (from Step 4) |
| `APPLE_API_KEY_ID` | Key ID from App Store Connect (from Step 4, e.g. `ABCD123456`) |
| `APPLE_API_ISSUER` | Issuer ID from App Store Connect (from Step 4, the UUID) |

> **Never commit any of these files or values to the repo.** They are write-once into GitHub
> Secrets. The `.p8` and `.p12` files should live only in your password manager + GitHub
> Secrets; delete the local copies once stored.

### File-by-file changes

- [`apps/desktop/electron-builder.yml`](../../apps/desktop/electron-builder.yml):
  - `mac.notarize: true` (electron-builder 26 drives **notarytool** from env creds) and confirm
    `mac.hardenedRuntime` (default true when signing) + `entitlements`/`entitlementsInherit`
    both point at `build/entitlements.mac.plist`.
  - Set `mac.target` explicitly to `dmg` + `zip` (Squirrel.Mac auto-update consumes the `zip`).
  - Windows: leave unsigned for alpha; no `win.signtoolOptions` needed yet.
- **Native module audit:** confirm `onnxruntime-node` (via `@huggingface/transformers`),
  `@libsql/client`, `heic-convert`, `ffmpeg-static` survive signing — anything `dlopen`-ed at
  runtime must be in `asarUnpack`. `resources/**` + `ffmpeg-static/**` are listed; add
  `node_modules/onnxruntime-node/**` and/or libsql native if the signed/notarized app fails to
  load them (a common notarization-time breakage).
- Root [`AGENTS.md`](../../AGENTS.md) Tier 3 — update to reflect signed macOS (no quarantine
  dance needed) and the Windows deferred status.
- **New** `.github/workflows/release.yml` — see #12 (the release + publish workflow is shared).

### Verify

```bash
# macOS — from apps/desktop
pnpm --filter @nimi/desktop build:mac          # → dist/nimi-<ver>.dmg + .zip
codesign --verify --deep --strict --verbose=2 "dist/mac*/Mikan.app"
spctl -a -vvv -t install "dist/mac*/Mikan.app"  # → "accepted, source=Notarized Developer ID"
xcrun stapler validate "dist/mac*/Mikan.app"
# boot it: worker forks, DB lands at ~/Library/Application Support/Mikan/neeme.db
```

---

## Package security — credential hygiene

**The concern:** could an API key, OAuth client secret, or other credential accidentally end up
baked into the distributed `.app` / `.dmg`? Here is the precise answer for nimi's build system.

### How electron-vite handles environment variables

electron-vite statically inlines env vars into the built bundle at **compile time** based on
their prefix. There are three tiers:

| Prefix | Ends up in | How |
|---|---|---|
| `MAIN_VITE_*` | Main process bundle (`app.asar → main/index.js`) | electron-vite replaces `import.meta.env.MAIN_VITE_*` at build time |
| `VITE_*` | Renderer bundle (`app.asar → renderer/index.html + js`) | Vite replaces `import.meta.env.VITE_*` at build time |
| *(no prefix)* e.g. `NEEME_*` | **NOT in the bundle** | Read via `process.env` at runtime; electron-vite ignores them |

The `.env` and `.env.*` files themselves are excluded from the asar by the `electron-builder.yml`
files exclusion rule (`'!{.env,.env.*,...}'`). The danger is not the `.env` *file* being
packed — it's the *values* of `MAIN_VITE_*` and `VITE_*` vars being statically inlined by
electron-vite into the bundle before electron-builder runs.

### What nimi currently bakes in (and whether it matters)

| Variable | Prefix | In distributable? | Sensitive? |
|---|---|---|---|
| `MAIN_VITE_LOGTO_ENDPOINT` | `MAIN_VITE_` | Yes — main bundle | **No.** Public OIDC issuer URL (e.g. `https://your-tenant.logto.app`). OAuth public metadata by design. |
| `MAIN_VITE_LOGTO_APP_ID` | `MAIN_VITE_` | Yes — main bundle | **No.** This is an OAuth *public client ID* for a Native/Desktop app. Per OAuth2 RFC 6749 §2.1, native apps are "public clients" — the client ID is not a secret and is intentionally visible. |
| `MAIN_VITE_LOGTO_RESOURCE` | `MAIN_VITE_` | Yes — main bundle | **No.** The API audience identifier (`https://api.neeme.app`). Public. |
| `MAIN_VITE_GOOGLE_CLIENT_ID` | `MAIN_VITE_` | Yes — main bundle | **No.** Desktop OAuth client ID. Public by design. |
| `MAIN_VITE_GOOGLE_CLIENT_SECRET` | `MAIN_VITE_` | Yes — main bundle | **Technically no** — the Google Cloud Console "Desktop app" OAuth client type is a public client; its "secret" is non-confidential per spec (acknowledged in `google-auth.ts`). However: ensure this credential is created as a **Desktop application** type in Google Cloud Console, not a Web Application type. Web Application secrets ARE confidential and must never be `MAIN_VITE_`-prefixed. |
| `VITE_NEEME_API_URL` | `VITE_` | Yes — renderer bundle | **No.** Just a base URL (`http://localhost:8000`). Not a credential. |
| `NEEME_ANTHROPIC_KEY` | *(none)* | **No — runtime only** | **YES — actual secret.** Read via `process.env` in the worker at runtime. Never in the bundle. |
| `NEEME_DRAFTER` / `NEEME_EMBEDDER` | *(none)* | **No — runtime only** | No. Behavioral flags. |
| `NEEME_CONNECTOR_SYNC_MINUTES` | *(none)* | **No — runtime only** | No. Config value. |
| `NEEME_USER_DATA` | *(none)* | **No — runtime only** | No. A filesystem path. |

### The one rule

> **`MAIN_VITE_*` / `VITE_*` = public configuration, baked into the app.**
> **`NEEME_*` (no prefix) = private / runtime, never in the app.**
>
> If a value is a secret (API key, OAuth client secret for a confidential client, auth token),
> it must have **no** `MAIN_VITE_` or `VITE_` prefix. Read it via `process.env` at runtime.
> If you accidentally add `MAIN_VITE_ANTHROPIC_KEY=sk-ant-...` to a `.env` file and run a
> build, that key is baked into every copy of the distributable.

### Pre-release credential audit checklist

Run this before cutting any release:

- [ ] **No secrets in committed files.** Confirm no `.env` (non-example) is tracked:
  ```bash
  git ls-files | grep '\.env'
  # Expected: empty (or only .env.example)
  ```
- [ ] **No new MAIN_VITE_ secrets.** Audit `env.d.ts` for any new `MAIN_VITE_*` entries added
  since the last release and confirm each is a public OAuth parameter, not an actual secret:
  ```bash
  git diff <last-tag> HEAD -- apps/desktop/src/main/env.d.ts
  ```
- [ ] **CI build job has no secret env vars set.** Review the GitHub Actions release workflow:
  the build step must NOT include `NEEME_ANTHROPIC_KEY`, any `MAIN_VITE_*_SECRET` that is
  actually confidential, or any auth token. Only signing credentials (`CSC_*`, `APPLE_*`)
  belong in the build job environment.
- [ ] **Spot-check the asar manifest** after building:
  ```bash
  npx asar list dist/mac*/Mikan.app/Contents/Resources/app.asar \
    | grep -iE '\.env|key|secret|token'
  # Expected: no .env files; no credential-adjacent filenames
  ```
- [ ] **Annually / per new MAIN_VITE_ var:** revisit `env.d.ts` and for each `MAIN_VITE_*`
  entry ask: *"Would it matter if every user of this app could read this value?"* If yes,
  remove the prefix and read it at runtime instead.

---

## #12 — Auto-updater (electron-updater)

### Current state

- `electron-updater ^6.3.9` is in [`package.json`](../../apps/desktop/package.json)
  `dependencies` (line 35) but **not wired anywhere** — a grep for
  `autoUpdater|electron-updater|checkForUpdates` matches only `package.json`, `pnpm-lock.yaml`,
  and `ROADMAP.md`. No `autoUpdater` import exists in `apps/desktop/src/main`.
- The publish feed is a **placeholder**: `electron-builder.yml` `publish: { provider: generic,
  url: https://example.com/auto-updates }` (lines 43-45) and
  [`dev-app-update.yml`](../../apps/desktop/dev-app-update.yml) mirrors it.
- Main is a thin router (`apps/desktop/src/main/index.ts`); the contract IPC surface
  ([`packages/contract/src/ipc.ts`](../../packages/contract/src/ipc.ts)) has **no `update:*`
  channels**. The preload bridge ([`src/preload/index.ts`](../../apps/desktop/src/preload/index.ts))
  is the only renderer surface.

### Decisions: resolved

- **Feed host: GitHub Releases** (`provider: github, owner: retrospct, repo: nimi`). Replace
  the placeholder `publish` block in both `electron-builder.yml` and `dev-app-update.yml`.
  The repo is public (or release assets are public), so `electron-updater` does not need a
  `GH_TOKEN` at runtime to poll the feed.
- **Auto vs. notify-then-restart:** default to `checkForUpdatesAndNotify()` (download in
  background, prompt to relaunch). A bare `quitAndInstall()` on launch is jarring for a
  tray app.

### File-by-file changes

- [`apps/desktop/electron-builder.yml`](../../apps/desktop/electron-builder.yml) — replace the
  placeholder `publish` block with:
  ```yaml
  publish:
    provider: github
    owner: retrospct
    repo: nimi
  ```
  Update `dev-app-update.yml` to match for local update testing.
- [`apps/desktop/src/main/index.ts`](../../apps/desktop/src/main/index.ts) — `import { autoUpdater } from 'electron-updater'`;
  after `initTrayWindow()` in `app.whenReady()`, call `autoUpdater.checkForUpdatesAndNotify()`
  (guarded to skip in dev / when no feed configured). Wire `autoUpdater.on('update-available' |
  'download-progress' | 'update-downloaded' | 'error', …)` — broadcast state to the renderer and
  call `autoUpdater.quitAndInstall()` only when the user opts in. Keep this in **main** (updater
  is an app-shell concern, not worker/data) per the SECURITY.md process model.
- [`packages/contract/src/ipc.ts`](../../packages/contract/src/ipc.ts) — add `update:get-state`,
  `update:check`, `update:restart`, and an `update:changed` main→renderer event (mirroring the
  `auth:*`/`connectors:*` pattern, lines 34-51), plus an `UpdateApi` interface and `update` field
  on `NimiApi`.
- [`src/preload/index.ts`](../../apps/desktop/src/preload/index.ts) — add the `update` bridge
  (same `ipcRenderer.invoke` + `onChanged` shape as `connectors`, lines 45-55).
- **Renderer** — a subtle "Update ready — restart" affordance in the tray window header
  (optional for first cut; the `checkForUpdatesAndNotify` native prompt is enough to ship).
- **New** `.github/workflows/release.yml` (shared with #13) — on a version tag, build the mac
  matrix and run `electron-builder … --publish always`, uploading the installer **and** the
  `latest-mac.yml` channel manifests electron-updater polls.

### Verify

```bash
# Local dry-run against a built feed
pnpm --filter @nimi/desktop build:mac          # publishes nothing without --publish
# Real flow: tag vX → release workflow publishes → install →
#            tag vX+1 → release workflow publishes →
#            launch vX, confirm: update-available → download → relaunch applies vX+1
```

macOS update **requires the signed + notarized build from #13** (Squirrel.Mac rejects
unsigned updates). Capture a manual updater runbook under `docs/testing/` (mirrors the
existing GUI runbooks).

---

## Cross-item ordering & human-only steps

**Order:** `#11 (vuln verify + CSP — cheap, parallelizable)` → `#13 (signed + notarized build)`
→ `#12 (updater feed wired to that build)`. #13 gates #12 on macOS; #11 is independent but is
part of the secure-release definition-of-done.

**Human-only (cannot be done by an agent):**
- Apple Developer Program enrollment (Steps 1–6 in the Apple notarization section above).
  Specifically: pay the $99/yr fee, create the Developer ID Application cert, create the App
  Store Connect API key, export the .p12, and store all six secrets in the GitHub repo.
- Run the pre-release credential audit checklist (Package security section) before each
  release tag — especially the `asar list` spot-check and the CI env review.
- (Post-alpha, when Windows is revisited) Set up Azure Trusted Signing and add `WIN_CSC_*`
  secrets to the repo.
- Store all credentials as **repository secrets** — a human action; never commit them.

## Verify (whole workstream)

```bash
pnpm audit                                   # clean
gh api repos/retrospct/nimi/dependabot/alerts # no open alerts
pnpm typecheck && pnpm build && pnpm lint    # green (contract + preload + main changes)
pnpm --filter @nimi/desktop build:mac        # signed, notarized dmg/zip
# spctl/codesign/stapler checks pass (see #13)
# updater: vX → vX+1 applies on relaunch (see #12)
```

## Risks / notes

- **Notarization breaks native loads.** Hardened runtime + the asar boundary are where
  onnxruntime-node / libsql / ffmpeg most often fail in a *signed* build that worked unsigned.
  Budget time for `asarUnpack` + entitlements iteration; verify with a clean machine / fresh
  user, not just the dev box.
- **CSP `unsafe-inline` removal may regress styling** (Tailwind v4 inject + runtime accent
  tweak). If removal is risky, ship the local-fonts win + tightened `connect-src`/`font-src`
  first and track `style-src` hardening as a fast follow rather than blocking the release.
- **electron-updater dev caveat:** updates don't run from `electron-vite dev`; testing needs
  packaged builds + a real (or `dev-app-update.yml`) feed.
- **`MAIN_VITE_GOOGLE_CLIENT_SECRET` note:** this is intentionally baked in because Google's
  "Desktop application" OAuth client type is a public client per spec. But if the Google
  connector is ever migrated to a server-side flow (Web Application type), that secret MUST
  move to a `NEEME_*` runtime var and never touch the `MAIN_VITE_` prefix.
