# Release Please — full examples

Deeper, copy-ready examples referenced from `SKILL.md`. Read the section you need.

## Table of contents
- [Build & publish: Next.js container + Helm chart → GHCR](#build--publish-nextjs-container--helm-chart--ghcr)
- [Multiple registries (GHCR now, Harbor later)](#multiple-registries-ghcr-now-harbor-later)
- [Publishing npm packages instead](#publishing-npm-packages-instead)
- [Per-package versioning config](#per-package-versioning-config)
- [Enforcing Conventional Commits (commitlint)](#enforcing-conventional-commits-commitlint)
- [Manual / dispatch fallback](#manual--dispatch-fallback)

## Build & publish: Next.js container + Helm chart → GHCR

A real `.github/workflows/release-please.yml` for a pnpm + Turborepo repo that ships a **Next.js
standalone container** and a **Helm chart**. The `release-please` job maintains the Release PR;
the `publish` job runs **only** on the push that merges it (keyed off `release_created`), checks
out the freshly cut tag, and pushes versioned image + chart to GHCR.

```yaml
name: Release Please

# release-please maintains ONE "Release PR" on every push to main. Merging it tags vX.Y.Z +
# creates the Release; that same run's gated `publish` job builds the image + chart for the tag.
# The build is a gated JOB (not a separate `on: release` workflow) because a release created
# with the default GITHUB_TOKEN does NOT trigger downstream on:release/tag-push workflows.
on:
  push:
    branches: [main]
  workflow_dispatch: # manual fallback (re-run release-please)

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
    permissions:
      contents: read
      packages: write # push image + chart to GHCR
    env:
      IMAGE: ghcr.io/${{ github.repository }}/web
      CHART_DIR: charts/web
      CHART_REPO: oci://ghcr.io/${{ github.repository_owner }}/charts
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ needs.release-please.outputs.tag_name }} # the tag just cut

      # Helm chart/app versions must be SemVer with NO leading "v".
      - name: Derive version
        run: echo "VERSION=${TAG#v}" >> "$GITHUB_ENV"
        env:
          TAG: ${{ needs.release-please.outputs.tag_name }}

      # --- Next.js standalone image (next.config: output: 'standalone') ---
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ${{ env.IMAGE }}:${{ env.VERSION }}
            ${{ env.IMAGE }}:latest
          # bake the version into the image so the app can report it
          build-args: |
            APP_VERSION=${{ env.VERSION }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # --- Helm chart, pushed as an OCI artifact ---
      - uses: azure/setup-helm@v4
      - name: Package & push chart
        run: |
          helm registry login ghcr.io -u "${{ github.actor }}" -p "${{ secrets.GITHUB_TOKEN }}"
          helm package "$CHART_DIR" --version "$VERSION" --app-version "$VERSION"
          helm push "$(basename "$CHART_DIR")-${VERSION}.tgz" "$CHART_REPO"
```

Notes:
- **Chart version = app version** (both the release version) keeps the chart, image, and release
  in lockstep — exactly what the unified-version config produces.
- Several apps/charts? Add a `strategy.matrix` over `{ image, context, chart_dir }` to the
  `publish` job, or split image and chart into two gated jobs.
- GHCR packages inherit repo visibility; make them public (or grant pull tokens) if clusters
  pull anonymously.

## Multiple registries (GHCR now, Harbor later)

Make publishing **registry-agnostic** so adding Harbor is config, not a rewrite. Extract the
build+push into a reusable workflow, then call it once per registry. The caller stays gated on
`release_created`.

`.github/workflows/publish-artifacts.yml` (reusable):
```yaml
name: Publish artifacts
on:
  workflow_call:
    inputs:
      registry:    { type: string, required: true }   # ghcr.io | harbor.example.com
      image:       { type: string, required: true }   # <registry>/<owner>/web
      chart-repo:  { type: string, required: true }   # oci://<registry>/<owner>/charts
      version:     { type: string, required: true }
      ref:         { type: string, required: true }
    secrets:
      username:    { required: true }
      password:    { required: true }
jobs:
  push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ inputs.ref }}
      - uses: docker/login-action@v3
        with:
          registry: ${{ inputs.registry }}
          username: ${{ secrets.username }}
          password: ${{ secrets.password }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ inputs.image }}:${{ inputs.version }},${{ inputs.image }}:latest
      - uses: azure/setup-helm@v4
      - run: |
          helm registry login "${{ inputs.registry }}" -u "${{ secrets.username }}" -p "${{ secrets.password }}"
          helm package charts/web --version "${{ inputs.version }}" --app-version "${{ inputs.version }}"
          helm push "web-${{ inputs.version }}.tgz" "${{ inputs.chart-repo }}"
```

Caller — add a registry to the `include` list when Harbor is ready (and add its secrets):
```yaml
  publish:
    needs: release-please
    if: ${{ needs.release-please.outputs.release_created == 'true' }}
    strategy:
      matrix:
        include:
          - registry: ghcr.io
            image: ghcr.io/${{ github.repository }}/web
            chart-repo: oci://ghcr.io/${{ github.repository_owner }}/charts
          # - registry: harbor.example.com           # ← future: uncomment + add secrets
          #   image: harbor.example.com/team/web
          #   chart-repo: oci://harbor.example.com/team/charts
    uses: ./.github/workflows/publish-artifacts.yml
    with:
      registry: ${{ matrix.registry }}
      image: ${{ matrix.image }}
      chart-repo: ${{ matrix.chart-repo }}
      version: ${{ needs.release-please.outputs.tag_name }}   # strip leading v inside if needed
      ref: ${{ needs.release-please.outputs.tag_name }}
    secrets:
      # GHCR uses the built-in token; Harbor uses a robot account. Map per registry via
      # environment secrets, or a small `if`/separate job per registry if names must differ.
      username: ${{ github.actor }}
      password: ${{ secrets.GITHUB_TOKEN }}
```

> Secrets can't be selected by `matrix` value directly. For genuinely different creds per
> registry, either use **GitHub Environments** (one per registry, each holding `REGISTRY_USERNAME`
> / `REGISTRY_PASSWORD`) and set `environment: ${{ matrix.registry }}`, or keep one gated job per
> registry that passes that registry's named secret. Harbor: create a **robot account** and store
> its name/token as the username/password secrets.

## Publishing npm packages instead

If the repo ships libraries rather than containers, the gated job is simpler:
```yaml
  publish:
    needs: release-please
    if: ${{ needs.release-please.outputs.release_created == 'true' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ needs.release-please.outputs.tag_name }}
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: pnpm
          registry-url: https://registry.npmjs.org
      - run: pnpm install --frozen-lockfile && pnpm turbo run build
      - run: pnpm -r publish --access public --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Per-package versioning config

When each package should version + release independently (a library monorepo). Each package
gets its own Release PR and its own tag (`<component>-vX.Y.Z`):

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "release-type": "node",
  "packages": {
    "packages/ui": { "package-name": "@acme/ui" },
    "packages/utils": { "package-name": "@acme/utils" },
    "apps/web": { "package-name": "web" }
  }
}
```

Matching manifest:

```json
{
  "packages/ui": "1.2.0",
  "packages/utils": "0.4.1",
  "apps/web": "3.0.0"
}
```

Notes:
- Default `include-component-in-tag: true` here so tags are unambiguous per package
  (`@acme/ui-v1.2.1`). For a single root package you'd instead use the unified config in
  `SKILL.md` with `include-component-in-tag: false` for clean `vX.Y.Z` tags.
- Release Please opens a separate Release PR per package with changes since that package's last
  release — it walks the commit's touched files to attribute changes to packages.

## Enforcing Conventional Commits (commitlint)

The whole system only works if commit messages are well-typed. Enforce it locally (husky) and in
CI so a stray `update stuff` commit can't break the version math.

`commitlint.config.js`:
```js
module.exports = { extends: ['@commitlint/config-conventional'] }
```

Husky `commit-msg` hook (`.husky/commit-msg`):
```sh
npx --no -- commitlint --edit "$1"
```

CI check (`.github/workflows/commitlint.yml`) — validates PR commits:
```yaml
name: commitlint
on: pull_request
jobs:
  commitlint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: npx commitlint --from "${{ github.event.pull_request.base.sha }}" --to "${{ github.event.pull_request.head.sha }}"
```

> If you **squash-merge**, only the PR *title* lands as the commit — enforce the Conventional
> format on PR titles (e.g. the `amannn/action-semantic-pull-request` action) instead of, or in
> addition to, per-commit linting.

## Manual / dispatch fallback

Keep `workflow_dispatch` in the trigger so you can re-run release-please by hand (e.g. if a run
was cancelled) without pushing a commit:

```yaml
on:
  push: { branches: [main] }
  workflow_dispatch:
```

Run it from **Actions → Release Please → Run workflow**. It's idempotent — it reconciles the
Release PR to match `main`.
