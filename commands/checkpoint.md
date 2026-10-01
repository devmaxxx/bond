---
description: Save, compare against, list or restore named snapshots of the working tree — without committing or touching the tree
---

# /bond:checkpoint

A named snapshot of the work in progress, so a long `/bond:implement` run or a risky
refactor has somewhere to come back to. A checkpoint is a stash object stored in a
dedicated ref: it records tracked and staged changes on top of `HEAD`, and creating one
leaves the working tree, the index and the branch exactly as they were. Nothing is
committed and nothing is pushed.

## Arguments

`$ARGUMENTS` — `<action> [name]`:

- `create <name>` — snapshot now. Name defaults to `HH-MM`; a name must be a valid ref component (no `:`, spaces, `..`, `~`, `^`).
- `verify <name>` — what changed since that snapshot, and do the tests still pass.
- `list` — every checkpoint on this branch, newest first.
- `restore <name>` — bring that snapshot back (asks first; see below).
- `clear` — drop all but the 5 newest.

Examples: `/bond:checkpoint create before-refactor`, `/bond:checkpoint verify before-refactor`.

## Storage

Refs under `refs/bond-checkpoints/<branch>/<name>`, where `<branch>` has `/` replaced by
`-` (`detached` on a detached HEAD). Local to this clone, invisible to `git push` and `git stash list`.

## create

```bash
sha=$(git stash create "bond-checkpoint: <name>")
# clean tree ⇒ a commit of HEAD's tree, so the ref still carries its own date
sha=${sha:-$(git commit-tree "HEAD^{tree}" -p HEAD -m "bond-checkpoint: <name>")}
git update-ref "refs/bond-checkpoints/<branch>/<name>" "$sha"
```

`git stash create` does not include untracked files. If `git status --porcelain` shows
`??` entries, say which ones the checkpoint leaves out — do not `git add` them on the
user's behalf. An existing name is overwritten only after saying so.

Report: `checkpoint <name> → <short sha> (<n> files changed vs HEAD, <m> untracked left out)`.

## verify

1. `git diff --stat refs/bond-checkpoints/<branch>/<name>` — the working tree against
   the snapshot.
2. Run the test suite through the `TestRunner` agent.
3. Report: files changed since the checkpoint, tests pass/fail, and any test that names a
   file in that diff.

## list

```bash
git for-each-ref --sort=-creatordate \
  --format='%(refname:lstrip=3) %(objectname:short) %(creatordate:relative)' \
  "refs/bond-checkpoints/<branch>/"
```

## restore

Restoring overwrites the working tree, so:

1. Run **create** with the name `before-restore-<HH-MM>` first, always — that is the undo.
2. Show `git diff --stat` between the tree and the target, and ask before going on.
3. From the repo root, `git restore --source=<sha> --worktree -- .` restores the snapshot's tracked files without touching the index; tell the user
   that files created after the checkpoint stay in place and list them.

Never `git reset --hard`, `git clean` or `git stash pop` here.

## clear

Keep the 5 newest refs for this branch, `git update-ref -d` the rest, and list what went.

Adapted from the checkpoint command of everything-claude-code (Affaan Mustafa, MIT).
