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

`$ARGUMENTS` — a PR number (e.g. `444`) or a full PR URL on either host
(`https://bitbucket.org/<ws>/<repo>/pull-requests/<id>`,
`https://github.com/<owner>/<repo>/pull/<id>`), plus optional flags. If no PR is
given, ask the user before doing anything else.

### Flags

Same semantics as `/bond:implement` — `--no-auto` opts out of auto-confirm and
auto-ship; `--no-worktree` works in the current tree. Strip flags before parsing
the PR token.

## Steps

### 1. Resolve the PR coordinates

Run the **Resolve PR coordinates** procedure in
`${CLAUDE_PLUGIN_ROOT}/shared/project-profile.md`. A bare number takes its host
and workspace from the project profile, so this works in a GitHub repo as well
as a Bitbucket one.

### 2. Fetch PR details

Run the **PR details and CI status** procedure in the same file for `title`,
`state`, `source_branch`, `destination_branch` and the head commit.

- If the PR is merged or closed/declined, stop — there is nothing to fix.
- Under `TRACKER=jira`, extract a ticket key from the title using the configured
  project keys (see `shared/pr-template.md`) to name the plan file. Under
  `TRACKER=none` there is no key: name the plan file after the source branch.

### 3. Diagnose the pipeline failure

1. Resolve the CI state through the **PR details and CI status** procedure. It
   normalises both hosts to **running** / **passed** / **failed**, so the rest of
   this step is the same whether the checks ran on Bitbucket Pipelines or GitHub
   Actions.
2. **running** — say so and **stop**; wait for it to finish (suggest
   `/bond:track-pr` to watch it). **passed** — say so and **stop**, there is
   nothing to fix.
3. **failed** — pull the logs of the failed steps only: `get_pipeline_step_logs`
   per failed step on Bitbucket, `gh run view <run-id> --log-failed` on GitHub.
4. From each, extract the concrete cause — failing test names, type errors, lint
   rule + `file:line`, build/compile errors, or the failed command and its exit
   code. Logs can be long; summarize, never echo them whole.
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
   a second one), then **Track CI and autofix**, then **Teardown**.

   This command *is* an autofix round, so it enters that procedure having spent
   one of the two: watch the pipeline the push started, and if it is red again,
   one more `/bond:fix-pr` is allowed before stopping and reporting. Skip
   **Transition to In Review** — a PR reached this way carries no ticket context.

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
