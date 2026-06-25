# Releasing nimi

How we cut releases. The short version: release-please keeps **one Release PR** up to
date on every push to `main`; you ship by **merging that PR**. A normal feature merge
never ships — only merging the bot's Release PR does. The `/release` skill drives the
review → confirm → merge → watch loop.

## Concepts

- **Unified versioning.** Every workspace (`apps/desktop`, `apps/mobile`,
  `packages/contract`, `packages/brand`, `services/token-broker`) and the repo root share
  **one version** — release-please bumps them all via `extra-files`. Today only
  `@nimi/desktop` reads the version at build time; the rest get a coherent bump so the repo
  stays in lockstep (and mobile is ready when it ships).
- **Conventional Commits drive the version + changelog.** `feat:` → minor, `fix:` → patch,
  `feat!:` / `BREAKING CHANGE:` → major. Other types (`chore`, `docs`, `refactor`, …) don't
  bump but still appear in history. Enforced by **commitlint** (husky `commit-msg` hook +
  `.github/workflows/commitlint.yml`).
- **Single brand: Mikan.** The desktop app builds Mikan and publishes to `retrospct/nimi`.
  The build-time brand layer (`@nimi/brand`) is kept (it's the product-identity + design-token
  SSOT) but currently carries a single brand.

## Moving parts

| File                                   | Role                                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `release-please-config.json`           | release-please manifest config: single root release, `extra-files` bump every workspace `package.json`, clean `v<version>` tags. **`separate-pull-requests: true` + `include-component-in-tag: false` are load-bearing — see "Why the config looks like this".** |
| `.release-please-manifest.json`        | The current released version (source of truth release-please reads/writes).                                                            |
| `.github/workflows/release-please.yml` | **Runs on push to `main`.** Maintains the Release PR; on the Release PR's merge, tags + creates the Release and runs the gated publish jobs. |
| `.github/workflows/release.yml`        | Reusable desktop build/publish (`workflow_call` + `workflow_dispatch`). Signs + notarizes + publishes via electron-builder.            |
| `.github/workflows/release-mobile.yml` | Reusable mobile build/submit via EAS. **Inert until `EXPO_TOKEN` + an EAS project exist.**                                              |
| `.github/workflows/commitlint.yml`     | Validates Conventional Commits on PRs.                                                                                                 |
| `.claude/skills/release/SKILL.md`      | The `/release` skill that drives the flow below.                                                                                       |

## Cutting a release

1. **Land your changes on `main`** with Conventional Commits; make sure CI is green. Each
   push to `main` re-runs **Release Please**, which opens/updates the Release PR titled
   `chore: release <version>` with the computed bump + changelog. Nothing ships yet.
2. **Review** the version + changelog in that Release PR.
3. **Merge the Release PR.** This is the ship action. The merge is a push to `main`, so
   release-please runs again, detects the merged release commit, tags `v<version>`, creates
   the GitHub Release, and triggers the gated publish jobs:
   - `publish-desktop` builds, signs, notarizes, and publishes the macOS app;
     `electron-updater` clients pick it up from the Release's `latest-mac.yml`.
   - `publish-mobile` runs EAS build/submit (a no-op until EAS is configured — see below).
4. **Confirm the tag was actually cut** (next section).

> Why "merge = ship" is safe: release-please only tags when it sees **its own** Release PR
> merged. Normal feature merges just update the Release PR — they never ship. Shipping stays
> a single, deliberate click (the merge), with no manual dispatch dance.

### Confirming the release actually cut (don't trust a green run)

The publish jobs are gated on `release_created == 'true'`. A green Release Please run that
**skipped** `publish-desktop` means **no release was cut**. After merging, confirm all three:

1. **Tag + Release exist:** `gh release view v<version>` (or `mcp__github__get_release_by_tag`).
2. **`publish-desktop` ran** (not skipped) in that Release Please run — `gh run view`.
3. **The manifest advanced:** `.release-please-manifest.json` on `main` now reads `<version>`.

If you see this in the logs, release-please found the merged PR but discarded it, so no tag
was cut and the build was skipped:

```
⚠ PR component: undefined does not match configured component: nimi
⚠ Expected 1 releases, only found 0
```

### Why the config looks like this (`separate-pull-requests: true`)

This pair is the fix for exactly that failure (the v1.3.0 saga). It is **not** about having
more than one PR — there's a single root package, so there's only ever one Release PR.
`separate-pull-requests` controls release-please's internal **Merge plugin**:

- With `separate-pull-requests: false`, the Merge plugin rewrites the Release PR onto the
  **component-less** branch `release-please--branches--main`. At tag time, release-please
  compares that branch's component (`undefined`) against the strategy's configured component —
  for `release-type: node` that's the root `package.json` `name` (**`nimi`**) — so
  `'' !== 'nimi'`, the release is discarded, and no tag is cut. Editing the PR title or
  `pull-request-title-pattern` does **not** help; the discard happens on the component check.
- With `separate-pull-requests: true`, the Merge plugin is skipped, so the single PR keeps its
  **component-ful** branch `release-please--branches--main--components--nimi`. The component
  matches, the release is built, and `include-component-in-tag: false` still yields a clean
  `v<version>` tag.

Keep `separate-pull-requests: true` **and** `include-component-in-tag: false` together —
flipping either one back reintroduces the broken combination.

## Mobile (EAS) — wiring it on (one-time setup)

`release-mobile.yml` is wired into the release but **inert** (a green no-op) until you set it
up. Every step is guarded by `EXPO_TOKEN` being present. To turn it on:

1. Create an Expo account + EAS project and `apps/mobile/eas.json` with a `production` profile
   (`eas init` / `eas build:configure`). Use the `expo:expo-cicd-workflows` and
   `expo:expo-deployment` skills for current specifics.
2. Add an `EXPO_TOKEN` repo **Secret** (Expo access token).
3. For store submission, add iOS/Android credentials (EAS-managed, or App Store Connect API
   key + Play service account) and uncomment the `EAS Submit` step in `release-mobile.yml`.

Until then, mobile just receives the version bump (no build), with no effect on the release.

## Versioning a major/minor milestone

You don't bump versions by hand — the commit types since the last release decide the bump. To
force a minor (e.g. a milestone), include a `feat:` commit; for a major, use `feat!:` or a
`BREAKING CHANGE:` footer, then merge the Release PR.

## Prerequisites / secrets

The desktop build/publish job needs repo **Secrets** (not Vars): `CSC_LINK`,
`CSC_KEY_PASSWORD`, `APPLE_TEAM_ID`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`,
and the inlined public client config (`MAIN_VITE_LOGTO_*`, `MAIN_VITE_NEEME_SYNC_BROKER_URL`,
`MAIN_VITE_GOOGLE_CLIENT_*`). See the comments in `release.yml` for why these are Secrets and
what ships inert without them. Mobile additionally needs `EXPO_TOKEN` (above).

Repo setting: **"Allow GitHub Actions to create and approve pull requests"** must stay enabled
(`can_approve_pull_request_reviews=true`) so release-please can open/update the Release PR.
