# Runbook — rename GitHub repo `retrospct/mikan` → `retrospct/mikan`

> **Read this fully before executing.** This doc is a plan; it does **not** make any
> changes. Nothing here has been run or edited for you. The product is already branded
> **Mikan** (via `@nimi/brand`); this only renames the **GitHub repository**. It does
> **not** touch the `@nimi/*` npm scope or code identifiers (that's a separate Tier B/C).

---

## TL;DR — what changes and what breaks

Renaming a repo on GitHub is mostly safe because **GitHub permanently redirects** the old
path for clones, web URLs, and the API (`retrospct/mikan` → `retrospct/mikan`). Issues, PRs,
stars, watchers, and repo **secrets** all move with the repo (it keeps the same underlying
repo ID).

The **one thing that must change in lockstep** is the **electron-updater publish target**.
The auto-updater resolves release artifacts from a hard-coded `owner/repo`:

- `packages/brand/src/identity.json` → `mikan.publish` → `{ owner, repo }`
- `apps/desktop/dev-app-update.yml` → `owner` / `repo`

`electron-builder.config.cjs` reads those values from `@nimi/brand` and bakes a generated
`app-update.yml` into the packaged app. If the repo name changes but the publish target
still says `repo: nimi`, the updater will be pointing at the old name and relying on
GitHub's redirect for the releases feed — fragile, and GitHub does **not** guarantee
redirects for every release-asset path. **Update the publish target in the same commit as
the rename.**

Everything else (`homepage`, doc URLs, `release-please` `package-name`) is **cosmetic** —
it keeps working via redirect and can be cleaned up at your leisure.

---

## Current values (researched — quote of record)

| File | Field | Current value |
|---|---|---|
| `packages/brand/src/identity.json` | `mikan.publish` | `{ "owner": "retrospct", "repo": "nimi" }` |
| `apps/desktop/dev-app-update.yml` | `provider` / `owner` / `repo` | `github` / `retrospct` / `nimi` |
| `apps/desktop/dev-app-update.yml` | `updaterCacheDirName` | `nimi-updater` |
| `apps/desktop/package.json` | `homepage` | `https://github.com/retrospct/mikan` |
| `apps/desktop/package.json` | `repository` | **(field does not exist)** |
| `apps/desktop/electron-builder.config.cjs` | `publish` | derived: `owner: meta.publish.owner`, `repo: meta.publish.repo` (from `@nimi/brand/identity.json`) |
| `release-please-config.json` | `packages["."].package-name` | `nimi` |
| git remote `origin` (this worktree) | fetch + push | `https://github.com/retrospct/mikan.git` |

Notes / discrepancies vs. the assumed description:

- **`identity.json` shape:** the `publish` block is **nested under a top-level `"mikan"`
  key**, not flat. The full file is just `{ "mikan": { ..., "publish": { "owner":
  "retrospct", "repo": "nimi" } } }`. Owner/repo match the assumption.
- **`package.json` has no `repository` field** — only `homepage`. There is nothing to edit
  for `repository`; you may optionally *add* one later (cosmetic).
- **`updaterCacheDirName` lives only in `apps/desktop/dev-app-update.yml`** (value
  `nimi-updater`); it is **not** present in `electron-builder.config.cjs`. `dev-app-update.yml`
  is the **dev-only** feed file. **Leave `updaterCacheDirName` as `nimi-updater`** — it names
  the on-disk update cache folder; renaming it orphans any existing cache and is unrelated to
  the repo name.
- **`electron-builder.config.cjs` needs no edit** — it reads the publish target from
  `@nimi/brand`, so changing `identity.json` is sufficient for the packaged feed.

### `retrospct/mikan` URL references (cosmetic — all keep working via redirect)

30 references across **tracked** files:

| File | Count | Edit? |
|---|---|---|
| `CHANGELOG.md` | 22 | **No** — auto-generated release/commit links; leave as historical record |
| `docs/plans/distribution-hardening.plan.md` | 3 | Optional |
| `.claude/skills/release/SKILL.md` | 2 | Optional |
| `docs/testing/uncovered-todos-gui-runbook.md` | 1 | Optional |
| `docs/RELEASING.md` | 1 | Optional |
| `apps/desktop/package.json` | 1 | **Yes** (the `homepage`, handled in Step 2) |

> Count is from `git grep` (tracked files only). New/untracked docs in your working tree
> may add a few more — re-run the count below before a bulk replace.

---

## Pre-flight checklist

> Most of this matters **a lot more** if you plan to open-source (see the final section).
> Renaming a **private** repo is low-risk; making history **public** is irreversible for
> anything already pushed.

- [ ] **Secret audit — current files.** Confirm no real secrets are tracked:
  ```bash
  git ls-files | rg "\.env$|\.env\.(?!example)" || echo "no tracked .env"
  rg -i "secret|token|api[_-]?key|password|-----BEGIN" $(git ls-files)
  ```
- [ ] **Secret audit — full git history** (open-sourcing exposes *all* history, not just
  HEAD). Use a dedicated scanner, not just eyeballing:
  ```bash
  git log -p | rg -i "secret|token|api[_-]?key|password|-----BEGIN"
  gitleaks detect --source . --redact      # or: trufflehog git file://. 
  ```
  If anything real is found, you must rewrite history (`git filter-repo`) **and rotate the
  exposed credential** — a rename does not scrub history. See the existing credential-audit
  notes in `docs/plans/distribution-hardening.plan.md` (the "Pre-release credential audit
  checklist" and the `MAIN_VITE_*` public-vs-secret table) for which values are genuinely
  confidential (`NEEME_ANTHROPIC_KEY` is the real one; the `MAIN_VITE_*` OAuth params are
  public-client values by design).
- [ ] **`.gitignore` covers env files.** Confirm `.env` / `.env.*` (except `*.example`) are
  ignored and not staged.
- [ ] **GitHub repo secrets persist across rename** (they're attached to the repo object):
  `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_*`, `MAIN_VITE_*`, etc. List them now so you can
  diff after: `gh secret list --repo retrospct/mikan`.
- [ ] **Vercel git integration** tracks by repo **ID**, so it should survive the rename —
  but plan to verify the project's git link afterward (Project → Settings → Git).
- [ ] **Actions workflows** — none hard-code `retrospct/mikan`; they reference the
  `@nimi/desktop` pnpm filter (package name, unaffected). Files present:
  `commitlint.yml`, `e2e-smoke.yml`, `release-mobile.yml`, `release-please.yml`,
  `release.yml`. Re-grep to be sure before you go:
  ```bash
  git grep -n "retrospct/mikan" .github/workflows/   # expect: no matches
  ```

---

## Step-by-step

### 1. Run the pre-flight audits above
Especially the **history** secret scan if open-sourcing is on the table. Do not proceed
until clean (or until you've rewritten history + rotated anything exposed).

### 2. Edit the publish-target config in lockstep (exact before → after)

> ⚠️ Do these **before** the rename and commit them together, so the auto-updater feed and
> the GitHub repo name never disagree.

**`packages/brand/src/identity.json`** — the `mikan.publish` block:
```diff
-    "publish": { "owner": "retrospct", "repo": "nimi" }
+    "publish": { "owner": "retrospct", "repo": "mikan" }
```

**`apps/desktop/dev-app-update.yml`** — change `repo` only; **leave
`updaterCacheDirName`**:
```diff
 provider: github
 owner: retrospct
-repo: nimi
+repo: mikan
 updaterCacheDirName: nimi-updater
```

**`apps/desktop/package.json`** — `homepage` (cosmetic, but do it in the same pass):
```diff
-  "homepage": "https://github.com/retrospct/mikan",
+  "homepage": "https://github.com/retrospct/mikan",
```

> `apps/desktop/electron-builder.config.cjs` needs **no** edit — it derives `publish` from
> `@nimi/brand/identity.json`, so the change above flows through to the packaged
> `app-update.yml` automatically.

### 3. Commit the config edits
Commit when you're ready (do this yourself; this runbook won't commit for you), e.g.:
```bash
git add packages/brand/src/identity.json apps/desktop/dev-app-update.yml apps/desktop/package.json
git commit -m "chore: point release/update feed at retrospct/mikan"
git push
```

### 4. Rename on GitHub
Run from **a clone** (not strictly required to be this worktree). This renames the repo on
GitHub **and** rewrites that clone's `origin` URL for you:
```bash
gh repo rename mikan --repo retrospct/mikan
# or, from inside a clone whose origin is retrospct/mikan:
gh repo rename mikan
```

### 5. Update remotes in **all other** clones and worktrees
`gh repo rename` only fixes the clone you ran it in. **This is a git worktree at
`/Users/jlee/.cursor/worktrees/nimi/8x4c`; your main clone lives elsewhere.** Worktrees
sharing one `.git` share one remote, but separate clones do not. In every other
clone/worktree:
```bash
git remote set-url origin https://github.com/retrospct/mikan.git
git remote -v   # verify
```
(The old URL keeps working via redirect, but update it to avoid surprises.)

### 6. Optional / cosmetic cleanup
All of these keep working via redirect; do them only if you want tidy URLs.
- Bulk-update doc URLs (skip `CHANGELOG.md` — it's historical):
  ```bash
  git grep -rl "retrospct/mikan" -- ':!CHANGELOG.md' | xargs sed -i '' 's#retrospct/mikan#retrospct/mikan#g'
  ```
- `release-please-config.json` → `packages["."].package-name`: `"nimi"` → `"mikan"`.
  **Cosmetic only** — this affects release-PR titles / changelog naming, **not** the GitHub
  repo or the updater feed. Changing it mid-stream can make the next release PR look like a
  new package; fine to leave as `nimi` or switch on a clean release boundary.

---

## Post-rename verification

```bash
# Repo identity moved and old path redirects:
gh repo view retrospct/mikan --json name,url,visibility
gh api repos/retrospct/mikan --jq '.full_name'      # → "retrospct/mikan" (redirect)
git ls-remote https://github.com/retrospct/mikan.git >/dev/null && echo "old clone URL redirects OK"

# Auto-updater feed points at the new repo:
rg -n "repo:" apps/desktop/dev-app-update.yml       # → repo: mikan
rg -n '"repo"' packages/brand/src/identity.json     # → "mikan"

# Secrets still present (compare against your pre-flight list):
gh secret list --repo retrospct/mikan

# Actions still green on the next push / re-run release-please.
# Vercel: open the project → Settings → Git → confirm it shows retrospct/mikan.
```

A real end-to-end updater check requires a published release; sanity-checking the feed
files above plus the next release build (which reads `meta.publish` via electron-builder) is
the practical pre-release gate.

---

## Rollback

```bash
gh repo rename nimi --repo retrospct/mikan
```
Then revert the Step-2 config edits (or `git revert` the commit) and re-fix remotes
(Step 5). 

> **Squatting risk:** once you rename away from `nimi`, the name `retrospct/mikan` becomes
> available for **anyone** to create. If protecting the old name matters (it currently backs
> redirects and the updater fallback), consider creating a placeholder repo at
> `retrospct/mikan` after the rename, or simply keep the rename reversible until you're
> confident. GitHub's redirect breaks the moment someone else claims the old name.

---

## Open-sourcing follow-on (separate from the rename — flag only)

Renaming and going public are independent; **do not flip visibility as part of this
runbook.** When you do:

1. **History secret audit must pass first** — making a repo public exposes the **entire**
   commit history. Re-run the history scan (gitleaks/trufflehog) and rotate anything found.
   This is irreversible once pushed publicly.
2. **Choose a `LICENSE`** and add it at the repo root (none currently committed).
3. **Add/extend `README.md` + `CONTRIBUTING.md`** for an external audience.
4. **Scrub internal-only docs** — review `docs/agent-sync/**`, internal plans, and anything
   with private infra details or personal notes before publishing.
5. **Flip visibility last:** `gh repo edit retrospct/mikan --visibility public` only after
   1–4 are done.

---

## Mobile & services exposure

> **Question:** does renaming `retrospct/mikan` → `retrospct/mikan` require any change in the
> **mobile** app (`apps/mobile`, RN/Expo) or the **services** (`services/token-broker`,
> `services/mastra`, both Vercel)? **Answer: no.** None of them is coupled to the GitHub
> **repo name**. The desktop electron-updater publish target remains the *only* hard-coupled
> surface (see the TL;DR above). Evidence below.

### Verdict table

| Surface | Update / deploy mechanism | Coupled to GitHub repo name? | Action on rename |
|---|---|---|---|
| **Mobile** (`apps/mobile`) | Expo **EAS Build** (`release-mobile.yml`, inert until `EXPO_TOKEN`); EAS Update would be keyed by Expo **project ID**, never GitHub | **No** | **None** |
| **token-broker** (`services/token-broker`) | Vercel git integration (tracks project by internal **repo ID**) | **No** | **None** |
| **mastra** (`services/mastra`) | Vercel via `mastra build` → `vercel deploy` (`@mastra/deployer-vercel`); Inngest keyed by signing/event keys | **No** | **None** |
| CI (`.github/`) | GitHub Actions | **No** — no hardcoded `retrospct/mikan`; only dynamic `${{ github.* }}` | **None** |

### Mobile — evidence

`apps/mobile/app.json` (quoted) — all identifiers are brand/app identities, **not** the repo name, and none is derived from it:

```7:18:apps/mobile/app.json
    "scheme": "mikan",
    "platforms": ["ios", "android"],
    "userInterfaceStyle": "automatic",
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "cool.jlee.nimi"
    },
    "android": {
      "adaptiveIcon": {
        "backgroundColor": "#ffffff"
      },
      "package": "cool.jlee.nimi"
    },
```

- `name`: `"Nimi"`, `slug`: `"nimi"`, `version`: `"0.1.0"`, `scheme`: `"mikan"`
- iOS `bundleIdentifier`: `"cool.jlee.nimi"`; Android `package`: `"cool.jlee.nimi"`
- **Absent (important):** there is **no** `owner`, **no** `extra.eas.projectId`, **no**
  `updates` / `updates.url`, and **no** `runtimeVersion` in `app.json`; there is **no**
  `eas.json` and **no** `app.config.js/ts`; and `expo-updates` is **not** a dependency in
  `apps/mobile/package.json`. So **EAS Update / OTA is not yet configured at all**, and
  nothing points at GitHub Releases.
- **OTA mechanism:** the only mobile release path is **EAS Build** in
  `.github/workflows/release-mobile.yml` ("Release Mobile (EAS)"), which is a **green no-op
  until an `EXPO_TOKEN` secret is set** (every step is guarded by `env.EXPO_TOKEN != ''`).
  When EAS Update is eventually configured, it is keyed by the **Expo project ID** (e.g.
  `u.expo.dev/<project-id>`) — independent of the GitHub repo name.
- The Expo `slug` happens to be `"nimi"` today. That is the **Expo project slug** (Expo's
  own namespace), *not* the GitHub repo — renaming the GitHub repo does not touch it, and it
  would not break. Re-slugging to `mikan` is an **optional brand cleanup**, separate from and
  unaffected by this rename.
- `git grep -n "retrospct/mikan" apps/mobile` → **no matches.** The only `github.com` string
  in mobile is a doc link to the upstream `t3-oss/t3-turbo` template
  (`apps/mobile/CLAUDE.md:9`), unrelated to our repo.

**Mobile verdict: no change required on rename.**

### token-broker — evidence

- **Deploy:** Vercel git integration. Vercel links a project to its repo by an internal
  **repo ID**, so a GitHub rename does **not** unlink the project (Vercel auto-updates the
  stored repo reference; the dashboard/CLI just shows the new name afterward).
- `services/token-broker/vercel.json` contains only `framework`, `outputDirectory`, and
  `rewrites` — **no repo name, no deploy hooks, no webhook URLs**:

```1:9:services/token-broker/vercel.json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "outputDirectory": "public",
  "rewrites": [
    { "source": "/token", "destination": "/api/token" },
    { "source": "/health", "destination": "/api/token" }
  ]
}
```

- Env vars (`README.md`) are all Logto/Turso identity (`LOGTO_*`, `TURSO_*`, `TOKEN_TTL_SECONDS`,
  `PORT`) — **none embeds the repo name**.
- `git grep -n "retrospct/mikan" services/token-broker` → **no matches**;
  `git grep -n "github.com" services/token-broker` → **no matches**.

**token-broker verdict: no change required on rename.**

### mastra — evidence

- **Deploy:** `pnpm build` (`mastra build` → `.vercel/output/`) then `vercel deploy`, via
  `@mastra/deployer-vercel` (per `services/mastra/CLAUDE.md` and `package.json`). Same Vercel
  repo-ID tracking applies. **No `vercel.json`** in this service (`services/mastra/vercel.json`
  does not exist), so nothing there can pin a repo name.
- Runtime coupling is to **Inngest** (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`) and the
  **Vercel AI Gateway** (`AI_GATEWAY_API_KEY`) — keyed by signing/event/API keys, **not** the
  GitHub repo name. The Inngest serve route is `api/inngest.ts` (a Vercel route), not a
  GitHub-derived URL.
- `git grep -n "retrospct/mikan" services/mastra` → **no matches**;
  `git grep -n "github.com" services/mastra` → **no matches**.

**mastra verdict: no change required on rename.**

### CI / workflows — evidence

- `git grep -n "retrospct/mikan" .github/` → **no matches.** No workflow hardcodes the repo
  path. `release-mobile.yml` (the only mobile/EAS deploy workflow) references the
  `apps/mobile` working directory and the `EXPO_TOKEN` secret — never the repo name. Any
  `${{ github.repository }}` usages elsewhere are **dynamic** and resolve to the new name
  automatically after rename.

### Action items for mobile / services

**None.** To be explicit and reassuring: there is **nothing to edit** in `apps/mobile`,
`services/token-broker`, or `services/mastra` for the `retrospct/mikan → retrospct/mikan`
rename. Mobile OTA (when enabled) is keyed by Expo project ID; both services deploy through
Vercel's repo-ID-tracked git integration; and no config, code, env var, deploy hook, or
webhook in any of them embeds the GitHub repo name. (Optional, unrelated brand cleanup: the
Expo `slug: "nimi"` could be re-slugged to `mikan` someday — but that is an Expo-namespace
change, not a GitHub-rename requirement.)

> **Summary:** the **only** item hard-coupled to the GitHub repo name remains the **desktop
> electron-updater publish target** (`packages/brand/src/identity.json` `mikan.publish.repo`
> + `apps/desktop/dev-app-update.yml` `repo`). Mobile and both services are unaffected.
