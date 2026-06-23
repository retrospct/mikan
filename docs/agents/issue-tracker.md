# Issue tracker: Linear

Issues and PRDs for this repo live in **Linear**, not in GitHub Issues. Skills that
create, read, or move work items (`to-issues`, `triage`, `to-prd`, `qa`) operate against
Linear.

## How to operate Linear

Use the **Linear MCP** (the `productivity:linear` integration). Its tools are namespaced
`mcp__...__*` and are loaded on demand via `ToolSearch` (query `linear`). The first call in
a session may require an interactive auth/`authenticate` step — if a tool returns an auth
error, surface it and ask the user to authorize rather than silently retrying. In a
headless/cron run where interactive auth isn't possible, report that Linear is unreachable
instead of falling back to another tracker.

Typical operations (use the MCP tool whose schema matches; don't guess channel names):

- **Create an issue**: create a Linear issue with a title and a markdown description. Set
  the team/project if the skill knows it; otherwise let it default and note which team you used.
- **Read an issue**: fetch the issue by its identifier (e.g. `NIM-123`) including comments,
  labels, and current workflow state.
- **List / search issues**: list open issues filtered by label or workflow state.
- **Comment**: add a comment to the issue.
- **Apply / remove labels**: edit the issue's labels (see `triage-labels.md` for the
  canonical role → Linear label mapping).
- **Move state / close**: move the issue through its workflow state; "close" means moving it
  to a Done/Canceled state, not deleting it.

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
