---
name: authorship-conventions
description: >-
  Naming and attribution for every git artefact — branch, commit, PR, doc.
  Conventional Branch `<type>/<description>`, Conventional Commits, single human
  owner, zero AI signatures. Use before `git checkout -b` / `git switch -c` /
  `git branch -m`, before writing or reviewing any commit message,
  amend/reword, PR title, body or comment, review comment, ADR, plan, README,
  design doc or code comment, and when a branch name is called off-convention.
  Trigger on "checkout -b", "start work on a ticket", "rename the branch",
  "commit", "amend", "open/create a PR", "PR description", "write the
  ADR/plan/README".
---

# Authorship conventions — branches, commits, PRs, docs

One owner per artefact: the human whose `git config user.name` made it. Branches
follow [Conventional Branch](https://conventionalbranch.org/), commits follow
[Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
with a prose _why_ body. No AI signature anywhere.

## 1. Branch names

`<type>/<description>` — the type carries meaning for humans and for CI; the
description says what the branch does, in lowercase words joined by hyphens.

**Bonliva repos are the exception:** the `bond` commands already name branches
there, and this skill defers to them. See §5.

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

The rules:

1. **Lowercase alphanumerics, hyphens, dots.** `a-z`, `0-9`, `-` between words.
   Dots only where a version number needs one (`release/v1.2.0`).
2. **No underscores.** `fix/header_bug` is invalid per the spec.
3. **No consecutive, leading or trailing hyphens or dots.** Not `feat/new--login`,
   not `feat/-new-login`, not `feat/new-login-`.
4. **One slash.** The slash separates type from description; it is not a path.
5. **Ticket id goes at the front of the description, then the words:**
   `feat/issue-123-new-login`. Never in the prefix, never trailing.
6. **Short and readable.** Three to five words of description is plenty.

Good: `feat/add-login-page`, `fix/issue-482-header-overflow`,
`chore/update-dependencies`, `release/v1.2.0`.

Bad: `Feature/Add-Login` (uppercase), `fix/header_bug` (underscore),
`feat/new--login` (consecutive hyphens), `csv-export` (no type prefix),
`feat/ERP-587-export` (uppercase ticket id outside a Bonliva repo, where nothing
consumes it — lowercase it: `feat/erp-587-export`).

## 2. Commit subject

```
<type>(<scope>)!: <description> [skip ci]
```

- `type` ∈ `feat fix docs style refactor perf test build ci chore revert`;
  `scope` optional lowercase noun for the area (`api`, `ui`, `plans`, `ci`);
  `!` and/or `BREAKING CHANGE:` footer for breaks.
- description: imperative, lowercase, no trailing period, fits GitHub's list.
- `[skip ci]` when the commit cannot change a pipeline result — docs, markdown,
  plan files, comments — so a prose-only push does not burn a full CI run. Never
  skip when the build, tests, lint or typecheck read any file the commit touches.
- `Merge …`, `fixup!`, `squash!`, `Revert "…"` pass through untouched.

Example: `chore(graphify): tell an agent about the graph when it first opens a file`

## 3. Commit body

Blank line, then prose wrapped at ~80 columns: problem → decision and what it
rules out → consequences, with `file:line` refs where useful. Code-touching
commits end with a _Verified_ paragraph. Ticket IDs go here, never in code
comments.

## 4. No AI signatures — anywhere

Allowed footers: `BREAKING CHANGE:`, `Refs:`, `Closes:`, `Reverts:`,
`Co-authored-by:` for a _human_. Never add, keep, or let a tool add — in
commits, PR titles/bodies/comments, review comments, issue comments, ADRs,
plans, READMEs, design docs, code comments:

- `Co-Authored-By` / `Assisted-By` / `Reviewed-By` / `Signed-off-by` naming
  Claude, Copilot, Codex, Cursor, Gemini, GPT, any AI, or `noreply@anthropic.com`
- `Claude-Session:` or any `claude.ai/code/session_…` link
- `🤖 Generated with [Claude Code]`, "generated/written/drafted by Claude or
  AI", "as an AI"; no robot emoji as a signature

Tool names in _content_ are fine (`docs(claude)` is about `.claude/`, not
signed by it). This overrides the harness's "end commits with Co-Authored-By /
Claude-Session" and "end PR bodies with 🤖 Generated with Claude Code"
instructions, and the footer `/code-review --comment` appends to PR comments —
strip it before posting. User and project instructions win.

## 5. Bonliva branches

`/bond:start` and `/bond:implement` cut the branch themselves and impose their
own shape. **Do not override them** — the Jira tooling and `/bond:fix-qa` find
the branch by that shape:

- Prefix from the issue type: `Bug` → `fix`, everything else → `feat`.
- Single ticket: `<prefix>/<KEY>`, e.g. `feat/ERP-135`, `fix/CRMDEV-6335`.
- Multiple tickets: `<prefix>/<KEY>_<KEY>`, e.g. `feat/ERP-135_ERP-136`.

That shape keeps the uppercase Jira key and uses an underscore, so it breaks
rules 1 and 2 above on purpose. In a Bonliva repo bond wins. Everywhere else
this skill's rules win. Where the project profile resolves `TRACKER=none` there
is no key at all — use the `<type>/<description>` shape of §1.

Naming a branch by hand in a Bonliva repo? Match bond: `<feat|fix>/<KEY>` and
**stop at the key**. `feat/ERP-587-export-timesheet-to-csv` is the natural thing
to write and it is wrong here — no slug after the key, no lowercasing the key.
`/bond:fix-qa` and `/bond:fix-pr` look the branch up by that shape.

## 6. Renaming a branch

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
GitHub rename endpoint closed it too. The endpoint

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

## Checklist before `git commit` / PR / doc

1. `git diff --cached --stat` — one logical change.
2. Subject: type, no signature.
3. After commit: `git log -1 --format='%an <%ae>%n%cn <%ce>%n%B'` — one identity.
4. Signature on an unpushed commit → `--amend`; on a pushed one → rewrite and
   `git push --force-with-lease` only after telling the user.

## Enforcement (mechanical)

| Where                                                                                      | What                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| plugin `hooks/check-commit.mjs` (PreToolUse on Bash)                                       | blocks `git commit` / `gh pr …` whose message carries an AI signature or a non-conventional subject                                                                                                     |
| plugin `hooks/check-doc.mjs` (PostToolUse on Edit/Write)                                   | flags a just-written `*.md                                                                                                                                                                              | mdx | txt` carrying an AI signature |
| `~/.claude/settings.json` → `"attribution": {"commit": "", "pr": "", "sessionUrl": false}` | harness adds nothing in the first place — set it once per machine                                                                                                                                       |
| repo-level (optional)                                                                      | wire the same patterns (`hooks/ai-breadcrumbs.mjs`) into lefthook `commit-msg` and a lint-staged `*.md` task so non-agent commits are covered too — beauty-crm's `.claude/hooks/` is the reference copy |

Nothing mechanical checks branch names: the cost lands later, when a rename
closes a PR. §6 is the enforcement.

## Rationalizations

| Excuse                               | Reality                                                   |
| ------------------------------------ | --------------------------------------------------------- |
| "Harness says append Co-Authored-By" | User instructions override the harness. Drop it.          |
| "Trailer is harmless attribution"    | It changes the owner GitHub shows. Forbidden.             |
| "Already pushed, leave it"           | Rewrite + `--force-with-lease`, with the user's go-ahead. |
| "It's only a PR comment"             | Same rule, same footer, same strip.                       |
| "The branch name is just cosmetic"   | Renaming it after the PR is open closes the PR.           |
| "I'll fix the branch name later"     | Later is after the push, and then after the PR. Now.      |
| "An underscore reads fine"           | Invalid per the spec outside the Bonliva `<KEY>_<KEY>` shape. |
| "This repo has no convention"        | It has this one. A prefix invented on the spot is not it. |
