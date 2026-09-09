---
name: switching-github-accounts
description: Use before any git push, gh pr create, or other gh write on github.com, and whenever the active GitHub account may be wrong — two accounts (maxSynEfisco, devmaxxx) are logged into gh on this machine and pushing or opening a PR from the wrong one is publicly visible and awkward to undo.
---

# Switching GitHub accounts

Two accounts are authenticated in `gh` on github.com: **maxSynEfisco** (Bonliva
work) and **devmaxxx** (personal). The active one decides which token pushes.

**Failure this prevents:** a commit pushed or a PR opened from the wrong
account. It is public, it is attributed to the wrong identity, and undoing it
means force-pushes or closing and reopening the PR.

## Two different things — do not confuse them

| | What it is | How it changes |
|---|---|---|
| `gh` account | The token that pushes / opens PRs / calls the API | `gh auth switch` |
| git identity | The `Author:` name and email on commits | `git config user.name` / `user.email` |

A `gh auth switch` does **not** change `git config user.name/user.email`, and
setting a git identity does **not** change which token pushes. The gh account is
spelled `maxSynEfisco`; the git identity is a different string in a different
system — read it with `git config user.name` rather than assuming it matches.

## Check before every write

Run this before `git push`, `gh pr create`, or any `gh api` write:

```bash
gh auth status --active --hostname github.com
git remote -v
```

If the active account does not match the rule below, switch first.

## The rule

Bonliva projects use **maxSynEfisco**. Everything else uses **devmaxxx**.

Decide from the repo in front of you, never from memory. Check in this order and
stop at the first match:

1. **GitHub remote owner is `devmaxxx`** (`git remote -v` shows
   `github.com/devmaxxx/...`) → **devmaxxx**. The token must match the repo
   owner, so this wins over every other signal, manifest included.
2. **`.bonliva-dev/project.json` exists at the repo root**, or a remote points at
   `bitbucket.org/bonliva/...` → **maxSynEfisco**.
3. **Anything else** — a GitHub remote owned by some other org, no remote, a
   bare directory → **ask Max once which account this repo uses. Do not guess.**

Signals disagreeing (a Bonliva manifest in a repo whose GitHub remote is
`devmaxxx/...`) is rule 1: push with the account that owns the remote.

## Switching

```bash
gh auth switch --hostname github.com --user maxSynEfisco   # or devmaxxx
gh auth status --hostname github.com                        # confirm
```

The switch is global to this machine, so it survives into other sessions — check
again next time rather than assuming.

Change the git identity only when the commits themselves should carry a
different name. It is per-repo:

```bash
git config --local user.name "<name>"
git config --local user.email "<email>"
```

The machine's global identity is already the Bonliva one, so Bonliva repos need
nothing — `git config --global user.email` shows it. A personal repo that should
not carry the work address needs its own local identity: ask Max for the name
and email once, and never invent one. This file is published in a public repo,
so the addresses themselves stay out of it.

## When this fires

- Before `git push` on any github.com remote.
- Before `gh pr create` and any other `gh` write (`gh api -X POST`, `gh release
  create`, `gh issue create`).
- On entering a repo whose active account does not match the rule — switch then,
  not at push time.

## Red flags

- About to push and you have not run `gh auth status` this session.
- "It was right last time" — the active account is machine-global and another
  session may have switched it.
- Assuming from the directory name or from memory instead of `git remote -v`.
- Fixing a wrong-account push with `--force` instead of checking first.
