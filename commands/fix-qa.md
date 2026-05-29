---
description: Read QA failure feedback from a Jira ticket and re-run implementation to fix it
---

# /bond:fix-qa

A ticket has come back from QA. This command pulls the QA failure comments off the Jira issue, decides what needs to change, and runs the same shared implementation flow `/bond:implement` uses — against the existing branch, appending a dated **QA fix round** to the existing plan.

It is `/bond:implement` with three QA-specific twists, which are the only logic that lives here:

1. The fix scope comes from QA comments, not a fresh ticket read.
2. The branch already exists; attach to it instead of cutting a new one off `main`.
3. The plan file already exists; **append** a dated `## QA fix round` section instead of overwriting.

Everything else is delegated to the shared procedures in `${CLAUDE_PLUGIN_ROOT}/shared/implement-flow.md`. Read that file; the steps below name the procedures to run and the inputs to set.

## Arguments

`$ARGUMENTS` — a single Jira ticket ID (e.g. `ERP-135`) plus optional flags.

Examples:
- `/bond:fix-qa ERP-135`
- `/bond:fix-qa ERP-135 --no-auto`
- `/bond:fix-qa ERP-135 --no-worktree`

### Flags

Same semantics as `/bond:implement` — `--no-auto` opts out of auto-confirm and auto-ship; `--no-worktree` works in the current tree. Strip flags before parsing the ticket ID. If no ticket ID remains, ask the user.

## Steps

### 1. Parse the ticket ID

Exactly **one** token must remain after stripping flags, matching `^[A-Z]+-\d+$`. Otherwise report the problem and **abort**.

### 2. Resolve the ticket with comments

Run the shared **Resolve Jira ticket(s)** procedure with `TICKET_IDS` = the one ID and `WITH_COMMENTS=true`.

### 3. Identify the QA failure feedback

From the comments, find what QA wants fixed:

1. Render comments as plain text, sort by `created` ascending.
2. Select in this order of preference:
   - Comments newer than the most recent transition back to In Progress / Failed QA / Reopened (when inferrable).
   - Comments mentioning `QA`, `failed`, `regression`, `doesn't work`, `still broken`, `repro`, `reproduce`, `bug`, `not fixed`.
   - Fallback: the **3 most recent** comments overall.
3. Drop comments authored by the current user (`git config user.email` vs the comment author's email when available).

Print the selected comments chronologically:

```
QA feedback on <TICKET_ID> — <summary>:
  [<created>] <author>: <body>
  …
```

If the selection is empty, note that no QA-failure comments were found and continue with the ticket description alone — record this fallback in the plan's `### Decisions`.

In `--no-auto` mode, ask *"Use this QA feedback as the fix scope? Reply with edits or **yes** to continue."* and wait. In auto mode, continue and note auto-confirm is enabled.

### 4. Move the ticket to In Progress

Run the shared **Transition to In Progress** procedure with the one ticket ID.

### 5. Locate the existing branch

The ticket has been implemented before, so the branch likely exists. Candidates in order:

1. `fix/<TICKET_ID>`
2. `feat/<TICKET_ID>`
3. Any local or remote branch whose name contains `<TICKET_ID>` (multi-ticket branches like `fix/<TICKET_ID>_<OTHER>`).

```sh
git fetch origin
git for-each-ref --sort=-committerdate \
  --format='%(refname:short)' \
  refs/heads/ refs/remotes/origin/ | grep -E "(^|/)(fix|feat)/.*<TICKET_ID>"
```

Pick the **most recently committed** match automatically; if several match, record the candidates and the chosen branch in the plan's `### Decisions` rather than asking. If none match, tell the user "no existing branch for `<TICKET_ID>` — use `/bond:implement <TICKET_ID>` for a first-time implementation" and **abort** (a genuine blocker, not a choice).

### 6. Set up the branch

Run the shared **Set up the branch** procedure with `BRANCH_NAME` = the located branch, `BRANCH_SOURCE=existing`, and `WORKTREE_SUFFIX=-qa` (the suffix avoids clobbering an existing `/implement` worktree).

### 7. Analyse, plan, and fix

Run these shared procedures in order:

1. **Analyse the codebase** — `FOCUS` = the selected QA feedback items.
2. **Implementation plan** — `PLAN_FILE=docs/plans/<TICKET_ID>.md`, `PLAN_MODE=append`, `CONFIRM_PROMPT` = *"Does this fix plan look correct? Reply with changes, or **yes** to start fixing."* The dated section to append:

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

   ### Decisions
   - <decision>: considered <options>; chose <selected> — <why>.
   ```

3. **Implement** then **Test** — `SCOPE` = **only the new `## QA fix round` section**, not the whole plan.
4. **Report completion**, then **Ship + PR** with `PR_HANDLING=update`, then **Teardown**.

Shared inputs for the tail: `MODE` = `no-auto` if `--no-auto` was passed else `auto`; `WORKTREE` = the `-qa` path + original repo dir recorded in step 6, or `none` under `--no-worktree`.

## Do NOT

- Do not create a new branch when one already exists — attach to it (`BRANCH_SOURCE=existing`).
- Do not overwrite the existing plan file — append a new dated `QA fix round` section (`PLAN_MODE=append`).
- Do not transition the ticket past In Progress here — In Review / Ready for QA is left to `/bond:open-pr` / `/bond:request-review` when the fix actually ships.
- The shared flow's own **Do NOT** list applies (including: on `PR_HANDLING=update`, never open a second PR or auto-ping reviewers).
