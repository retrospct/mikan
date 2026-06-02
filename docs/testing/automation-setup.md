# Automating the runbooks (stop hand-dispatching agents)

Goal: a PR event drives verification, not a human. Each GUI runbook splits into a
**deterministic tier** (CI, no agent) and a **visual/judgement tier** (an
auto-launched cloud agent). Once both are wired, you review results instead of
dispatching agents.

## The three pieces

```
PR opened/pushed ─┬─▶ GitHub Actions  (e2e-smoke.yml)  → deterministic pass/fail check
                  └─▶ Cursor Automation → cloud agent  → reads gui-smoke skill, runs
                                                          the runbook, posts screenshot
                                                          + video as a PR comment
```

### 1. Deterministic tier — already committed

`.github/workflows/e2e-smoke.yml` builds the app and runs the Playwright
`_electron` suite under Xvfb on every PR touching `apps/desktop/**` or
`packages/contract/**`. No agent, no secrets. Add an `_electron` spec under
`apps/desktop/test/e2e/` for each feature whose checks can be made objective
(`csp.spec.ts` is the reference).

### 2. The SOP the agent follows — already committed

`.cursor/skills/gui-smoke/SKILL.md`. Cursor cloud agents auto-discover skills
from `.cursor/skills/` at startup (they clone the repo), so you never re-paste the
procedure. Likewise `AGENTS.md` is read automatically. Keep standing conventions
in those files and keep the trigger prompt about the *task*, not the process.

### 3. The trigger — one-time dashboard setup (manual)

This is the only step not committable to the repo. At
[cursor.com/automations](https://cursor.com/automations):

1. **New automation**, scope it to this repo (requires the Cursor GitHub app
   installed with repo access: Dashboard → Integrations → Connect GitHub).
2. **Triggers:** `Pull request opened` + `Pull request pushed`. (Optionally add
   `CI completed` so the agent runs only after `e2e-smoke.yml` is green.)
3. **Tools:** enable **Comment on pull request** (so it posts results inline) and
   leave **artifacts** on (screenshots/video are uploaded + linked).
4. **Prompt** (task-only — the skill supplies the how):

   > Smoke-test this PR's desktop changes using the `gui-smoke` skill. Run the
   > deterministic tier, then follow the matching runbook in `docs/testing/` for
   > the changed feature, capture the artifacts it specifies, and post a concise
   > pass/fail report with the screenshot and video as a PR comment.

### Programmatic alternative

If you'd rather trigger from CI than the dashboard, the same launch is available
via `POST https://api.cursor.com/v1/agents` (Cursor cloud VM) or the Cursor CLI
`agent -p "…"` inside a runner. Store `CURSOR_API_KEY` as a repo secret. Use the
API/CLI when you want the launch tied to a specific workflow step rather than a
GitHub event.

## Adding a new feature to the loop

1. Write/extend an `_electron` spec under `apps/desktop/test/e2e/` (tier 1/2).
2. Clone `docs/testing/RUNBOOK-TEMPLATE.md` → `docs/testing/<feature>-runbook.md`,
   filling in the **Artifacts to capture** section precisely.
3. Add a row to the **GUI feature tests** table in `AGENTS.md`.

No automation change needed — the skill + runbook discovery handle the rest.
