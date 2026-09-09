---
description: Open a draft pull request for the current branch (GitHub or Bitbucket)
---

# /open-pr

Creates a pull request from the current branch into a base branch (`main` by default). The host is resolved from the `origin` remote: `gh` for a GitHub repo, the Bitbucket MCP server (`bond-bitbucket`) for a Bitbucket one.

Usage: `/open-pr [base-branch]`

`$ARGUMENTS` — an optional **base branch** to target the PR at. If omitted, the base is resolved **per repo** (step 2). Examples: `/open-pr`, `/open-pr develop`, `/open-pr release/2.0`. Call this base `<base>` throughout the steps below.

PRs are **always** created as drafts (not ready for review). The author publishes the draft when it is ready for review.

## Steps

### 1. Get current branch

```sh
git rev-parse --abbrev-ref HEAD
```

Abort if result is `HEAD` (detached HEAD).

### 2. Resolve host, project and repository

```sh
git remote get-url origin
```

- `git@bitbucket.org:bonliva/bonliva-erp.git` → host **Bitbucket**, workspace `bonliva`, repository `bonliva-erp`
- `git@github.com:Bonliva/bonliva-erp.git` (or a `github-*` SSH host alias) → host **GitHub**, owner `Bonliva`, repository `bonliva-erp`

Call this `<host>` throughout. Steps 4 and 6 branch on it.

Resolve the rest — `<base>`, the tracker, and whether this repo has reviewers at
all — from the **project profile**,
`${CLAUDE_PLUGIN_ROOT}/shared/project-profile.md`. It reads `.bond/project.json`
when the repo has one, applies the Bonliva slug table only inside Bonliva, and
otherwise takes the remote's own default branch. A `$ARGUMENTS` base still wins
over everything.

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

Follow the **Reviewers** section of `${CLAUDE_PLUGIN_ROOT}/shared/pr-template.md`:
`$HOME/.bond/pr-reviewers.json` first (managed by `/bond:set-reviewers`), falling
back to the host's own defaults — `mcp__bond-bitbucket__get_effective_default_reviewers`
for the workspace and repo slug on Bitbucket, the repo's configured reviewers or
`CODEOWNERS` on GitHub. Carry them into step 6 as `uuid` values (Bitbucket) or
handles (GitHub).

### 5. Push the branch

```sh
git push -u origin <branch>
```

### 6. Create the PR

First check whether an open PR already exists for this source branch — `gh pr list --head <branch> --state open` on GitHub, `mcp__bond-bitbucket__get_pull_requests` (state `OPEN`) on Bitbucket. If one is found, skip creation, print its URL, and continue to step 7.

Otherwise create a new one (this also covers a previously declined PR — Bitbucket cannot reopen those), always as a **draft**:

**GitHub.** Write the description from step 3 to a temp file and pass it as `--body-file`, so the body survives quoting intact. Never `--fill`.

```sh
gh pr create --draft --base <base> --head <branch> \
  --title "<title>" --body-file "$body_file" \
  --reviewer <handle>
```

**Bitbucket.** Use `mcp__bond-bitbucket__create_draft_pull_request`:
- `workspace`: resolved workspace (e.g. `bonliva`)
- `repo_slug`: resolved repository slug (e.g. `bonliva-erp`)
- `title`: built in step 3
- `description`: built in step 3
- `source_branch`: current branch name
- `destination_branch`: `<base>` (resolved in step 2)
- `reviewers`: UUIDs resolved in step 4 (omit if none)

The `check-pr` hook blocks either call if the description lost its `## Summary` / `## Jira` / `## Test plan` shape or the create is not a draft — rebuild it from the template rather than working around the hook.

On success, print the PR URL. On failure, report the error and stop.

### 7. Transition Jira ticket to In Review

For each ticket ID extracted in step 3 (if any), run the **transition** procedure
in `${CLAUDE_PLUGIN_ROOT}/commands/jira.md` with target status **In Review**. It
resolves `cloudId` and walks the linear status chain (`Todo → In Progress → In
Review → QA`) one hop at a time, so a ticket sitting at `Todo` is stepped through
`In Progress` to `In Review` rather than skipped. Report per ticket; skip
silently if already at or beyond In Review; if a transition call fails, surface
the error but do not fail the command.
