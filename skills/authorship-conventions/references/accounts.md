# Which account pushes

Two accounts are authenticated in `gh` on github.com: **maxSynEfisco** (Bonliva
work) and **devmaxxx** (personal). The active one decides which token pushes.
A commit pushed or a PR opened from the wrong account is public, attributed to
the wrong identity, and undone only by force-pushing or closing and reopening
the PR.

**Two different things — do not confuse them:**

| | What it is | How it changes |
|---|---|---|
| `gh` account | The token that pushes / opens PRs / calls the API | `gh auth switch` |
| git identity | The `Author:` name and email on commits | `git config user.name` / `user.email` |

A `gh auth switch` does **not** change `git config user.name/user.email`, and
setting a git identity does **not** change which token pushes. Read the identity
with `git config user.name` rather than assuming it matches the account name.

**Pick the account per command** — a push, a PR creation, any `gh api` write —
with the token of the account the rule below names:

```bash
GH_TOKEN=$(gh auth token -u devmaxxx) gh pr create …
```

`hooks/gh-account-guard.mjs` enforces this where `BOND_GH_ACCOUNTS` maps repo
owners to accounts (`devmaxxx=devmaxxx,bonliva=maxSynEfisco`): a push or `gh`
write that would go out as the wrong account is blocked with the command that
would not.

**The rule.** Bonliva projects use **maxSynEfisco**; everything else uses
**devmaxxx**. Decide from the repo in front of you, never from memory. First
match wins:

1. **GitHub remote owner is `devmaxxx`** → **devmaxxx**. The token must match the
   repo owner, so this beats every other signal, manifest included.
2. **`.bonliva-dev/project.json` at the repo root**, or a remote pointing at
   `bitbucket.org/bonliva/...` → **maxSynEfisco**.
3. **Anything else** — a remote owned by another org, no remote, a bare
   directory → **ask once which account this repo uses. Do not guess.**

Signals disagreeing (a Bonliva manifest in a repo whose GitHub remote is
`devmaxxx/...`) is rule 1: push with the account that owns the remote.

Do not `gh auth switch`: the active account is **global to this machine**, so a
switch moves every other session's account too, and another session may move it
back under you.

An SSH remote (`git@github.com:...`) authenticates with the SSH key, not the
`gh` token. When the key belongs to the other account (`BOND_GH_SSH_ACCOUNT`),
push over HTTPS with the right token, then fetch — a push to a URL leaves
`origin/<branch>` stale:

```bash
GH_TOKEN=$(gh auth token -u devmaxxx) git -c credential.helper= \
  -c 'credential.helper=!gh auth git-credential' \
  push https://github.com/devmaxxx/<repo>.git <branch> && git fetch origin <branch>
```

Change the git identity only when the commits themselves should carry a
different name. It is per-repo:

```bash
git config --local user.name "<name>"
git config --local user.email "<email>"
```

The machine's global identity is already the Bonliva one, so Bonliva repos need
nothing. A personal repo that should not carry the work address needs its own
local identity: ask for the name and email once, and never invent one. This file
is published in a public repo, so the addresses themselves stay out of it.
