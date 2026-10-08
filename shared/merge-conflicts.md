# Shared merge-conflict procedure

> **Not an invocable command.** One procedure for bringing a branch up to date
> with its base and resolving what conflicts. `/bond:ship-pr`, `/bond:rebase`
> and `/bond:sweep-pr` run it; each states its inputs and what it adds after.

## Procedure: Resolve merge conflicts

**Inputs:**

- `BASE_BRANCH` — the branch to bring in.
- `STRATEGY` — `merge` (ship-pr's default) or `rebase` (asked for by name, as
  `/bond:rebase` is). **Choose the strategy** below may flip it.
- `FROM_BASE` — optional; the base the branch was cut from when it differs from
  `BASE_BRANCH` (a PR retargeted from `main` to `release/x`).
- `PLAN` — what this branch is for: the PR body, the plan file, the ticket.

### Detect

GitHub: `gh pr view <n> --json mergeable,mergeStateStatus` — `UNKNOWN` is still
computing, re-read it; still unknown, fall through to the trial merge.
Everywhere, and the only way on Bitbucket:

```sh
git fetch origin <BASE_BRANCH>
git merge --no-commit --no-ff origin/<BASE_BRANCH>
git diff --name-only --diff-filter=U        # the conflicted files
git merge --abort 2>/dev/null || true       # nothing to abort when already up to date
```

Clean and `STRATEGY=merge` ⇒ nothing to do, unless the branch is also `BEHIND`
a base that requires up-to-date branches — then merge for real and commit.
`STRATEGY=rebase` goes on regardless: being asked to rebase is asked for a
fresh base, not only for a conflict fix.

### Choose the strategy

- **merge** keeps review threads anchored to their commits, needs no
  force-push, and cannot flip the draft state. It becomes `rebase` only when the
  base requires linear history (`gh api
  repos/<OWNER>/<REPO_SLUG>/branches/<BASE_BRANCH>/protection` →
  `required_linear_history`).
- **rebase** becomes `merge` when the branch is **shared** — rewriting it
  breaks someone else's checkout:
  - a commit in `git log --format='%ae' origin/<BASE_BRANCH>..HEAD` by an
    author other than the active git user;
  - another open PR uses this branch as its base (a stacked PR —
    `gh pr list --base <branch>`; `get_pull_requests` filtered by
    destination on Bitbucket);
  - the branch is itself a long-lived one (`main`, `dev`, `release/*`,
    `hotfix/*`).

  Say which rule flipped it. With `FROM_BASE` set, a flip to `merge` would
  drag every `FROM_BASE` commit the new base lacks into the PR: hand back
  instead (*Needs you*: shared branch, retarget needs a rebase).

### Bring in the base

- `merge`: `git merge origin/<BASE_BRANCH>`.
- `rebase`: `git -c rerere.enabled=true rebase origin/<BASE_BRANCH>` — rerere
  replays a resolution when the next commit hits the same hunk.
- `rebase` with `FROM_BASE`: `git fetch origin <FROM_BASE>` first, then `git rebase --onto origin/<BASE_BRANCH>
  $(git merge-base HEAD origin/<FROM_BASE>)` — a plain rebase would drag every
  `FROM_BASE` commit the new base lacks into the PR.

A rebase stops once per conflicting commit: resolve that commit's hunks against
**that commit's** intent, `git add`, `git rebase --continue`, repeat.

### Resolve by file kind

Never take `--ours` or `--theirs` wholesale on code. During a rebase the sides
swap: `--ours` is the base, `--theirs` is the commit being replayed.

| Kind | Resolution |
| --- | --- |
| generated (OpenAPI/GraphQL clients, `*.gen.*`, ORM clients) | take the base side, then regenerate from the merged sources — never hand-merge generated code |
| lockfile | take the base side, then re-run install so this branch's dependency changes are re-applied |
| migrations | keep both sides' migrations; when their order or numbering collides, renumber or re-timestamp **this branch's** migration, never the base's, and apply both to a fresh DB |
| i18n / keyed JSON | union of keys; a key both changed keeps the base value unless this PR changed it on purpose |
| changelog / version | base version, plus this branch's entries |
| code | read both intents — the base commit behind the hunk (`git log -p origin/<BASE_BRANCH> -- <file>`) and `PLAN` — and write the version that keeps both |
| deleted or moved on base, modified here | port this branch's change to where the code now lives |

### Hand back instead of guessing

When both sides rewrote the same logic differently and `PLAN` does not say which
wins, or the base deleted what this branch builds on: `git merge --abort` /
`git rebase --abort`, and report the files and both commits under *Needs you*.
That is a stop — the branch is left exactly as it was.

### Prove it

Before committing (merge) or pushing (rebase):

1. No markers left — `git diff --check` and a search for `<<<<<<<` / `>>>>>>>`
   in the conflicted files.
2. Base moved generated code or the lockfile ⇒ regenerate / install, even
   without a conflict there.
3. Typecheck and build, then the tests covering the resolved files and the
   branch's own changed files — each command through the `bond:test-runner`
   agent. A rebase can break a commit with no conflict at all, so run them
   after a clean rebase too.
4. A failure that is also red on `origin/<BASE_BRANCH>` is the base's: note
   it, do not fix it here. Otherwise fix it in a separate commit.

### Push

Apply `bond:authorship-conventions` first (right `gh` account, `git ls-remote
origin` works).

- `merge`: commit with git's own `Merge …` subject (the commit hook passes it),
  then `git push`.
- `rebase`: `git push --force-with-lease=<branch>:<remote sha read before the
  rebase> --force-if-includes origin <branch>` — never bare `--force`. Rejected
  ⇒ someone pushed meanwhile: stop, do not re-fetch and retry over them. Then
  re-check the PR's draft state.

Never `[skip ci]`. A second conflict on the same base head means the resolution
was wrong — stop.
