---
name: naming-git-branches
description: Use when creating a branch (git checkout -b, git switch -c), starting work on a ticket, before opening a PR, or when a branch name is called off-convention — covers the Conventional Branch prefixes, the ticket-id rule, and the rename trap that closes an open PR.
---

# Naming git branches

Branches on this machine follow the [Conventional Branch](https://conventionalbranch.org/)
spec: `<type>/<description>`. The type carries meaning for humans and for CI;
the description says what the branch does, in lowercase words joined by hyphens.

**Bonliva repos are the exception:** the `bond` plugin already names branches
there, and this skill defers to it. See "Bonliva" below.

## Prefixes

The spec's own list, with when to reach for each:

| Prefix | Use it for |
|---|---|
| `feat/` | A new feature or capability. The spec also allows `feature/`; write `feat/`. |
| `fix/` | A bug fix on the normal path. The spec also allows `bugfix/`; write `fix/`. |
| `hotfix/` | An urgent fix going out ahead of the normal cycle. |
| `release/` | Release preparation — `release/v1.2.0`. Dots are allowed here. |
| `chore/` | Non-code work: dependencies, tooling, config, housekeeping. |
| `claude/` | Cut by Claude Code itself. The harness writes these; don't hand-pick one. |
| `ai/`, `codex/`, `copilot/`, `cursor/` | The same, for other agents. |

`main`, `master` and `develop` are trunk branches and take no prefix.

**Local deviations already in use** — keep them, they are deliberate, but do not
invent new ones: `docs/` for documentation-only work, and in the repograph repo
`exp/`, `bench/` and `verify/` for throwaway experiment, benchmark and
verification branches that are never meant to be merged as features.

## The rules

1. **Lowercase alphanumerics, hyphens, dots.** `a-z`, `0-9`, `-` between words.
   Dots only where a version number needs one (`release/v1.2.0`).
2. **No underscores.** `fix/header_bug` is invalid per the spec.
3. **No consecutive, leading or trailing hyphens or dots.** Not `feat/new--login`,
   not `feat/-new-login`, not `feat/new-login-`.
4. **One slash.** The slash separates type from description; it is not a path.
5. **Ticket id goes at the front of the description, then the words:**
   `feat/issue-123-new-login`. Never in the prefix, never trailing.
6. **Short and readable.** Three to five words of description is plenty.

## Examples

Good:

- `feat/add-login-page` — type, then what it does.
- `fix/issue-482-header-overflow` — ticket id first in the description.
- `chore/update-dependencies` — non-code work under `chore/`.
- `release/v1.2.0` — the one place a dot belongs.

Bad:

- `Feature/Add-Login` — uppercase in both halves.
- `fix/header_bug` — underscore; the spec allows hyphens only.
- `feat/new--login` — consecutive hyphens.
- `csv-export` — no type prefix at all; nothing says what kind of branch it is.
- `feat/ERP-587-export` — uppercase ticket id outside a Bonliva repo, where
  nothing consumes it. Lowercase it: `feat/erp-587-export`.

## Bonliva

`/bond:start` and `/bond:implement` cut the branch themselves and impose their
own shape. **Do not override them** — the Jira tooling and `/bond:fix-qa` find
the branch by that shape:

- Prefix from the issue type: `Bug` → `fix`, everything else → `feat`.
- Single ticket: `<prefix>/<KEY>`, e.g. `feat/ERP-135`, `fix/CRMDEV-6335`.
- Multiple tickets: `<prefix>/<KEY>_<KEY>`, e.g. `feat/ERP-135_ERP-136`.

That shape keeps the uppercase Jira key and uses an underscore, so it breaks
rules 1 and 2 above on purpose. In a Bonliva repo bond wins. Everywhere else
this skill's rules win.

Naming a branch by hand in a Bonliva repo? Match bond: `<feat|fix>/<KEY>` and
**stop at the key**. `feat/ERP-587-export-timesheet-to-csv` is the natural thing
to write and it is wrong here — no slug after the key, no lowercasing the key.
`/bond:fix-qa` and `/bond:fix-pr` look the branch up by that shape.

## Renaming a branch

Cheap before the push, expensive after, and **destructive once a PR is open.**

Not pushed yet:

```bash
git branch -m feat/new-name
```

Pushed, no PR open yet:

```bash
git branch -m feat/new-name
git push origin -u feat/new-name
git push origin --delete old-name
```

**Pushed AND a PR is already open — read this first.** Either route loses the
PR: deleting the old remote branch closes the PR that points at it, and the
GitHub rename endpoint closed it too. The GitHub rename
endpoint

```bash
gh api -X POST repos/{owner}/{repo}/branches/{branch}/rename -f new_name=feat/new-name
```

renamed the branch but left the PR pointing at the old name, and **the PR ended
up CLOSED.** Assume the PR does not survive. So:

1. **Rename before opening the PR.** This is the whole fix. Get the name right,
   or fix it, while there is no PR to lose.
2. If a PR is already open and the name must change, expect to recreate it:
   rename, then reopen the PR if GitHub lets you, and otherwise open a fresh PR
   from the new branch. Copy the description and re-request reviewers; review
   comments on the old PR do not move.
3. That endpoint returns **403** unless the *active* `gh` account has push
   access on the repo. Check with the `switching-github-accounts` skill before
   calling it — a 403 here usually means the wrong account is active, not a
   missing permission.

## When this fires

- Any `git checkout -b` / `git switch -c` / `git branch -m`.
- Starting work on a ticket, before the branch exists.
- Before `gh pr create` — last cheap moment to fix a name.
- When anyone says a branch name is off-convention.

## Red flags

- Reaching for `gh api ... /rename` while a PR is open on that branch.
- An underscore or a capital letter in a branch name outside a Bonliva repo.
- A branch with no prefix, or a prefix invented on the spot.
- A Jira key in a branch name in a repo that has no Jira.
- Renaming after the PR is open "because it's just cosmetic".
