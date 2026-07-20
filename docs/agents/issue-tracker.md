# Issue tracker: Linear

> **Canonical guide:** [`REFERENCE.md` §3](REFERENCE.md#3-linear-issue-tracker)
>
> This stub exists so Matt Pocock skills that open `docs/agents/issue-tracker.md` still resolve.
> Prefer the reference for humans.

| | Value |
|---|---|
| **Workspace** | [retrospct](https://linear.app/retrospct) |
| **Team** | **retrospct** (`RETRO-…`) |
| **Project** | **Mikan** |

Issues live in Linear (Cursor MCP `plugin-linear-linear`). External GitHub PRs are **not** a triage surface.

**Setup:** enable Team Settings → Triage on the **retrospct** team for inbound/external work; create labels in [`REFERENCE.md` §4](REFERENCE.md#4-triage-labels); authorize Linear MCP once.

**Ops:** `save_issue` (team `retrospct`, project Mikan), `get_issue`, `list_issues`, `save_comment`, labels/status tools. Identifiers like `RETRO-123`.
