---
description: Read QA failure feedback from a Jira ticket and re-run implementation to fix it
---

# /bond:fix-qa

A ticket has come back from QA. This command pulls the QA failure comments off
the Jira issue, summarises what needs to change, and then **delegates the
implementation flow to `/bond:implement`** — same ticket, existing branch, plan
file appended with a **QA fix round** section.

It is `/bond:implement` with three QA-specific twists:

1. The branch already exists; attach to it instead of cutting a new one off `main`.
2. The plan file already exists; **append** a dated `## QA fix round` section
   instead of overwriting.
3. The Jira status is moved back to **In Progress** before fixing.

Everything else — codebase analysis, implementation execution, test writing,
ship, PR update, worktree teardown — is the same as `/bond:implement` and must
not be duplicated here. Follow that command's steps by reference.

## Arguments

`$ARGUMENTS` — a single Jira ticket ID (e.g. `ERP-135`) plus optional flags.

Examples:
- `/bond:fix-qa ERP-135`
- `/bond:fix-qa ERP-135 --no-auto`
- `/bond:fix-qa ERP-135 --no-worktree`

### Flags

Same semantics as `/bond:implement` — `--no-auto` opts out of auto-confirm and
auto-ship; `--no-worktree` works in the current tree instead of a sibling
worktree. Strip flags before parsing the ticket ID. If no ticket ID remains, ask
the user.

## Steps

### 1. Parse the ticket ID

Exactly **one** token must remain after stripping flags, matching `^[A-Z]+-\d+$`.
Otherwise report the problem and **abort**.

### 2. Fetch the ticket and its comments

Resolve `cloudId` once via `mcp__bond-atlassian__getAccessibleAtlassianResources`.
Then call `mcp__bond-atlassian__getJiraIssue` with `cloudId` and the ticket ID.

Extract `fields.summary`, `fields.issuetype.name`, `fields.status.name`,
`fields.priority.name`, `fields.assignee.displayName`, `fields.description`
(render ADF as plain text), and `fields.comment.comments` (full list with
author, created, body).

If the call errors, surface and **abort**.

### 3. Identify the QA failure feedback

Same logic as the old fix-qa selection — find what QA wants fixed.

1. Render comments as plain text, sort by `created` ascending.
2. Select in this order of preference:
   - Comments newer than the most recent transition back to In Progress /
     Failed QA / Reopened (when inferrable).
   - Comments mentioning `QA`, `failed`, `regression`, `doesn't work`, `still
     broken`, `repro`, `reproduce`, `bug`, `not fixed`.
   - Fallback: the **3 most recent** comments overall.
