---
name: setup-release-please
description: >-
  Set up Release Please for automated, Conventional-Commit-driven versioning,
  changelogs, and GitHub Releases — especially in a pnpm + Turborepo / Next.js
  monorepo. Use this whenever the user wants to adopt Release Please, automate
  releases/versioning/changelogs, stop tagging and writing changelogs by hand,
  wire a "Release PR" flow into CI, cut releases on merge, or asks how to ship
  versions from GitHub Actions — even if they don't say "Release Please" by name.
---

# Set up Release Please

Release Please replaces hand-tagging and hand-written changelogs with a bot-maintained
**Release PR**. On every push to `main` it keeps one PR up to date (next version +
`CHANGELOG.md`, computed from Conventional Commits). **Merging that PR is the release** —
it tags `vX.Y.Z`, creates the GitHub Release, and can trigger a build/deploy.

Get the mental model right before touching files: a normal feature merge **does not ship** —
it only updates the Release PR. Release Please tags only when it sees *its own* Release PR
merged. That's why "merge = ship" is safe and why you never need a manual tag step.

## Decide two things first

Ask the user (or infer from the repo) before writing config:

1. **Unified or per-package versioning?**
   - **Unified** (one version + one changelog for the whole monorepo) — the right default for a
     *product* monorepo (apps that ship together, e.g. a Next.js web app + workers + shared
     packages). One root release, `extra-files` keeps every `package.json` in lockstep.
   - **Per-package** (each package versioned/released independently) — right for a monorepo of
     *published libraries*. One Release PR per package.

2. **What does "publish" mean for this repo?** Merging the Release PR cuts the tag + GitHub
   Release; a gated job turns that into shippable artifacts. For a Next.js + Kubernetes shop
   that's a **standalone container image + a Helm chart** pushed to an OCI registry (GHCR today,
   Harbor later); for a library it's an **`npm publish`**. Whatever it is, it's **one gated job**
   keyed off `release_created` (Step 3). There's no auto-deploy shortcut unless your platform
   already deploys on push to `main`.

## Step 1 — `release-please-config.json` (repo root)

Unified version (most common). Swap `package-name` and the `extra-files` paths for the repo:

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "release-type": "node",
  "include-component-in-tag": false,
  "separate-pull-requests": true,
  "packages": {
    ".": {
      "package-name": "<repo-name>",
      "changelog-path": "CHANGELOG.md",
      "extra-files": [
        { "type": "json", "path": "apps/web/package.json", "jsonpath": "$.version" },
        { "type": "json", "path": "packages/ui/package.json", "jsonpath": "$.version" }
      ]
    }
  }
}
```

For **per-package** instead, drop `extra-files` and give each package its own entry under
`"packages"` (each with its own `path` + `package-name`). See `references/examples.md`.

> **Keep `separate-pull-requests: true` AND `include-component-in-tag: false` together** for the
> unified config. This is non-obvious and load-bearing — see Gotcha 3. Flipping either causes
> Release Please to silently refuse to tag.

## Step 2 — `.release-please-manifest.json` (repo root)

Seed it with the current version (the bot reads/writes this going forward):

```json
{ ".": "0.1.0" }
```

Also make sure the root `package.json` `version` matches.

## Step 3 — `.github/workflows/release-please.yml`

Trigger on **push to `main`** (the standard mechanism — the PR stays current automatically). The
`release-please` job maintains the PR; the gated `publish` job runs only on the push that merges
it (keyed off `release_created`) and builds the artifacts for the freshly cut tag:

```yaml
name: Release Please
on:
  push: { branches: [main] }
  workflow_dispatch:
permissions:
  contents: write
  pull-requests: write
jobs:
  release-please:
    runs-on: ubuntu-latest
    outputs:
      release_created: ${{ steps.release.outputs.release_created }}
      tag_name: ${{ steps.release.outputs.tag_name }}
    steps:
      - uses: googleapis/release-please-action@v5
        id: release
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

  publish:
    needs: release-please
    if: ${{ needs.release-please.outputs.release_created == 'true' }}
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write } # push to GHCR
    env:
      IMAGE: ghcr.io/${{ github.repository }}/web
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ needs.release-please.outputs.tag_name }}
      - run: echo "VERSION=${TAG#v}" >> "$GITHUB_ENV" # Helm needs SemVer w/o leading v
        env:
          TAG: ${{ needs.release-please.outputs.tag_name }}
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: "${{ env.IMAGE }}:${{ env.VERSION }},${{ env.IMAGE }}:latest"
      - run: |
          helm package ./charts/web --version "$VERSION" --app-version "$VERSION"
          helm push "web-${VERSION}.tgz" "oci://ghcr.io/${{ github.repository_owner }}/charts"
```

This assumes a **Next.js standalone** image (`output: 'standalone'` in `next.config`) and a chart
under `charts/web`, both versioned in lockstep with the unified release version. For the fully
annotated job, a multi-image/multi-chart matrix, and the **Harbor-ready reusable-workflow**
pattern (so adding a second registry is config, not a rewrite), see `references/examples.md`.

## Step 4 — Enable the repo setting

In **Settings → Actions → General → Workflow permissions**, enable **"Allow GitHub Actions to
create and approve pull requests."** Without it the bot can't open the Release PR (you'll see
`GitHub Actions is not permitted to create or approve pull requests`). For a personal account
there's no org-level override; the repo toggle is it.

## Step 5 — Verify before relying on it

Run a dry run locally (no changes pushed) to confirm config parses and the next version computes:

```bash
npx release-please@latest release-pr \
  --token="$(gh auth token)" --repo-url=<owner>/<repo> \
  --target-branch=main --dry-run --debug
```

Then the real end-to-end check: land a `feat:`/`fix:` commit on `main`, confirm the **Release
Please** action opened/updated a Release PR automatically, merge it, and confirm a `vX.Y.Z` tag
+ GitHub Release appeared — and that the gated `publish` job ran (not skipped) and pushed the
image + chart.

## Gotchas (these bite everyone)

1. **No separate `on: release` build workflow.** A release created with the default
   `GITHUB_TOKEN` does **not** trigger downstream `on: release` / tag-push workflows (GitHub
   loop-prevention). Keep the build as a **gated job in the same run** (the `publish` job), or use a PAT.
2. **The PR-creation permission** (Step 4) — the single most common "why is nothing happening."
3. **`separate-pull-requests` + `include-component-in-tag` interaction** (unified config). With
   `separate-pull-requests: false`, the Merge plugin routes the Release PR onto a component-less
   branch; at tag time the component derived from the root `package.json` `name` doesn't match,
   so the release is **silently discarded — no tag** (`⚠ PR component: undefined does not match
   configured component: <name>`). `separate-pull-requests: true` keeps the PR on a
   component-ful branch that matches, while `include-component-in-tag: false` keeps tags clean as
   `vX.Y.Z`. Editing the PR title does **not** fix it — the discard is on the component check.

## References

- `references/examples.md` — full annotated `release-please.yml` (gated build/publish),
  per-package config example, and `commitlint` setup to enforce Conventional Commits.
