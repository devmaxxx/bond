---
description: Check out a fresh typed branch to start work — creating the Jira issue first where the project has a tracker
---

# /bond:start

Spin up work in one step: **create a new Jira issue** from a free-text summary,
then **check out a properly-named branch** for it. Where the project profile
resolves `TRACKER=none` there is no issue to create — the free text names the
branch and that is the whole job. Stops there — no plan, no
implementation. Use it when you want a ticket and a branch ready to start coding
by hand; reach for `/bond:implement` when you also want the plan-and-code flow.

This is the front half of `/implement` (create ticket → branch) without the
analyse/plan/implement/ship tail. It delegates the two reused pieces to the
shared procedures: ticket creation to the **create** procedure in
`${CLAUDE_PLUGIN_ROOT}/commands/jira.md`, and the branch to
`${CLAUDE_PLUGIN_ROOT}/shared/implement-flow.md`. Read both.

This command runs **autonomously** (see the autonomy note in
`${CLAUDE_PLUGIN_ROOT}/shared/implement-flow.md`): when a field is ambiguous but
has a sensible default, choose it and report the choice — don't stop to ask. Only
a genuine blocker (no project resolvable, tool error, dirty tree in in-place
mode) pauses or aborts.

## Arguments

`$ARGUMENTS` — a free-text summary of the work to start, plus optional flags. An
existing ticket key is **not** expected here — to branch off a ticket you already
have, use `/bond:implement <KEY> --no-auto`.

Examples:
- `/bond:start add a CSV export to the reports page`
- `/bond:start login page 500s on submit --bug`
- `/bond:start "wire up export endpoint" --project CRMDEV`
- `/bond:start add rate limiting to the auth API --base develop --worktree`

### Flags

- `--bug` — create the issue as a **Bug** (branch prefix `fix`).
- `--task` — create the issue as a **Task** (default; branch prefix `feat`).
- `--project <KEY>` — project for the new issue when it can't be inferred.
- `--base <branch>` — cut the branch off `origin/<branch>`. When omitted, resolved
  per repo via the shared **Default base branch** procedure, which reads
  `BASE_BRANCH` off the project profile.
- `--worktree` — set the branch up in an isolated git worktree instead of checking
  out in the current tree. Default is **in-place** checkout.
- `--no-start` — leave the issue at `Todo`. Default transitions it to
  `In Progress` (you're starting work on it).

Strip all flags from `$ARGUMENTS` before reading the summary.

## Steps

### 1. Create the ticket

Resolve the project profile first
(`${CLAUDE_PLUGIN_ROOT}/shared/project-profile.md`). Under **`TRACKER=none`**,
skip this step and step 2 entirely: the free text is the branch description, and
`--project` / `--no-start` are reported as ignored. Continue at step 3.

The rest of this step is the `TRACKER=jira` path. The remaining text after
stripping flags is the issue **summary** (a blocker if
empty — ask for one and stop). Type = `Bug` if `--bug`, else `Task`. Project =
`--project <KEY>`, else inferred per the **create** procedure in
`${CLAUDE_PLUGIN_ROOT}/commands/jira.md`. Run that procedure (assignee defaults to
you), capture the new key, and report it with its browse URL.

### 2. Move to In Progress  *(`TRACKER=jira` only)*

Unless `--no-start`, run the shared **Transition to In Progress** procedure with
the new key. (A freshly created ticket starts at `Todo`; the chain-walk moves it
to `In Progress`.)

### 3. Determine the branch name

- Prefix: `Bug` → `fix`; `Task`/`Story`/other → `feat`.
- Name: `<prefix>/<KEY>` (e.g. `feat/ERP-135`, `fix/CRMDEV-6335`).
- **`TRACKER=none`**: prefix from the work (`fix` with `--bug`, else `feat`),
  then three to five hyphenated lowercase words from the free text —
  `feat/add-a-csv-export`. That is the `bond:authorship-conventions` shape; the
  `<prefix>/<KEY>` form exists only so the Jira-driven commands can find a branch
  by its key.

### 4. Check out the branch

Run the shared **Set up the branch** procedure with `BRANCH_NAME` from step 3,
`BRANCH_SOURCE=new`, `BASE_BRANCH` = the `--base` value if given else resolved via
the shared **Default base branch** procedure, and `WORKTREE_SUFFIX=` (empty). Use
in-place mode by default; use worktree mode when `--worktree` is passed.

### 5. Report

Print the created issue (key + URL) — omitted under `TRACKER=none`, where none
was created — plus the branch name, the base it was cut from, and — in worktree
mode — the worktree path. Then stop. Do **not** analyse, plan,
implement, commit, push, or open a PR.

## Do NOT

- Do not write or run an implementation plan — this command stops at the branch.
- Do not branch off an existing ticket key passed in `$ARGUMENTS`; that's
  `/bond:implement <KEY>`. Treat the text as a new-issue summary.
- Do not auto-stash or branch over a dirty tree in in-place mode — abort and tell
  the user to commit or stash (per the shared procedure).
