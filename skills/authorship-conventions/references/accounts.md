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

**Check before every write** — a push, a PR creation, any `gh api` write:

```bash
gh auth status --active --hostname github.com
git remote -v
```

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

```bash
gh auth switch --hostname github.com --user maxSynEfisco   # or devmaxxx
gh auth status --hostname github.com                        # confirm
```

The switch is **global to this machine**, so it survives into other sessions —
and another session may have moved it since. Check again rather than assuming.

Note an SSH remote (`git@github.com:...`) authenticates with the SSH key, not
the `gh` token, so a wrong active account does not by itself mean a wrong push —
but every `gh` command in the same task still uses it.

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
