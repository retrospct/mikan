# `sync-my-agents` routine config

Paste these into the Claude Routine fields. The goal: a brief two agents can read
in 10 seconds, generated fast. Terse > thorough — it answers one question per
branch ("am I safe, what's my next move?"), nothing more.

## Description

> Scan open PRs/branches in this repo and flag where two agents are about to
> collide (shared files, the IPC/DB contract, migrations). Emit a one-screen brief
> with the merge order and a one-line next move per branch.

## Instructions

```
Read-only. Output must fit on one screen (~20 lines). Speed > completeness.

1. git fetch -p; gh pr list --state open --json number,title,headRefName
2. Per open PR: git diff --name-only origin/main...<headRef>  (names only — do NOT read diffs)
3. A collision = two PRs share a file. Only open a file if the shared file is in the
   contract hotset: src/shared/**, src/main/index.ts, src/preload/**,
   src/main/services/pipeline-service.ts, src/main/db/schema.ts. Otherwise just name it.
4. Skip planning docs unless a hotset overlap is ambiguous on names alone.
5. Write docs/agent-sync/SYNC-BRIEF.md in EXACTLY this shape — no prose sections:

   # Sync — <date>
   **Merge order:** #A → #B → #C

   **Per branch — do this now:**
   - #N <branch>: <ready to merge | rebase on #X then <1 clause how> | blocked: <why>>
   - ...

   **⚠ Real conflicts:** <file (#X×#Y)>, ... — everything else auto-merges.

   If nothing is actionable, write one line: "All clear, no overlaps." Stop.
```

## Settings

- **Model:** Haiku 4.5 is fine at this reduced scope (no diff/doc reading). Bump to
  Sonnet only if you later want it to reason about *semantic* (non-file-overlap)
  conflicts.
- **Worktree:** off — it runs from the main checkout and reads siblings via
  `git worktree list` / `gh pr`.
- **Permissions:** Ask. It's read-only except the single `SYNC-BRIEF.md` write.

## Why the first version was slow + verbose

It read every PR's full diff and all planning docs, then wrote a paragraph per
collision (~110 lines). The fixes above: `--name-only` overlaps + a contract-hotset
rule (only open the 1–2 files that matter), and a hard output cap. Same intelligence,
a fraction of the time and length — and less prose means fewer small guesses
(the long version misnamed a dependency).
```