3. Drop comments authored by the current user (`git config user.email`
   against the comment author's email when available).

Print the selected comments to the user in chronological order:

```
QA feedback on <TICKET_ID> — <summary>:
  [<created>] <author>: <body>
  …
```

If the selection is empty, tell the user no QA-failure comments were found and
ask whether to continue with the ticket description alone.

In `--no-auto` mode, ask: *"Use this QA feedback as the fix scope? Reply with
edits or **yes** to continue."* and wait for confirmation. In auto mode,
continue and note that auto-confirm is enabled.

### 4. Transition the ticket to In Progress

Use the same `getTransitionsForJiraIssue` + `transitionJiraIssue` pattern as
`/bond:implement` step 2b. Surface non-fatal errors. Skip silently if already
In Progress.

### 5. Locate the existing branch

The ticket has been implemented before, so the branch likely exists.

Candidates in order:
1. `fix/<TICKET_ID>`
2. `feat/<TICKET_ID>`
3. Any local or remote branch whose name contains `<TICKET_ID>` (multi-ticket
   branches like `fix/<TICKET_ID>_<OTHER>`).

```sh
git fetch origin
git for-each-ref --sort=-committerdate \
  --format='%(refname:short)' \
  refs/heads/ refs/remotes/origin/ | grep -E "(^|/)(fix|feat)/.*<TICKET_ID>"
```

Pick the **most recently committed** match. If multiple are ambiguous, list
them and ask which one. If none match, tell the user "no existing branch for
`<TICKET_ID>` — use `/bond:implement <TICKET_ID>` for a first-time
implementation" and **abort**.

### 6. Attach to the existing branch

This replaces `/bond:implement` step 4 (which cuts a new branch off `main`).

#### Worktree mode (default)

Don't require a clean working tree.

1. Repo name: `basename "$(git rev-parse --show-toplevel)"`.
2. Slug: branch name with `/` replaced by `-`.
3. Worktree path: `../<repo>-<slug>-qa` (the `-qa` suffix avoids clobbering an
   existing `/implement` worktree). Remember this path and the original repo
   directory.
4. Attach to the existing branch:
   ```sh
   git worktree add ../<repo>-<slug>-qa <branch-name>
   ```
   If only a remote branch exists, create a local tracking branch in the same
   call: `git worktree add -b <branch-name> ../<repo>-<slug>-qa origin/<branch-name>`.
   Abort on path/branch conflicts.
5. `cd` into the worktree.
6. Fast-forward to the latest:
   ```sh
   git pull --ff-only origin <branch-name>
   ```
   Abort on failure — do not auto-merge or rebase.
7. Confirm: worktree path, branch name, short SHA of tip.

#### In-place mode (`--no-worktree`)

1. `git status --porcelain` must be clean — otherwise abort.
2. `git fetch origin && git checkout <branch-name> && git pull --ff-only origin <branch-name>`.
   Abort on failure.
3. Confirm: branch name and short SHA.

### 7. Append a QA fix round to the plan

This replaces `/bond:implement` step 6 (which writes a fresh plan file).

Find the existing plan file (`docs/plans/<TICKET_ID>.md` or
`docs/plans/<TICKET_ID>_*.md` for multi-ticket branches). If none exists,
create one with the same top structure as `/bond:implement` step 6.

**Append** at the end — do not overwrite — date-stamping so multiple bounces
remain distinguishable:

```
## QA fix round — <YYYY-MM-DD>

### QA feedback
- [<created>] <author>: <verbatim body>
- …

### Files to change
- `<path/to/file>` — <reason tied to a specific QA item>

### Implementation steps
1. <Concrete step>
2. …

### Tests
- `<test file path>` — `<describe> > <it>` — <what it asserts about the fix>
```

Before writing the section, re-read the relevant code with the QA feedback in
mind (this is the equivalent of `/bond:implement` step 5).

Print the new section to the user.

In auto mode, proceed without prompting. In `--no-auto`, ask: *"Does this fix
plan look correct? Reply with changes, or **yes** to start fixing."* and wait
for confirmation.

### 8. Delegate to `/bond:implement`'s implementation tail

From here on, follow `/bond:implement` steps **7, 7b, 8, 9, 10** verbatim, with
two scope tweaks:

- Implement and test only the new **QA fix round** section, not the whole plan.
- In step 9 (ship + open-pr), if a Bitbucket PR already exists for this branch
  (`mcp__bond-bitbucket__get_pull_requests` filtered by source branch), the
  ship push updates it — print the PR URL and **do not** invoke `/bond:open-pr`
  for a second time. Ask the user before re-pinging reviewers via
  `/bond:request-review`; never auto-ping on a QA round.

Step 10 (worktree teardown) uses the `-qa` worktree path recorded in step 6.

## Do NOT

- Do not create a new branch when one already exists — attach to it.
- Do not overwrite the existing plan file — append a new dated `QA fix round`
  section.
- Do not auto-re-ping reviewers via `/bond:request-review` on a QA round.
- Do not duplicate `/bond:implement` logic that already lives in that file —
  reference it (steps 7, 7b, 8, 9, 10) and only diverge where this file says so.
- Do not transition the ticket past In Progress here — In Review / Ready for QA
  is left to `/bond:open-pr` / `/bond:request-review` when the fix actually ships.
