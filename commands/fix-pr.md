---
description: Diagnose why a PR's pipeline failed, fix the root causes, and push the changes (updates the PR)
---

# /bond:fix-pr

A PR's pipeline is red. This command reads the failed pipeline's step logs, works
out the **root cause(s)**, fixes them on the PR's branch, and **commits and
pushes** so the pipeline re-runs.

It reuses the procedures in `${CLAUDE_PLUGIN_ROOT}/shared/implement-flow.md` for the
branch / plan / implement / test / ship steps. Read that file; the steps below name
the procedures to run and the inputs to set. The PR-specific logic — coordinate
resolution and pipeline diagnosis — lives here.

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
`source_branch`, `destination_branch`, and `source.commit.hash`.

- If `state` is `MERGED` or `DECLINED`, stop — there is nothing to fix.
- Extract a Jira key from the title with `[A-Z]+-\d+` (used to name the plan file).

### 3. Diagnose the pipeline failure

1. `mcp__bond-bitbucket__get_commit_statuses` with the commit hash → find the most
   recent Bitbucket Pipelines status (`type == "build"`, name starts with
   `Pipeline`). Capture its result and pipeline URL/UUID. If no build status is
   present, fall back to `mcp__bond-bitbucket__list_pipeline_runs` on the source
   branch (newest run whose `target.commit.hash` matches).
2. If the pipeline is **still running**, say so and **stop** — wait for it to
   finish (suggest `/bond:track-pr` to watch it). If the pipeline is **green**, say
   so and **stop** — there is nothing to fix.
3. For a **failed** run, call `mcp__bond-bitbucket__get_pipeline_steps` with the
   pipeline UUID; select the step(s) whose state/result is `FAILED` / `ERROR`.
4. For each failed step, call `mcp__bond-bitbucket__get_pipeline_step_logs`
   (`step_uuid`). Read the tail and extract the concrete cause — failing test
   names, type errors, lint rule + `file:line`, build/compile errors, or the failed
   command and its exit code. Logs can be long; summarize, never echo them whole.
5. Produce one **root cause** entry per distinct failure (e.g. "Type error in
   `accommodations.service.ts:42`", "3 failing tests in `pricing.spec.ts`"), each
   carrying the step name and the key log excerpt. Print the diagnosis to the user.

### 4. Fix the root causes (shared flow)

Run the shared procedures in order, scoped to the diagnosed root causes:

1. **Set up the branch** — `BRANCH_NAME` = the PR's `source_branch`,
   `BRANCH_SOURCE=existing`, `WORKTREE_SUFFIX=-prfix` (the suffix avoids clobbering
   an `/implement` or `/fix-qa` worktree). Worktree by default; in-place under
   `--no-worktree`. Record the worktree path + original repo dir for Teardown.
2. **Analyse the codebase** — `FOCUS` = the diagnosed root causes.
3. **Implementation plan** — `PLAN_FILE=docs/plans/<JIRA_KEY>.md` (fall back to the
   branch slug when there is no Jira key), `PLAN_MODE=append`, with this dated
   section:

   ```
   ## Pipeline fix round — <YYYY-MM-DD> (PR #<id>)

   ### Pipeline failure
   - <step> — <root cause + key log line>
   - …

   ### Files to change
   - `<path>` — <reason tied to a specific root cause>

   ### Implementation steps
   1. <concrete step>

   ### Tests
   - `<test file>` — `<describe> > <it>` — <what it asserts>

   ### Decisions
   - <decision>: considered <options>; chose <selected> — <why>.
   ```

   `CONFIRM_PROMPT` = *"Does this fix plan look correct? Reply with changes, or
   **yes** to start fixing."*
4. **Implement** then **Test** — `SCOPE` = only the new `## Pipeline fix round`
   section.
5. **Report completion**, then **Ship + PR** with `PR_HANDLING=update` (commits and
   pushes automatically in auto mode; the push updates the existing PR — never opens
   a second one), then **Teardown**.

Shared tail inputs: `MODE` = `no-auto` if `--no-auto` was passed else `auto`;
`WORKTREE` = the `-prfix` path + original repo dir from step 4.1, or `none` under
`--no-worktree`.

### 5. Report

Print:

- PR #, title, branch, PR URL.
- Pipeline verdict + the root cause(s) found, and how each was fixed.
- Plan file path and the files changed.
- Push result — or, in `no-auto` mode, the reminder to run `/bonliva-dev:ship`.
- Suggest `/bond:track-pr <id>` to watch the re-run.

## Do NOT

- Do not echo whole pipeline logs — summarize the root cause with a short excerpt.
- Do not start on a PR that is `MERGED` or `DECLINED`.
- On `PR_HANDLING=update`, never open a second PR and never auto-ping reviewers.
- The shared flow's own **Do NOT** list applies.
