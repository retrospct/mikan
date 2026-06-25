# Release Please — Team Quick Reference

**What it is:** a GitHub Action that turns your [Conventional Commits](https://www.conventionalcommits.org/) into an always-up-to-date **"Release PR"** (version bump + changelog). You don't tag or write changelogs by hand — **you ship by merging that PR.**

Works great in a **Turborepo / Next.js monorepo**: one version for the whole repo, one changelog, and merging the Release PR cuts the GitHub Release — which your pipeline turns into versioned **container images and Helm charts** (no Vercel required).

## The one rule

> **Merging the Release PR = cutting a release.** Everything else is just normal development.

A normal feature merge never ships — it only *updates* the pending Release PR. If the Release PR gets merged to `main`, Release Please will tag + GitHub Release that commit to kick off the build and publish pipelines.

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontFamily": "ui-sans-serif, -apple-system, Segoe UI, sans-serif", "fontSize": "14px", "lineColor": "#7aa2f7", "primaryColor": "#24283b", "primaryTextColor": "#c0caf5", "primaryBorderColor": "#414868", "tertiaryColor": "#1f2335", "edgeLabelBackground": "#1a1b26"}}}%%
flowchart LR
    A["Feature PR"] -.-> D(["to main"])
    B["Feature PR"] -.-> DD(["to main"])
    C["Feature PR"] -.-> DDD(["to main"])
    D --> E(["release-please"])
    DD --> E
    DDD --> E
    E ==> F["Release PR<br/>semver & changelog"]
    F -.-> H(["to main"])
    H ==> K(["Tag vX.Y.Z"])
    K --> L(["GitHub Release"])
    K --> M(["Build &amp; Publish"])

    classDef dev fill:#24314f,stroke:#7aa2f7,color:#c0caf5;
    classDef bot fill:#2d2a45,stroke:#bb9af7,color:#c0caf5;
    classDef ship fill:#1a1b26,stroke:#16a34a,color:#c0caf5;
    classDef act fill:#24283b,stroke:#dcfce7,color:#c0caf5;
    class A,B,C dev
    class E,K,L,M bot
    class F ship
    class D,DD,DDD,H act
    linkStyle default stroke:#565f89,color:#a9b1d6;
```

## Conventional Commits = your version control

The commit *type* on each PR decides the next version automatically:

| Commit                                     | Example                 | Version effect (`1.4.2` →) |
| ------------------------------------------ | ----------------------- | -------------------------- |
| `fix:`                                     | `fix: handle null user` | **patch** → `1.4.3`        |
| `feat:`                                    | `feat: add CSV export`  | **minor** → `1.5.0`        |
| `feat!:` or `BREAKING CHANGE:` footer      | `feat!: drop Node 18`   | **major** → `2.0.0`        |
| `chore:` `docs:` `refactor:` `test:` `ci:` | housekeeping            | no bump                    |

Tip: enforce these with **commitlint** as a PR check so the version/changelog stay correct. Squash-merging PRs with a Conventional-Commit *title* is the easiest way to keep history clean.

## What you actually do day-to-day

1. **Write Conventional Commit messages** and merge feature PRs to `main` like normal.
2. **Ignore the bot's Release PR** until you're ready — it just keeps re-computing the next version + changelog.
3. **To release:** open the Release PR, sanity-check the version + changelog, **merge it.** That tags `vX.Y.Z`, creates the GitHub Release, and (if wired) triggers your build/deploy.

## Setup — 3 files

### 1. `release-please-config.json`

Unified version across the whole monorepo (recommended for a product monorepo — one version, one changelog). `extra-files` keeps every app/package `package.json` in lockstep:

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "release-type": "node",
  "include-component-in-tag": false,
  "separate-pull-requests": true,
  "packages": {
    ".": {
      "package-name": "my-monorepo",
      "changelog-path": "CHANGELOG.md",
      "extra-files": [
        { "type": "json", "path": "apps/web/package.json", "jsonpath": "$.version" },
        { "type": "json", "path": "apps/docs/package.json", "jsonpath": "$.version" },
        { "type": "json", "path": "packages/ui/package.json", "jsonpath": "$.version" }
      ]
    }
  }
}
```

> **Prefer per-package versions** (each app/package released independently)? Drop `extra-files` and add one entry per package under `"packages"`, each with its own path — Release Please will maintain a separate Release PR per package. Unified is simpler; per-package suits published libraries.

### 2. `.release-please-manifest.json`

The current version — Release Please reads & writes this. Seed it with where you are today:

```json
{ ".": "0.1.0" }
```

### 3. `.github/workflows/release-please.yml`

The `release-please` job maintains the PR; a **gated `publish` job** runs *only* on the push that merges the Release PR (keyed off `release_created`) and builds your **Next.js standalone container + Helm chart**, pushing both to **GHCR** tagged with the release version:

```yaml
name: Release Please
on:
  push: { branches: [main] }
  workflow_dispatch: # manual fallback
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
      # Helm chart versions must be SemVer with NO leading "v"
      - run: echo "VERSION=${TAG#v}" >> "$GITHUB_ENV"
        env:
          TAG: ${{ needs.release-please.outputs.tag_name }}

      # Next.js standalone image
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ env.IMAGE }}:${{ env.VERSION }},${{ env.IMAGE }}:latest

      # Helm chart (OCI)
      - run: |
          helm package ./charts/web --version "$VERSION" --app-version "$VERSION"
          helm push "web-${VERSION}.tgz" "oci://ghcr.io/${{ github.repository_owner }}/charts"
```

> **Adding Harbor later:** the publish steps are registry-agnostic — adding Harbor is a *second* `docker/login-action` + push (and `helm registry login harbor.example.com …`) with Harbor host + creds, not a rewrite. The clean way is to make `publish` a **reusable workflow** called once per registry via a matrix — see the setup skill's `references/examples.md`.

## Two gotchas that bite everyone

1. **Build jobs must live in the *same* workflow run**, gated on `release_created` (the `publish` job above) — **not** a separate `on: release` workflow. A release created with the default `GITHUB_TOKEN` will **not** trigger downstream `on: release` / tag-push workflows (GitHub's loop-prevention). Use the gated-job pattern, or a PAT if you truly need a separate workflow.
2. **Enable repo setting "Allow GitHub Actions to create and approve pull requests"** (Settings → Actions → General → Workflow permissions), or the bot can't open the Release PR.

### Bonus gotcha (only if you use the unified-version config above)

Keep `**separate-pull-requests: true`***and* `**include-component-in-tag: false`** together. With `separate-pull-requests: false`, Release Please routes the single Release PR onto a component-less branch, and at tag time the component derived from your root `package.json` `name` won't match — it silently discards the release and **no tag is cut** (`⚠ PR component: undefined does not match configured component: …`). The pair above keeps clean `vX.Y.Z` tags *and* actually tags.

## Real example

A working version of this in a pnpm + Turborepo monorepo (with gated build/publish jobs) lives at `[.github/workflows/release-please.yml](../.github/workflows/release-please.yml)` in this repo.

---

*Adapted from the nimi release pipeline. Reference: [release-please docs](https://github.com/googleapis/release-please).*
