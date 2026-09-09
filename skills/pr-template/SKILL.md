---
name: pr-template
description: >-
  Use whenever opening or creating a pull request in a Bonliva repo, on any
  host — `gh pr create` against GitHub, the `create_pull_request` /
  `create_draft_pull_request` Bitbucket MCP calls, the `/bond:open-pr` command,
  the Ship + PR step of `/bond:implement` and `/bond:fix-qa`, or any time you
  write a PR title and description. Enforces the one shared PR template so every
  PR has the same Summary / Jira / Test plan shape, opens as a draft, and
  carries the same default reviewers. Trigger on "open a PR", "create a pull
  request", "draft a PR", "write a PR description", "gh pr create", "add
  reviewers to a PR".
---

# PR template

Every pull request in a Bonliva repo uses **one** title + description format and
the same default reviewers, whatever host the repo lives on. Do not invent a
per-PR layout, do not copy an old PR's wording, and do not hand-pick reviewers.

## The rule

Read the shared template at `${CLAUDE_PLUGIN_ROOT}/shared/pr-template.md` and
build the PR title, description, and reviewer list exactly as it defines them.
That file is the single source of truth — when it changes, every PR changes with
it.

Set its inputs from the branch being shipped:

- `<branch>` — `git rev-parse --abbrev-ref HEAD`.
- `<base>` — the destination branch the PR targets.
- `<commits>` — `git log origin/<base>..<branch> --oneline`.
- `<tickets>` — ticket IDs matching `[A-Z]+-\d+` from the branch name.

Then apply the template's Title and Description sections verbatim, including
omitting the `## Jira` section when there are no tickets.

## Every host, every path

The rule is not Bitbucket-specific. It binds equally on:

- **GitHub** — `gh pr create`. Pass the built description with `--body-file`
  (a heredoc written to a temp file) or `--body`; never `--fill`, which builds
  the body out of commit subjects and skips the template entirely.
- **Bitbucket** — `mcp__bond-bitbucket__create_draft_pull_request`, whether
  called by `/bond:open-pr` or by hand.
- **Commands** — `/bond:open-pr`, and the Ship + PR step that `/bond:implement`
  and `/bond:fix-qa` run.

Resolve the host from `git remote get-url origin` before building the call.

## Drafts

PRs are **always** created as drafts on every host — `--draft` on `gh pr
create`, `create_draft_pull_request` on Bitbucket. The author publishes when the
PR is ready for review.

## Reviewers

Apply the template's **Reviewers** section: resolve the reviewer list from
`$HOME/.bond/pr-reviewers.json` first, then fall back to the host's own default
reviewers (`mcp__bond-bitbucket__get_effective_default_reviewers` on Bitbucket,
the repo's configured reviewers or `CODEOWNERS` on GitHub). Pass them as the
`reviewers` array on a Bitbucket create call, or as `--reviewer` flags on `gh`.
This applies to manual calls too, not just `/bond:open-pr`.

## No AI breadcrumbs

The title, description and every later PR comment follow `oleg-skills`: no
"generated with" footer, no `Claude-Session:` link, no `Co-Authored-By` naming a
tool — the PR is owned by the human who opens it.

## This is enforced, not advisory

`hooks/check-pr.mjs` runs as a `PreToolUse` hook on `gh pr create` and on the
Bitbucket MCP create calls. It blocks a description missing `## Summary` or
`## Test plan`, a ticket-bearing PR with no `## Jira` section, a non-draft
create, and `--fill`. `hooks/check-commit.mjs` separately blocks AI breadcrumbs
in `gh pr …`. Fix the call rather than working around the hook.
