# Releasing nimi

How we cut releases. The short version: **releases are deliberate and fully
manual** — nothing ships on a merge or rebase to `main`. A release is initiated
only through the `/release` skill (which dispatches the release workflow).

## Concepts

- **Unified versioning.** Every workspace (`apps/desktop`, `apps/mobile`,
  `packages/contract`, `packages/brand`, `services/token-broker`) and the repo root
  share **one version**. There is no independent per-package versioning.
- **Conventional Commits drive the version + changelog.** `feat:` → minor,
  `fix:` → patch, `feat!:` / `BREAKING CHANGE:` → major. Other types (`chore`,
  `docs`, `refactor`, `test`, `ci`, …) don't bump the version but still appear in
  history. This is enforced by **commitlint** (husky `commit-msg` hook locally +
  `.github/workflows/commitlint.yml` on PRs).
- **Brand is chosen at build time.** Each release builds a specific brand
  (`BRAND=mikan` by default). **Mikan** publishes to `retrospct/nimi`; **Momo** is
  opt-in and publishes to its own repo (see `packages/brand/src/identity.json`).

## Moving parts

| File                                   | Role                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `release-please-config.json`           | release-please manifest config: single root release, `extra-files` bump every workspace `package.json`, clean `v<version>` tags. **`separate-pull-requests: true` is load-bearing — see "Why `separate-pull-requests: true`" below.** |
| `.release-please-manifest.json`        | The current released version (source of truth release-please reads/writes).                                                                       |
| `.github/workflows/release-please.yml` | **Dispatch-only.** Maintains the Release PR; on a dispatch after that PR merges, tags + creates the Release and triggers the Mikan build.         |
| `.github/workflows/release.yml`        | Reusable build/publish job (`workflow_call` + `workflow_dispatch`), parameterized by `BRAND`. Signs + notarizes + publishes via electron-builder. |
| `.github/workflows/commitlint.yml`     | Validates Conventional Commits on PRs.                                                                                                            |
| `.claude/skills/release/SKILL.md`      | The `/release` skill that drives the flow below.                                                                                                  |

## Cutting a release (Mikan) — the two-phase flow

Because release-please runs **only on manual dispatch**, a release is two dispatches
with a PR merge between them. The `/release` skill automates the orchestration; the
manual equivalent:

1. **Land your changes on `main`** with Conventional Commits, and make sure CI is
   green.
2. **Phase 1 — open the Release PR.** Run the **Release Please** workflow
   (Actions → Release Please → Run workflow, on `main`). It opens/updates a PR titled
   `chore: release v<version>` with the computed version bump + changelog. Nothing
   ships yet.
3. **Review** the version + changelog in that PR.
4. **Merge the Release PR.** This lands the version bump + `CHANGELOG.md` on `main`.
   It does **not** ship on its own (the workflow isn't push-triggered).
5. **Phase 2 — ship.** Run the **Release Please** workflow again. It detects the
   merged release commit, tags `v<version>`, creates the GitHub Release, and the
   `publish-mikan` job builds, signs, notarizes, and publishes the macOS app.
   `electron-updater` clients pick it up from the Release's `latest-mac.yml`.

> Why two dispatches instead of "merge = ship"? We deliberately keep `main`
> automation-free: a normal merge/rebase never triggers a release. Shipping is
> always an explicit action.

### Confirming Phase 2 actually tagged (don't trust "the PR merged")

Phase 2 only ships if release-please **creates the tag + GitHub Release** — that's
the gate (`publish-mikan` runs only when `release_created == 'true'`). After the
second dispatch, confirm all three landed before walking away:

1. **Tag exists:** `gh release view v<version>` (or `git ls-remote --tags origin`)
   shows the new `v<version>`.
2. **`publish-mikan` ran** (not skipped) in the Release Please run — `gh run view`.
3. **The manifest advanced:** release-please's github-release step writes the new
   version back to `.release-please-manifest.json` on `main`. If that file is still
   at the *previous* version after a "successful" Phase 2, the release step silently
   matched **zero** releases — see below.

If you see this in the Release Please logs, Phase 2 found the merged PR but threw it
away, so no tag was cut and `publish-mikan` was skipped:

```
⚠ PR component: undefined does not match configured component: nimi
⚠ Expected 1 releases, only found 0
```

### Why `separate-pull-requests: true`

This is the fix for exactly that failure (v1.3.0, 2026-06). It is **not** about
having more than one PR — there's a single root package, so there is only ever one
release PR either way. It controls whether release-please runs its internal **Merge
plugin**:

- With `separate-pull-requests: false`, the Merge plugin rewrites the release PR onto
  the **component-less** branch `release-please--branches--main`. At Phase 2,
  `buildRelease` takes the "standalone PR" path and compares the branch's component
  (`undefined`) against the strategy's configured component. For `release-type: node`
  that component is derived from the root `package.json` `name` (**`nimi`**) — so
  `'' !== 'nimi'`, the release is discarded, and no tag is cut. Editing the PR title
  or `pull-request-title-pattern` does **not** help: the discard happens on the
  component check, before the title matters.
- With `separate-pull-requests: true`, the Merge plugin is skipped, so the single PR
  keeps its **component-ful** branch `release-please--branches--main--components--nimi`.
  Now the branch component (`nimi`) matches the configured component, the release is
  built, and `include-component-in-tag: false` still yields a clean `v<version>` tag.

So: keep `separate-pull-requests: true` **and** `include-component-in-tag: false`
together. Flipping either one back reintroduces the broken combination. Unified
versioning is unaffected — the `extra-files` fan-out is the root package's job and has
nothing to do with the Merge plugin.

## Releasing Momo

Momo is **not** built on a normal release. When its release repo + a cross-repo
publish token exist, run the **Release (build & publish)** workflow manually with
`brand=momo` and `ref=v<version>` (the tag from the Mikan release, or a tag you cut
for Momo). Until then it's inert — the default `GITHUB_TOKEN` only reaches
`retrospct/nimi`.

## Versioning a major/minor milestone

You don't bump versions by hand — the commit types since the last release decide the
bump. To force a minor (e.g. a milestone), include a `feat:` commit; for a major,
use `feat!:` or a `BREAKING CHANGE:` footer. Then run the flow above.

## Prerequisites / secrets

The build/publish job needs repo **Secrets** (not Vars): `CSC_LINK`,
`CSC_KEY_PASSWORD`, `APPLE_TEAM_ID`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`,
`APPLE_API_ISSUER`, and the inlined public client config (`MAIN_VITE_LOGTO_*`,
`MAIN_VITE_NEEME_SYNC_BROKER_URL`, `MAIN_VITE_GOOGLE_CLIENT_*`). See the comments in
`release.yml` for why these are Secrets and what ships inert without them.
