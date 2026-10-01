---
description: Rebase the current branch or a PR onto a fresh base — resolve conflicts keeping both intents, re-run typecheck and affected tests, push with --force-with-lease
---

# /bond:rebase

Brings a branch up to date with its base and leaves it pushed and green
locally. The conflict work itself is **Resolve merge conflicts** in
`${CLAUDE_PLUGIN_ROOT}/shared/merge-conflicts.md`; this command picks the
branch and the base, runs it with `STRATEGY=rebase`, and pushes.

**Standing instructions win.** "Don't push", "merge instead" given earlier in
the session override the matching step here.

## Usage

```
/bond:rebase [<PR|branch>…] [base] [--from <old-base>] [--merge] [--no-push]
```

Examples: `/bond:rebase`, `/bond:rebase main`, `/bond:rebase 381`,
`/bond:rebase https://github.com/o/r/pull/258 https://github.com/o/r/pull/278 main`,
`/bond:rebase release/5.18.3 --from main`.

## Arguments

- **target** — a PR number or URL (either host) or a branch name; several are
  run one after another. None ⇒ the current branch.
- **base** — a branch to rebase onto. With a PR or branch target given, a
  trailing token that is an existing branch on `origin` is the base. A lone
  branch token is the target when it is the current branch or a PR head, or
  when `--from` is absent and it is a feature branch (not `main`, `dev`,
  `master`, `release/*`, `hotfix/*`); with `--from` it is the base.

### Flags

| Flag | Effect |
| --- | --- |
| `--from <old-base>` | The branch was cut from `<old-base>` and moves to `base` (retarget): only this branch's own commits are replayed. Becomes `FROM_BASE`. |
| `--merge` | Merge the base in instead of rebasing — no force-push. |
| `--no-push` | Stop after **Prove it**; leave the result local. |

## Steps

### 1. Resolve the target

1. Resolve the project profile (`${CLAUDE_PLUGIN_ROOT}/shared/project-profile.md`).
2. A PR ⇒ **Resolve PR coordinates**, then one `bond:PRStatus` read for head,
   base, state and draft. `MERGED` / `CLOSED` / `DECLINED` ⇒ skip it.
3. **Base**, first match: the `base` argument; the PR's base; the profile's
   `BASE_BRANCH`. On the current branch with no PR and no argument, the
   profile's.
4. The base is the branch itself ⇒ stop: nothing to rebase onto.

### 2. Get a checkout

- **Current branch** — work in place. `git status --porcelain` must be clean:
  dirty ⇒ stop and say so; never auto-stash, the stash is the user's work.
  Local commits not yet on `origin` are this user's and ride along — say so in
  the report.
- **Another PR or branch** — already checked out here or in a kept worktree ⇒
  work there, if no other session is using it. Otherwise **Set up the branch**
  from `${CLAUDE_PLUGIN_ROOT}/shared/implement-flow.md` with `BRANCH_SOURCE=existing`,
  `WORKTREE_SUFFIX=-rebase`. Never switch branches in the user's main checkout.
- Local **diverged** from `origin/<branch>` (not merely ahead) in a checkout
  this run did not create ⇒ stop: that is work this run did not write.

`git fetch origin <branch>`, then record `git rev-parse origin/<branch>` — the
lease for the push.

### 3. Rebase

Run **Resolve merge conflicts** with `BASE_BRANCH`, `STRATEGY=rebase` (`merge`
under `--merge`), `FROM_BASE` from `--from`, and `PLAN` = the PR body, the plan
file (`docs/plans/<KEY>.md` or the branch slug) and, under `TRACKER=jira`, the
ticket. It may flip to `merge` for a shared branch; report why.

After `git fetch origin <BASE_BRANCH>`, already up to date
(`git merge-base --is-ancestor origin/<BASE_BRANCH> HEAD`) and no `--from` ⇒ say so, skip to the report. A hand-back ⇒ the branch is left
as it was; report it and go to the next target.

### 4. Verify

The procedure's **Prove it** runs typecheck and the affected tests through
`bond:TestRunner`. Find the commands from the repo, not by guess:
`package.json` scripts (`typecheck`, `lint`, `test` with a path filter), the
workspace tool for a monorepo (`nx affected`, `turbo --filter`), `cargo check`,
`go vet ./...`. No typecheck script in a TypeScript repo ⇒ `npx tsc --noEmit -p
<the tsconfig of each touched package>`.

A test that fails after the rebase and passes on the old head, with no conflict
in its files, means the base changed something it depends on — fix it in a
separate commit, not by amending a replayed one.

The user asked to "test locally" or "check in browser" ⇒ also run
`/bond:ship-pr`'s step 1 (Verify) on the rebased head, without marking ready.

### 5. Push

Skip under `--no-push`. Otherwise the procedure's **Push**: the lease recorded
in step 2, never bare `--force`. A branch with no upstream ⇒ `git push -u
origin <branch>`; there is nothing to lease against.

Confirm `git ls-remote origin <branch>` equals local `HEAD`, then — in a
worktree this run created — **Teardown** from the shared flow.

### 6. Report

Per target, one line each: branch, `old base sha → new base sha`, strategy (and
why it flipped), conflicted files with how each was resolved, typecheck/test
verdict, pushed sha or *not pushed*, PR URL. Then *Needs you*: hand-backs,
base-red failures, local commits that rode along.

## Do NOT

- Do not `git push --force`, and do not retry a rejected `--force-with-lease`
  after re-fetching — that overwrites whoever pushed.
- Do not rebase a shared branch (another author's commits, a stacked PR on
  top, a long-lived branch) — merge instead.
- Do not stash, reset or discard the user's uncommitted work.
- Do not take `--ours`/`--theirs` wholesale on code, hand-merge generated
  files, or renumber the base's migrations.
- Do not amend or squash the branch's commits while rebasing; the history the
  author wrote stays.
- Do not push with a red typecheck or a failing test this branch caused.
- Do not use `[skip ci]`.
