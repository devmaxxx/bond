---
description: Collect a PR's unresolved review comments, multiselect which must be fixed, implement and push the fixes, then resolve the addressed comments
---

# /bond:fix-pr-review

A PR has open review comments. This command pulls the PR's **unresolved review
comments**, shows a **multiselect** so you pick which **must be fixed**, fixes the
selected ones on the PR's branch, **commits and pushes**, then replies to and
resolves the comments it addressed.

For a red **pipeline**, use the separate `/bond:fix-pr` command.

It reuses the procedures in `${CLAUDE_PLUGIN_ROOT}/shared/implement-flow.md` for the
branch / plan / implement / test / ship steps. Read that file; the steps below name
the procedures to run and the inputs to set. The PR-specific logic — coordinate
resolution, comment triage, the multiselect, and comment resolution — lives here.

## Arguments

`$ARGUMENTS` — a PR number (e.g. `444`) or a full Bitbucket PR URL
(`https://bitbucket.org/<ws>/<repo>/pull-requests/<id>`), plus optional flags. If
no PR is given, ask the user before doing anything else.

### Flags

Same semantics as `/bond:implement` — `--no-auto` opts out of auto-confirm and
auto-ship; `--no-worktree` works in the current tree. Strip flags before parsing
the PR token.

## Steps

### 1. Resolve the PR coordinates

- **Full URL** — parse `workspace`, `repo_slug`, and `pull_request_id` from it.
- **Bare number** — `workspace` is `bonliva`; derive `repo_slug` from
  `git remote get-url origin` of the current repo; `pull_request_id` is the number.

### 2. Fetch PR details

Call `mcp__bond-bitbucket__get_pull_request`. Extract `title`, `state`, `author`,
`source_branch`, `destination_branch`.

- If `state` is `MERGED` or `DECLINED`, stop — there is nothing to fix.
- Extract a Jira key from the title with `[A-Z]+-\d+` (used to name the plan file).

### 3. Gather unresolved review comments

Call `mcp__bond-bitbucket__get_pull_request_comments` with `unresolved_only: true`
(paginate via `max_pages` when needed). For each comment capture: `comment_id`,
author, inline location (`file` + line when present) or "general", the body, and
`is_resolved`.

- Drop comments authored by the **PR author** themselves and pure 👍 / "nit: done"
  acknowledgements. Keep reviewer requests, questions, and change requests.
- Each kept comment becomes one **review issue**.

If there are no open comments, tell the user the PR has no unresolved review
comments and **stop**.

### 4. Multiselect the issues to fix

Present the review issues with `AskUserQuestion` (`multiSelect: true`), question
*"Which review comments must be fixed on PR #<id>?"*. Each issue is one option:

- `label` — a short title (≤ ~5 words), e.g. `Extract pricing helper` or
  `Null-check booking`.
- `description` — the detail: author + `file:line` + the verbatim comment body
  (and `comment_id`).

`AskUserQuestion` allows **2–4 options per question** and up to 4 questions. If there
are more than 4 distinct comments, split them across additional questions; beyond
16, group closely-related comments into a single option and enumerate the specifics
in its `description`.

The user's selection is the **fix scope**. If they select nothing, stop.

### 5. Fix the selected comments (shared flow)

Run the shared procedures in order, scoped to the selected comments:

1. **Set up the branch** — `BRANCH_NAME` = the PR's `source_branch`,
   `BRANCH_SOURCE=existing`, `WORKTREE_SUFFIX=-review` (the suffix avoids clobbering
   an `/implement`, `/fix-qa`, or `/fix-pr` worktree). Worktree by default; in-place
   under `--no-worktree`. Record the worktree path + original repo dir for Teardown.
2. **Analyse the codebase** — `FOCUS` = the selected comments.
3. **Implementation plan** — `PLAN_FILE=docs/plans/<JIRA_KEY>.md` (fall back to the
   branch slug when there is no Jira key), `PLAN_MODE=append`, with this dated
   section:

   ```
   ## Review fix round — <YYYY-MM-DD> (PR #<id>)

   ### Selected review comments
   - <author> @ <file:line>: <verbatim comment> (comment_id <id>)
   - …

   ### Files to change
   - `<path>` — <reason tied to a specific selected comment>

   ### Implementation steps
   1. <concrete step>

   ### Tests
   - `<test file>` — `<describe> > <it>` — <what it asserts>

   ### Decisions
   - <decision>: considered <options>; chose <selected> — <why>.
   ```

   `CONFIRM_PROMPT` = *"Does this fix plan look correct? Reply with changes, or
   **yes** to start fixing."*
4. **Implement** then **Test** — `SCOPE` = only the new `## Review fix round`
   section.
5. **Report completion**, then **Ship + PR** with `PR_HANDLING=update` (commits and
   pushes automatically in auto mode; the push updates the existing PR — never opens
   a second one), then **Teardown**.

Shared tail inputs: `MODE` = `no-auto` if `--no-auto` was passed else `auto`;
`WORKTREE` = the `-review` path + original repo dir from step 5.1, or `none` under
`--no-worktree`.

### 6. Reply to and resolve the addressed comments

After the push succeeds, for each selected comment that was actually fixed:

1. `mcp__bond-bitbucket__add_pull_request_comment` — a one-line reply noting the fix
   (e.g. "Fixed in `<short-sha>` — extracted the helper as suggested.").
2. `mcp__bond-bitbucket__resolve_pull_request_comment` with its `comment_id`.

In `no-auto` mode, ask once before resolving. Skip comments that weren't selected or
couldn't be addressed, and say which were left open and why. If a reply/resolve call
fails, surface the error but do **not** fail the command — the fix is already pushed.

### 7. Report

Print:

- PR #, title, branch, PR URL.
- Review comments found / selected / resolved (with ids), and any left open.
- Plan file path and the files changed.
- Push result — or, in `no-auto` mode, the reminder to run `/bonliva-dev:ship`.

## Do NOT

- Do not fix comments the user did not select in step 4.
- Do not resolve a review comment you didn't actually address.
- Do not start on a PR that is `MERGED` or `DECLINED`.
- Do not diagnose or fix the pipeline here — that is `/bond:fix-pr`.
- On `PR_HANDLING=update`, never open a second PR and never auto-ping reviewers.
- The shared flow's own **Do NOT** list applies.
