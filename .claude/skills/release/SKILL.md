---
name: release
description: Cut a nimi release. Use when the user wants to ship/release/publish a new version, cut a release, or build & publish the desktop or mobile app. Drives the release-please flow (unified versioning + changelog) and the build/publish workflows.
---

# Cutting a nimi release

nimi uses release-please's **standard Release PR mechanism**. On every push to `main`,
the **Release Please** workflow (`.github/workflows/release-please.yml`) runs and keeps a
single open **"Release PR"** up to date — it bumps the unified version (root + every
workspace `package.json` via `extra-files`) and writes `CHANGELOG.md` from Conventional
Commits. A normal feature merge does **not** ship; release-please only tags when it sees
its own Release PR merged.

**Shipping is one deliberate step: merge the Release PR.** That merge is a push to `main`,
so release-please runs again, tags `v<version>`, creates the GitHub Release, and the gated
build jobs publish for that tag:

- **`publish-desktop`** → `release.yml`: signs, notarizes, and publishes the macOS app
  (single brand, **Mikan** → `retrospct/nimi`). `electron-updater` clients pick it up from
  the Release's `latest-mac.yml`.
- **`publish-mobile`** → `release-mobile.yml`: EAS build/submit. **Inert until `EXPO_TOKEN`
  + an EAS project are configured** — a green no-op until then (see `docs/RELEASING.md`).

commitlint (husky hook + CI) enforces Conventional Commits, which is what makes the bump +
changelog correct. The repo is restricted to `retrospct/nimi`; use the `mcp__github__*` tools.

## To cut a release

1. **Confirm `main` is green** and the changes to ship are merged (`mcp__github__list_commits`
   / `actions_list`). Conventional-commit types since the last release decide the bump
   (`feat` → minor, `fix` → patch, `feat!`/`BREAKING CHANGE` → major).
2. **Find the open Release PR.** release-please maintains it automatically — no dispatch
   needed (`mcp__github__list_pull_requests`, head branch
   `release-please--branches--main--components--nimi`, label `autorelease: pending`). If
   there's no Release PR, there are no releasable commits since the last release — say so and
   stop. (If `main` was just pushed, give the Release Please run a moment to open/update it.)
3. **Review + confirm.** Show the user the proposed version + changelog from the PR body and
   confirm with `AskUserQuestion` before shipping.
4. **Merge the Release PR** once confirmed (`mcp__github__merge_pull_request`). The merge
   triggers release-please, which tags `v<version>`, creates the Release, and starts the
   gated `publish-desktop` + `publish-mobile` jobs.
5. **Confirm the tag was actually cut — don't trust a green run.** The publish jobs are gated
   on `release_created == 'true'`; a Release Please run that *skipped* them means no release
   was cut. Verify all three:
   - `mcp__github__get_release_by_tag` for `v<version>` returns a release;
   - `publish-desktop` ran (not skipped) in that Release Please run;
   - `.release-please-manifest.json` on `main` now reads `<version>`.
   If the logs show `⚠ PR component: undefined does not match configured component: nimi` /
   `Expected 1 releases, only found 0`, the config regressed — `separate-pull-requests` must
   be `true` and `include-component-in-tag` must be `false` (see `docs/RELEASING.md`).
6. **Watch the builds and report.** Tail `publish-desktop` (and `publish-mobile` if EAS is
   configured) via `actions_list` / `actions_get`. On failure, diagnose from job logs and fix
   forward.

## Notes / guardrails

- Never bump versions or write the changelog by hand — release-please owns both. To influence
  the bump, land properly-typed Conventional Commits; release-please updates the Release PR on
  the next push to `main`.
- Do not create a release tag manually; merging the Release PR is the only release path.
- If the user just wants a *changelog preview*, point them at the open Release PR rather than
  merging.
- **Mobile (EAS) is opt-in setup.** Until `EXPO_TOKEN` + `apps/mobile/eas.json` + store
  credentials exist, `publish-mobile` no-ops. Wiring it on is its own task — see the EAS
  section in `docs/RELEASING.md`.
