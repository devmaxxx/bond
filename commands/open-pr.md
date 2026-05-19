---
description: Open the Bitbucket PR creation page for the current branch
---

# /open-pr

Creates a Bitbucket pull request from the current branch into `main` using the Bitbucket MCP server (`bond-bitbucket`).

Usage: `/open-pr`

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

### 3. Build title and description

Get commits not yet in `main`:

```sh
git log origin/main..<branch> --oneline
```

Extract ticket IDs matching `[A-Z]+-\d+` from the branch name.

**Title:** `<TICKET_IDs>: <short description from commits>`

**Description:**

```markdown
## Summary

<1-3 bullet points from the commit messages>

## Jira

<For each ticket: - ERP-123: https://bonliva.atlassian.net/browse/ERP-123>

## Test plan

- [ ] <golden path>
- [ ] <edge case>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Omit the Jira section if no ticket IDs were found.

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
- `destination_branch`: `main`
- `reviewers`: UUIDs resolved in step 4 (omit if none)

On success, print the PR URL. On failure, report the error and stop.

### 7. Transition Jira ticket to In Review

For each ticket ID extracted in step 3 (if any):

1. Resolve `cloudId` once via `mcp__bond-atlassian__getAccessibleAtlassianResources`.
2. Use `mcp__bond-atlassian__getTransitionsForJiraIssue` with `cloudId` and `issueIdOrKey` to fetch available transitions.
3. Find the transition whose `name` contains "review" (case-insensitive).
4. If found, call `mcp__bond-atlassian__transitionJiraIssue` with `cloudId`, `issueIdOrKey`, and that transition ID.
5. Report success or skip silently if no matching transition exists.

### 8. Send the review request to Teams

After the PR exists (whether newly created or pre-existing), invoke `/bond:request-review`
with the PR URL from step 6 to post a review-invite card to the Teams channel.

- Follow the `/bond:request-review` flow as written — including its "show before
  sending" confirmation step.
- If `BOND_TEAMS_WEBHOOK_URL` is not configured, skip this step with a note
  (`Skipped Teams review request — webhook not set; run /bond:setup-plugin`).
  A missing webhook must not fail `/open-pr`.
