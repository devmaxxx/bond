# Shared PR template

> **Not an invocable command.** Single source of truth for the title and
> description of every pull request bond opens. Used by `/bond:open-pr`, by the Ship + PR step of
> `/bond:implement`, and by the `pr-template` skill. Edit the
> format here and every PR path picks it up — do not copy this format into
> individual commands.

The shape below is not a suggestion: `hooks/check-pr.mjs` blocks a create call
whose description is missing `## Summary` or `## Test plan`, one that carries a
ticket id with no `## Jira` section, and — where the profile resolves `DRAFT` —
one that is not a draft.

## Inputs

Set these before building the title/description:

- `<branch>` — current source branch (`git rev-parse --abbrev-ref HEAD`).
- `<base>` — destination branch the PR targets.
- `<commits>` — commits not yet in the base: `git log origin/<base>..<branch> --oneline`.
- `<tickets>` — Jira ticket IDs extracted from `<branch>`: a configured project
  key (`ERP`, `CRMDEV`) followed by `-` and digits. Not any `[A-Z]+-\d+` — that
  shape also spells `UTF-8` and `SHA-256`. Set `BOND_JIRA_PROJECTS` (comma- or
  space-separated) to replace the list when a project is added. Empty whenever
  the project profile resolves `TRACKER=none`, which is every repo unless
  `.bond/project.json` says `jira`.

## Title

`<TICKET_IDs>: <short description>` — `ERP-123: Tidy the export`, `#164: Index full ADR bodies`.

The description is a plain sentence that says what the PR does as a whole, never a
Conventional Commits subject: no `feat(scope)!:` prefix, even when the PR holds one
commit. The squash merge writes the Conventional subject; the title is what a person
reads in a PR list. `hooks/check-pr.mjs` blocks a create call whose title starts with
`<type>(<scope>)!:`. A PR that also closes or advances an issue it does not lead with
names it in the summary.

If no ticket IDs were found, drop the prefix and use just the description.

**`prTitle: conventional`.** A repo whose squash merge takes the PR title as the commit
subject and checks it in CI states `"prTitle": "conventional"` in `.bond/project.json`. There
the title is the Conventional subject of the work — the oldest conventional subject of the
branch — with no ticket prefix, and `hooks/check-pr.mjs` demands that shape instead of
refusing it. The issue goes into the body (`Closes #<n>`).

## Description

```markdown
## Summary

<1-3 bullet points from the commit messages>

## Jira

<For each ticket: - ERP-123: https://<site>.atlassian.net/browse/ERP-123>

## Test plan

- [ ] <golden path>
- [ ] <edge case>
```

Omit the `## Jira` section entirely if `<tickets>` is empty.

When the branch's plan file (`docs/plans/<KEY>.md` or the branch slug) has a
`## Coverage` section, the **Test plan** carries one item per acceptance
criterion, led by its id — `- [ ] AC2: wrong password returns 401
(auth.test.ts › rejects a wrong password)` — and every `manual:` criterion as
an item to check by hand. The description
ends at the test plan: no "generated with" footer, no session link, no AI
co-author line — the PR is owned by the human who opens it (`authorship-conventions`).

## Drafts

When the project profile resolves `DRAFT` — `"draft": true` in
`.bond/project.json` — the PR is created as a **draft** (`--draft` on
`gh pr create`). The author publishes it when it is ready for review.

Otherwise open it ready for review: no `--draft`.

## Host

GitHub (`gh`). Write the description to a file and pass `--body-file`, so the
body survives quoting intact (`--draft` only where the profile resolves `DRAFT`):

```sh
gh pr create --base <base> --head <branch> \
  --title "<title>" --body-file "$body_file" \
  --reviewer <login> --reviewer <login>
```

Never `--fill` / `--fill-first` / `--fill-verbose`: they build the body from
commit subjects, which is exactly the per-PR wording this template exists to
replace.

## Reviewers

Resolve reviewers in this order:

1. **The project profile** — `shared/project-profile.md`, the `REVIEWERS` field:
   the repo's own `reviewers` in `.bond/project.json`. An entry may be a plain
   GitHub login.
2. **The host's own defaults** — the repo's configured reviewers or
   `CODEOWNERS` on GitHub.

Pass the resolved values as repeated `--reviewer` flags on `gh pr create`. Omit
them if both sources yield nothing — an unresolvable reviewer is not a reason to
skip the PR. Never invent reviewers or carry them over from an old PR.
