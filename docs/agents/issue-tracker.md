# Issue tracker: Linear

Issues and PRDs for this repo live in **Linear**, not in GitHub Issues. Skills that
create, read, or move work items (`to-issues`, `triage`, `to-prd`, `qa`) operate against
Linear.

## How to operate Linear

Use the **Linear MCP**. In **Cursor** this is the `plugin-linear-linear` MCP server — confirm a
tool's schema by reading its descriptor under
`~/.cursor/projects/<project>/mcps/plugin-linear-linear/tools/*.json`, then invoke it via the
MCP call tool. In **Claude Code** the same integration is `productivity:linear`, whose tools are
namespaced `mcp__...__*` and loaded on demand via `ToolSearch` (query `linear`). Either way, the
first call in a session may require an interactive auth step — if a tool returns an auth error,
surface it and ask the user to authorize rather than silently retrying. In a headless/cron run
where interactive auth isn't possible, report that Linear is unreachable instead of falling back
to another tracker.

Typical operations (use the tool whose schema matches; tool names below are the
`plugin-linear-linear` names):

- **Create / update an issue**: `save_issue` with a title and a markdown description. Set the
  team/project (`list_teams` / `list_projects`) if the skill knows it; otherwise let it default
  and note which team you used.
- **Read an issue**: `get_issue` by its identifier (e.g. `NIM-123`); use `list_comments` for its
  thread.
- **List / search issues**: `list_issues` filtered by label or workflow state.
- **Comment**: `save_comment` on the issue.
- **Apply / remove labels**: `list_issue_labels` (and `create_issue_label` if one is missing),
  then set them via `save_issue` (see `triage-labels.md` for the canonical role → Linear label
  mapping).
- **Move state / close**: read states with `list_issue_statuses` / `get_issue_status`, then set
  the issue's state via `save_issue`; "close" means moving it to a Done/Canceled state, not
  deleting it.

Identifiers are Linear keys like `NIM-123`, not bare integers — when a skill references a
ticket number, resolve it as a Linear identifier.

## Pull requests as a triage surface

**PRs as a request surface: no.** External GitHub PRs are not pulled into the Linear triage
queue. `/triage` operates only on Linear issues. (Code review of PRs is a separate workflow —
this flag is only about whether PRs are treated as incoming *requests*.)

## When a skill says "publish to the issue tracker"

Create a Linear issue (see above).

## When a skill says "fetch the relevant ticket"

Fetch the Linear issue by its identifier, including comments.
