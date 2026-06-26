---
name: pr-template
description: >-
  Use whenever opening or creating a Bitbucket pull request in a Bonliva repo —
  the `/bond:open-pr` command, a manual `create_pull_request` /
  `create_draft_pull_request` MCP call, or any time you write a PR title and
  description. Enforces the one shared PR template so every PR has the same
  Summary / Jira / Test plan shape. Trigger on "open a PR", "create a pull
  request", "draft a PR", "write a PR description".
---

# PR template

Every pull request in a Bonliva repo uses **one** title + description format. Do
not invent a per-PR layout and do not copy an old PR's wording.

## The rule

Read the shared template at `${CLAUDE_PLUGIN_ROOT}/shared/pr-template.md` and
build the PR title and description exactly as it defines them. That file is the
single source of truth — when it changes, every PR changes with it.

Set its inputs from the branch being shipped:

- `<branch>` — `git rev-parse --abbrev-ref HEAD`.
- `<base>` — the destination branch the PR targets.
- `<commits>` — `git log origin/<base>..<branch> --oneline`.
- `<tickets>` — ticket IDs matching `[A-Z]+-\d+` from the branch name.

Then apply the template's Title and Description sections verbatim, including
omitting the `## Jira` section when there are no tickets.

PRs are always created as **drafts**; the author publishes when ready.
