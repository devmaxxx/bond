# Shared PR template

> **Not an invocable command.** Single source of truth for the title and
> description of every pull request opened in a Bonliva repo, on GitHub and on
> Bitbucket alike. Used by `/bond:open-pr`, by the Ship + PR step of
> `/bond:implement` and `/bond:fix-qa`, and by the `pr-template` skill. Edit the
> format here and every PR path picks it up — do not copy this format into
> individual commands.

The shape below is not a suggestion: `hooks/check-pr.mjs` blocks a create call
whose description is missing `## Summary` or `## Test plan`, one that carries a
ticket id with no `## Jira` section, and one that is not a draft.

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

## Drafts

Every PR is created as a **draft**, on every host — `--draft` on `gh pr create`,
`create_draft_pull_request` on Bitbucket. The author publishes it when it is
ready for review.

## Host

Resolve the host from `git remote get-url origin` before building the call; a
Bonliva repo may live on either.

**GitHub** (`gh`) — write the description to a file and pass `--body-file`, so
the body survives quoting intact:

```sh
gh pr create --draft --base <base> --head <branch> \
  --title "<title>" --body-file "$body_file" \
  --reviewer <login> --reviewer <login>
```

Never `--fill` / `--fill-first` / `--fill-verbose`: they build the body from
commit subjects, which is exactly the per-PR wording this template exists to
replace.

**Bitbucket** (MCP) — `mcp__bond-bitbucket__create_draft_pull_request` with
`workspace`, `repo_slug`, `title`, `description`, `source_branch`,
`destination_branch`, `reviewers`.

## Reviewers

Every PR is created with default reviewers attached. Resolve them in this order:

1. **`$HOME/.bond/pr-reviewers.json`** (managed by `/bond:set-reviewers`) — if it
   exists and its `reviewers` array is non-empty, use it. Entries carry a
   Bitbucket `uuid`; a `login` on the entry is the GitHub handle for the same
   person.
2. **The host's own defaults** — otherwise call
   `mcp__bond-bitbucket__get_effective_default_reviewers` with the workspace and
   repo slug on Bitbucket, or read the repo's configured reviewers /
   `CODEOWNERS` on GitHub.

Pass the resolved values as the `reviewers` array on
`create_draft_pull_request` / `create_pull_request`, or as repeated `--reviewer`
flags on `gh pr create`. Omit them if both sources yield nothing — an
unresolvable reviewer is not a reason to skip the PR. Never invent reviewers or
carry them over from an old PR.
