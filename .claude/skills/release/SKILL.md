---
name: release
description: Cut a nimi release. Use when the user wants to ship/release/publish a new version, cut a release, or build & publish Mikan or Momo. Drives the release-please flow (unified versioning + changelog) and the build/publish workflows.
---

# Cutting a nimi release

nimi releases are **deliberate and fully manual** — nothing releases on a merge or
rebase to `main`. The entire flow is triggered from here. All workspaces share
**one version** (root-driven). The machinery:

- **`release-please`** (`.github/workflows/release-please.yml`, `release-please-config.json`,
  `.release-please-manifest.json`) runs **only on manual dispatch** and, on `main`,
  maintains a single **"Release PR"** that bumps the unified version (root + every
  workspace `package.json`) and writes `CHANGELOG.md` from Conventional Commits.
- **`release.yml`** ("Release (build & publish)") is the reusable build job. It builds
  Mikan automatically when a release is cut; **Momo** is opt-in via manual dispatch.
- **commitlint** enforces Conventional Commits (husky hook + CI), which is what makes
  the version bump + changelog correct.

Because release-please is dispatch-only, cutting a release is a **two-phase** flow
(dispatch → merge the Release PR → dispatch again to ship). The repo is restricted to
`retrospct/nimi`; use the `mcp__github__*` tools.

## To cut a release (Mikan)

1. **Confirm `main` is green** and the changes to ship are merged to `main`.
   - `mcp__github__list_commits` / `mcp__github__actions_list`. Conventional-commit
     types since the last release decide the bump (`feat` → minor, `fix` → patch,
     `feat!`/`BREAKING CHANGE` → major).
2. **Phase 1 — open/update the Release PR.** Dispatch the **"Release Please"** workflow
   on `main` (`mcp__github__actions_run_trigger`, workflow `release-please.yml`). It
   opens or updates a PR titled `chore: release v<version>`. (If no PR appears, there
   are no releasable changes since the last release — say so and stop.)
3. **Review + confirm.** Show the user the proposed version + changelog from the
   Release PR (`mcp__github__list_pull_requests` → read the body) and confirm with
   `AskUserQuestion` before shipping.
4. **Merge the Release PR** once confirmed (`mcp__github__merge_pull_request`). This
   alone does **not** ship (release-please is dispatch-only) — it just lands the
   version bump + changelog on `main`.
5. **Phase 2 — ship.** Dispatch **"Release Please"** again. release-please now sees the
   merged release commit, tags `v<version>`, creates the GitHub Release, and the
   `publish-mikan` job builds + publishes the Mikan macOS app.
6. **Confirm the tag was actually cut, then watch the build.** The `publish-mikan` job
   is gated on `release_created == 'true'` — a green Release Please run that *skipped*
   `publish-mikan` means **no release was cut**. Verify: (a) `mcp__github__get_release_by_tag`
   for `v<version>` returns a release; (b) `publish-mikan` ran (not skipped); (c)
   `.release-please-manifest.json` on `main` now reads `<version>`. If instead the logs
   show `⚠ PR component: undefined does not match configured component: nimi` /
   `Expected 1 releases, only found 0`, the config regressed — `separate-pull-requests`
   must be `true` and `include-component-in-tag` must be `false` (see `docs/RELEASING.md`,
   "Why `separate-pull-requests: true`"). Then watch the `publish-mikan` build and report
   the result; on failure, diagnose from job logs and fix forward.

## To build/publish Momo (opt-in)

Momo publishes to its own repo (`retrospct/momo`, see `@nimi/brand` identity.json)
and is **inert until that repo + a cross-repo publish token exist** (the default
`GITHUB_TOKEN` only reaches `retrospct/nimi`). Once ready:

- Trigger the **"Release (build & publish)"** workflow via `workflow_dispatch` with
  `brand=momo` and `ref=v<version>` (the tag cut above) — `mcp__github__actions_run_trigger`.

## Notes / guardrails

- Never bump versions or write the changelog by hand — release-please owns both.
  To influence the bump, land properly-typed Conventional Commits, then re-run phase 1.
- Do not create a release tag manually; the phase-2 dispatch is the only release path.
- If the user just wants a *changelog preview*, run phase 1 and point them at the
  Release PR rather than shipping.
