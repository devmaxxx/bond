---
description: Open a pull request for the current branch on GitHub
---

# /open-pr

**Ask first.** Before the first write, one `AskUserQuestion` with every decision `$ARGUMENTS` leaves open — none when they settle it all (standing rule *Commands ask first*).

Creates a pull request from the current branch into a base branch (`main` by default). The host is GitHub, through `gh`.

Usage: `/open-pr [base-branch] [--issue <ID>…]`

`$ARGUMENTS` — an optional **base branch** to target the PR at, and optional
`--issue` IDs (`ERP-123`, or `#42` for a GitHub issue) the title must lead with. If omitted, the base is resolved **per repo** (step 2). Examples: `/open-pr`, `/open-pr develop`, `/open-pr release/2.0`. Call this base `<base>` throughout the steps below.

Where the project profile resolves `DRAFT` (`"draft": true` in `.bond/project.json`) PRs are created as drafts; the author publishes the draft when it is ready for review. Anywhere else the PR opens ready for review.

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

`git@github.com:devmaxxx/repograph.git` (or a `github-*` SSH host alias) → owner `devmaxxx`, repository `repograph`. A remote that is not on GitHub ⇒ report it and stop.

Resolve the rest — `<base>`, the tracker, and whether this repo has reviewers at
all — from the **project profile**,
`${CLAUDE_PLUGIN_ROOT}/shared/project-profile.md`. It reads `.bond/project.json`
when the repo has one, and
otherwise takes the remote's own default branch. A `$ARGUMENTS` base still wins
over everything.

### 3. Build title and description

Build the title and description from the **shared PR template** in
`${CLAUDE_PLUGIN_ROOT}/shared/pr-template.md` — the single source of truth for
PR formatting. Read that file and set its inputs:

- `<branch>` — current branch (step 1).
- `<base>` — resolved base (step 2).
- `<commits>` — `git log origin/<base>..<branch> --oneline`.
- `<tickets>` — the issue the PR belongs to, first source that yields one:
  1. `--issue` IDs from `$ARGUMENTS`;
  2. ticket keys in the branch name, per the template's `<tickets>` rule;
  3. the same keys in `<commits>`' subjects and bodies;
  4. `Closes` / `Fixes` / `Resolves #<n>` in those commit bodies, as `#<n>`.

  The title always leads with them. None found ⇒ the plain description, and say
  in the report that the PR names no issue.

Then produce the title and description exactly as the template defines them.

### 4. Resolve reviewers

Follow the **Reviewers** section of `${CLAUDE_PLUGIN_ROOT}/shared/pr-template.md`:
`reviewers` in `.bond/project.json` first, falling back to the repo's configured
reviewers or `CODEOWNERS`. Carry them into step 6 as GitHub handles.

### 5. Push the branch

```sh
git push -u origin <branch>
```

### 6. Create the PR

First check whether an open PR already exists for this source branch — `gh pr list --head <branch> --state open`. If one is found, skip creation, print its URL, and continue to step 7.

Otherwise create a new one — as a **draft** when `DRAFT` resolves, ready for review otherwise. Write the description from step 3 to a temp file and pass it as `--body-file`, so the body survives quoting intact. Never `--fill`. Drop `--draft` when `DRAFT` does not resolve.

```sh
gh pr create --draft --base <base> --head <branch> \
  --title "<title>" --body-file "$body_file" \
  --reviewer <handle>
```

The `check-pr` hook blocks the call if the description lost its `## Summary` / `## Jira` / `## Test plan` shape or a create is not a draft where `DRAFT` resolves — rebuild it from the template rather than working around the hook.

On success, print the PR URL. On failure, report the error and stop.

### 7. Transition Jira ticket to In Review

For each Jira key in step 3's `<tickets>` (if any — a GitHub `#<n>` is not one), run the **transition** procedure
in `${CLAUDE_PLUGIN_ROOT}/commands/jira.md` with target status **In Review**. It
resolves `cloudId` and walks the linear status chain (`Todo → In Progress → In
Review → QA`) one hop at a time, so a ticket sitting at `Todo` is stepped through
`In Progress` to `In Review` rather than skipped. Report per ticket; skip
silently if already at or beyond In Review; if a transition call fails, surface
the error but do not fail the command.
