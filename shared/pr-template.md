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

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Omit the `## Jira` section entirely if `<tickets>` is empty.
