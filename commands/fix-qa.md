---
description: Re-run implementation against QA failure feedback — read off the Jira ticket, or given as free text where the project has no tracker
---

# /bond:fix-qa

A ticket has come back from QA. This command pulls the QA failure comments off the Jira issue, decides what needs to change, and runs the same shared implementation flow `/bond:implement` uses — against the existing branch, appending a dated **QA fix round** to the existing plan.

It is `/bond:implement` with three QA-specific twists, which are the only logic that lives here:

1. The fix scope comes from QA comments, not a fresh ticket read.
2. The branch already exists; attach to it instead of cutting a new one off `main`.
3. The plan file already exists; **append** a dated `## QA fix round` section instead of overwriting.

Everything else is delegated to the shared procedures in `${CLAUDE_PLUGIN_ROOT}/shared/implement-flow.md`. Read that file; the steps below name the procedures to run and the inputs to set.

## Arguments

`$ARGUMENTS` — a single Jira ticket ID (e.g. `ERP-135`), or free text describing
what came back broken, plus optional flags.

Examples:
- `/bond:fix-qa ERP-135`
- `/bond:fix-qa ERP-135 --no-auto`
- `/bond:fix-qa ERP-135 --no-worktree`
- `/bond:fix-qa the rename cache still misses on nested modules` — no tracker: the
  text *is* the feedback, applied to the branch already checked out.

### Flags

Same semantics as `/bond:implement` — `--no-auto` opts out of auto-confirm and auto-ship; `--no-worktree` works in the current tree. Strip flags before parsing the ticket ID. If nothing remains, ask the user.

## Steps

### 1. Parse the ticket ID

Resolve the project profile first (`${CLAUDE_PLUGIN_ROOT}/shared/project-profile.md`).

Under **`TRACKER=none`** there is no ticket and no comment thread: the remaining
text **is** the QA feedback. Take it verbatim as the feedback of step 3, work
against the branch already checked out (a detached HEAD or the base branch is a
blocker — say which branch you expected), and skip steps 2 and 4. Empty text is a
blocker: there is nothing to fix without it.

The rest of this step is the `TRACKER=jira` path. Exactly **one** token must remain after stripping flags, and it must be a configured project key followed by `-` and digits (see `shared/pr-template.md`). Otherwise report the problem and **abort**.

### 2. Resolve the ticket with comments  *(`TRACKER=jira` only)*

Run the shared **Resolve Jira ticket(s)** procedure with `TICKET_IDS` = the one ID and `WITH_COMMENTS=true`.

### 3. Identify the QA failure feedback

Under `TRACKER=none` this is the free text from step 1 — use it as-is and move on.

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

### 4. Claim the ticket and move it to In Progress  *(`TRACKER=jira` only)*

Run the shared **Claim unassigned ticket(s)** procedure with the one ticket ID (it becomes yours if nobody holds it), then the shared **Transition to In Progress** procedure with the same ID.

### 5. Locate the existing branch

Under `TRACKER=none` the branch is the one already checked out — there is no key
to search by. Confirm it is not the base branch or a detached HEAD and continue.

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

Use **in-place mode** whenever `BRANCH_NAME` is the branch already checked out in the current tree — always the case under `TRACKER=none`, and possible under `TRACKER=jira` when the located branch happens to be the current one. `git worktree add` refuses a branch that is checked out elsewhere, so asking for a worktree there fails outright rather than degrading.

### 7. Analyse, plan, and fix

Run these shared procedures in order:

1. **Analyse the codebase** — `FOCUS` = the selected QA feedback items.
2. **Implementation plan** — `PLAN_FILE=docs/plans/<TICKET_ID>.md`, or `docs/plans/<branch-description>.md` under `TRACKER=none`; `PLAN_MODE=append`, `CONFIRM_PROMPT` = *"Does this fix plan look correct? Reply with changes, or **yes** to start fixing."* The dated section to append:

   ```
   ## QA fix round — <YYYY-MM-DD>

   ### QA feedback
   - [<created>] <author>: <verbatim body>
   - …

   ### Images
   - `<filename>` (<comment author/date>): <what the screenshot shows and the
     detail relevant to the fix> — omit this subsection if no images.

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
4. **Review and fix** — `/code-review` over the fix round at the level `bond:routing-code-review` reads off the diff, `--fix` on, then re-run the tests.
5. **Report completion**, then **Ship + PR** with `PR_HANDLING=update`, then **Track CI and autofix** (pass `--no-review` to `/bond:track-pr` — a QA round does not re-ping reviewers), then **Transition to In Review** (green pipeline only; skipped under `TRACKER=none`, where there is no issue to move), then **Teardown**.

Shared inputs for the tail: `MODE` = `no-auto` if `--no-auto` was passed else `auto`; `WORKTREE` = the `-qa` path + original repo dir recorded in step 6, or `none` under `--no-worktree`.

## Do NOT

- Do not create a new branch when one already exists — attach to it (`BRANCH_SOURCE=existing`).
- Do not overwrite the existing plan file — append a new dated `QA fix round` section (`PLAN_MODE=append`).
- Do not transition the ticket past In Progress here — In Review / Ready for QA is left to `/bond:open-pr` / `/bond:request-review` when the fix actually ships.
- The shared flow's own **Do NOT** list applies (including: on `PR_HANDLING=update`, never open a second PR or auto-ping reviewers).
