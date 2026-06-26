---
description: Open the Bitbucket PR creation page for the current branch
---

# /open-pr

Creates a Bitbucket pull request from the current branch into a base branch (`main` by default) using the Bitbucket MCP server (`bond-bitbucket`).

Usage: `/open-pr [base-branch]`

`$ARGUMENTS` — an optional **base branch** to target the PR at. If omitted, the base is resolved **per repo** (step 2). Examples: `/open-pr`, `/open-pr develop`, `/open-pr release/2.0`. Call this base `<base>` throughout the steps below.

PRs are **always** created as drafts (not ready for review). The author publishes the draft when it is ready for review.

## Steps

### 1. Get current branch

```sh
git rev-parse --abbrev-ref HEAD
```

Abort if result is `HEAD` (detached HEAD).

### 2. Resolve project and repository

```sh
git remote get-url origin
```

- `git@bitbucket.org:bonliva/bonliva-erp.git` → workspace `bonliva`, repository `bonliva-erp`

Resolve `<base>`: if `$ARGUMENTS` named a base branch, use it. Otherwise pick the repo's default base from the `repo_slug` (case-insensitive):

| Repo slug contains | Default base |
| ------------------ | ------------ |
| `erp`              | `main`       |
| `crm`              | `dev`        |
| `async`            | `master`     |
| anything else      | `dev`        |

### 3. Build title and description

Build the title and description from the **shared PR template** in
`${CLAUDE_PLUGIN_ROOT}/shared/pr-template.md` — the single source of truth for
PR formatting. Read that file and set its inputs:

- `<branch>` — current branch (step 1).
- `<base>` — resolved base (step 2).
- `<commits>` — `git log origin/<base>..<branch> --oneline`.
- `<tickets>` — ticket IDs matching `[A-Z]+-\d+` from the branch name.

Then produce the title and description exactly as the template defines them.

### 4. Resolve reviewers

Check for a configured default reviewer list at `$HOME/.bond/pr-reviewers.json` (managed by `/bond:set-reviewers`):

- **File exists with a non-empty `reviewers` array** → use those `uuid` values.
- **File missing or empty** → fall back to `mcp__bond-bitbucket__get_effective_default_reviewers` with the resolved workspace and repo slug, and collect the returned `uuid` values.

Pass the resolved `uuid` values as the `reviewers` array when creating the PR.

### 5. Push the branch

```sh
git push -u origin <branch>
```

### 6. Create the PR

First, use `mcp__bond-bitbucket__get_pull_requests` (state `OPEN`) to check whether an open PR already exists for this source branch. If one is found, skip creation, print its URL, and continue to step 7.

Otherwise, create a new PR (this also covers the case where a previous PR was declined — Bitbucket does not support reopening declined PRs):

Always use `mcp__bond-bitbucket__create_draft_pull_request` to create the PR as a draft. It accepts these parameters:
- `workspace`: resolved workspace (e.g. `bonliva`)
- `repo_slug`: resolved repository slug (e.g. `bonliva-erp`)
- `title`: built in step 3
- `description`: built in step 3
- `source_branch`: current branch name
- `destination_branch`: `<base>` (resolved in step 2)
- `reviewers`: UUIDs resolved in step 4 (omit if none)

On success, print the PR URL. On failure, report the error and stop.

### 7. Transition Jira ticket to In Review

For each ticket ID extracted in step 3 (if any), run the **transition** procedure
in `${CLAUDE_PLUGIN_ROOT}/commands/jira.md` with target status **In Review**. It
resolves `cloudId` and walks the linear status chain (`Todo → In Progress → In
Review → QA`) one hop at a time, so a ticket sitting at `Todo` is stepped through
`In Progress` to `In Review` rather than skipped. Report per ticket; skip
silently if already at or beyond In Review; if a transition call fails, surface
the error but do not fail the command.
