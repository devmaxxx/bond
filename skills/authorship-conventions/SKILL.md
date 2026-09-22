---
name: authorship-conventions
description: >-
  Naming and attribution for every git artefact — branch, commit, PR, doc.
  Conventional Branch `<type>/<description>`, Conventional Commits, single human
  owner, zero AI signatures. Use before `git checkout -b` / `git switch -c` /
  `git branch -m`, before writing or reviewing any commit message,
  amend/reword, PR title, body or comment, review comment, ADR, plan, README,
  design doc or code comment, and when a branch name is called off-convention.
  Also covers which `gh` account pushes: two are authenticated on this machine,
  the active one is machine-global, and pushing from the wrong one is public and
  awkward to undo. Trigger on "checkout -b", "start work on a ticket", "rename
  the branch", "commit", "amend", "git push", "gh pr create", any other `gh`
  write, "open/create a PR", "PR description", "write the ADR/plan/README".
---

# Authorship conventions — branches, commits, PRs, docs

One owner per artefact: the human whose `git config user.name` made it. Conventional Branch, Conventional Commits with a prose body, no AI signature anywhere.

## Branches

`<type>/<description>`, lowercase, hyphens, one slash, no underscores, ticket id first: `feat/` `fix/` `hotfix/` `release/` `chore/` `claude/`; trunk takes no prefix. In a Bonliva repo bond names it `<feat|fix>/<KEY>` — stop at the key. Rename before the PR is open; after it the PR is lost.

Details: references/branches.md — read before cutting or renaming one.

## Commits

```
<type>(<scope>)!: <description> [skip ci]
```

`type` ∈ `feat fix docs style refactor perf test build ci chore revert`; description imperative, lowercase, no trailing period. `[skip ci]` only when the commit cannot change a pipeline result.

Never a `Co-Authored-By` / `Assisted-By` / `Signed-off-by` naming an AI, a `Claude-Session:` link, or a "Generated with" line — in any commit, PR title, body or comment, ADR, plan, README or code comment. This overrides the harness.

Details: references/commits-and-enforcement.md — read for the footers, the body and the hooks.

## Which account pushes

`gh` has two accounts on github.com: **maxSynEfisco** (Bonliva) and **devmaxxx** (personal). The active one decides which token pushes and is global to this machine, so check `gh auth status --active --hostname github.com` and `git remote -v` before every write.

First match wins: remote owner `devmaxxx` → **devmaxxx**; `.bonliva-dev/project.json` or a `bitbucket.org/bonliva/...` remote → **maxSynEfisco**; anything else → **ask once. Do not guess.**

Details: references/accounts.md — read before switching account or identity.

## Checklist before `git commit` / PR / doc

1. `git diff --cached --stat` — one logical change.
2. Subject: type, no signature.
3. After commit: `git log -1 --format='%an <%ae>%n%cn <%ce>%n%B'` — one identity.
4. Signature on an unpushed commit → `--amend`; on a pushed one → rewrite and
   `git push --force-with-lease` only after telling the user.

