# Shared PR template

> **Not an invocable command.** Single source of truth for the title and
> description of every Bitbucket pull request opened in a Bonliva repo. Used by
> `/bond:open-pr` and by the `pr-template` skill. Edit the format here and every
> PR path picks it up — do not copy this format into individual commands.

## Inputs

Set these before building the title/description:

- `<branch>` — current source branch (`git rev-parse --abbrev-ref HEAD`).
- `<base>` — destination branch the PR targets.
- `<commits>` — commits not yet in the base: `git log origin/<base>..<branch> --oneline`.
- `<tickets>` — Jira ticket IDs matching `[A-Z]+-\d+` extracted from `<branch>`.

## Title

`<TICKET_IDs>: <short description from commits>`

If no ticket IDs were found, drop the prefix and use just the short description.

## Description

```markdown
## Summary

<1-3 bullet points from the commit messages>

## Jira

<For each ticket: - ERP-123: https://bonliva.atlassian.net/browse/ERP-123>

## Test plan

- [ ] <golden path>
- [ ] <edge case>
```

Omit the `## Jira` section entirely if `<tickets>` is empty. The description
ends at the test plan: no "generated with" footer, no session link, no AI
co-author line — the PR is owned by the human who opens it (`oleg-skills`).

## Reviewers

Every PR is created with default reviewers attached. Resolve them in this order:

1. **`$HOME/.bond/pr-reviewers.json`** (managed by `/bond:set-reviewers`) — if it
   exists and its `reviewers` array is non-empty, use those `uuid` values.
2. **Bitbucket effective default reviewers** — otherwise call
   `mcp__bond-bitbucket__get_effective_default_reviewers` with the workspace and
   repo slug, and collect the returned `uuid` values.

Pass the resolved UUIDs as the `reviewers` array on
`create_draft_pull_request` / `create_pull_request`. Omit the parameter if both
sources yield nothing. Never invent reviewers or carry them over from an old PR.
