---
name: pr-template
description: >-
  Use whenever opening or creating a pull request in a Bonliva repo, on any
  host — `gh pr create` against GitHub, the `create_pull_request` /
  `create_draft_pull_request` Bitbucket MCP calls, the `/bond:open-pr` command,
  the Ship + PR step of `/bond:implement` and `/bond-bonliva:fix-qa`, or any time you
  write a PR title and description. Enforces the one shared PR template so every
  PR has the same Summary / Jira / Test plan shape, opens as a draft in Bonliva, and
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

Resolve the host from `git remote get-url origin` before building the call:
`gh pr create` on GitHub,
with `--body-file` or `--body` and never `--fill`; the Bitbucket MCP create
calls otherwise. `/bond:open-pr` and the Ship + PR steps go through the same
template.

Details: references/hosts.md — read when the host or the create call is in doubt.

## Drafts

When the profile resolves `DRAFT` (`shared/project-profile.md` — every Bonliva
repo, unless `.bond/project.json` sets `draft`) PRs are created as drafts on
every host — `--draft` on `gh pr create`, `create_draft_pull_request` on
Bitbucket. The author publishes when the PR is ready for review. Otherwise open
it ready for review.

## Reviewers

Apply the template's **Reviewers** section rather than hand-picking names, on a
manual call as much as on `/bond:open-pr`.

Details: references/reviewers.md — read when building the reviewer list for a PR.

## No AI breadcrumbs

The title, description and every later PR comment follow `authorship-conventions`: no
"generated with" footer, no `Claude-Session:` link, no `Co-Authored-By` naming a
tool — the PR is owned by the human who opens it.

## This is enforced, not advisory

`hooks/check-pr.mjs` blocks a create call that breaks the template. Fix the call
rather than working around the hook.

Details: references/enforcement.md — read when a hook blocks a PR create call.
