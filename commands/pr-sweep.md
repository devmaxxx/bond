---
description: Sweep every open PR — retarget, rebase and resolve conflicts, restart infra-failed pipelines, and with --merge squash-merge the green approved ones and clean up their branches and worktrees
---

# /bond:pr-sweep

One pass over a repo's open pull requests. Without `--merge` it is a report and
repair pass: each PR comes out rebased, conflict-free and with its pipeline
re-run where infrastructure killed it. With `--merge` the PRs that are ready
are squash-merged and their branches and worktrees removed.

It reuses `${CLAUDE_PLUGIN_ROOT}/shared/project-profile.md` (profile, PR
coordinates, CI status), `bond:PRStatus` for every PR read, `/bond:rebase` for
conflicts, and **Teardown** from `${CLAUDE_PLUGIN_ROOT}/shared/implement-flow.md`.

**Standing instructions win.** "Don't push", "don't merge #12" given earlier in
the session override the matching step here.

## Usage

```
/bond:pr-sweep [--mine|--all] [--base <branch>] [--retarget <branch>] [--merge] [--dry-run]
```

Examples: `/bond:pr-sweep`, `/bond:pr-sweep --merge`,
`/bond:pr-sweep --all --base hotfix/5.18.3`,
`/bond:pr-sweep --base main --retarget release/5.16.0`.

### Flags

| Flag | Effect |
| --- | --- |
| `--mine` | Only PRs authored by the active account. The default. |
| `--all` | Every open PR in the repo. |
| `--base <branch>` | Only PRs targeting `<branch>`. |
| `--retarget <branch>` | Move every selected PR to `<branch>`, replaying only its own commits. |
| `--merge` | Squash-merge the PRs that pass the gate in step 5. |
| `--dry-run` | Print the plan table and stop. No writes of any kind. |

## Steps

### 0. Set up

1. Resolve the project profile. Apply `bond:authorship-conventions`: the active
   `gh` account is the one for this repo, and `git ls-remote origin` succeeds.
2. Work from the main checkout; every per-PR change happens in a worktree
   (`/bond:rebase` sets it up), never by switching this checkout's branch.
3. `git fetch --prune origin`.

### 1. List

- GitHub: `gh pr list --state open --limit 200 --json
  number,title,author,headRefName,baseRefName,isDraft,url,isCrossRepository` plus `--author @me`
  under `--mine` and `--base <branch>` when given.
- Bitbucket: `mcp__bond-bitbucket__get_pull_requests` with `state: OPEN`, then
  filter by destination and, under `--mine`, by author. The author cannot be
  matched to the active account ⇒ say so and continue as `--dry-run`.

None ⇒ say so and stop.

### 2. Read each PR

One `bond:PRStatus` read per PR — in parallel subagents when there are more
than three. Its report is the row: draft, mergeable, CI verdict with causes,
review decision, unhandled comment count.

Classify each PR into exactly one action:

| State | Action |
| --- | --- |
| merged/closed since listing | skip |
| `--retarget` and base differs | retarget |
| `CONFLICTING`, or `BEHIND` a base that requires up-to-date branches | rebase |
| CI failed, every cause restartable infrastructure (below), or cancelled | restart CI |
| CI failed in code | report — `/bond:fix-ci <n>` |
| CI running | wait — report |
| unhandled comments, `CHANGES_REQUESTED`, or approval required and missing | report |
| draft | report |
| green, ready, approved where required, no unhandled comments | merge (`--merge`) / ready |

**Restartable infrastructure**, not code: a cancelled run, a runner that never
picked the job up or lost contact, a network timeout fetching dependencies,
leftover Woodpecker `buildx_buildkit_*`/`wp_*` containers (see
`bond:woodpecker-cli`). A failing test, type, lint or build error is code.
A registry/auth 401/403, a missing or expired secret or a missing cloud
resource fails the same way again — report it as *needs you*, never restart it,
as `/bond:fix-ci` does. A deploy pipeline (`deployment` event, or a step that
deploys an environment) is never restarted without the user's yes.

### 3. Plan table

Print it before any write:

```
#   PR    head → base                 draft  CI       review     cmts  merge        action
1   #381  feat/ERP-1244 → main        no     passed   APPROVED   0     MERGEABLE    merge
2   #377  fix/ERP-1201 → main         no     failed   —          0     CONFLICTING  rebase
3   #370  feat/ERP-1190 → main        yes    passed   —          2     MERGEABLE    report: draft, 2 comments
```

`--dry-run` ⇒ stop here.

### 4. Repair

Per PR, in list order, at most one attempt per action:

- **retarget** — run `/bond:rebase <n> <retarget> --from <old base>` first;
  only after its push, move the base: `gh pr edit <n> --base <retarget>`, the
  update-PR call on Bitbucket. A hand-back leaves the PR on its old base.
- **rebase** — run `/bond:rebase <n>`. It merges instead for a shared branch —
  a colleague's PR under `--all` is one, so their branch is never force-pushed.
  A hand-back ⇒ report the files under *Needs you*, next PR.
- **restart CI** — once per PR per sweep. GitHub: `gh run rerun <run-id>
  --failed`, the run id from the failed check's link. Bitbucket:
  `run_pipeline` on the head branch. Woodpecker: per `bond:woodpecker-cli`.
  Do not wait for it; the end table says *restarted*.

A rebase or restart starts CI again, so that PR is not green in this sweep:
the end table says *re-run the sweep once CI settles*.

### 5. Merge (`--merge` only)

Merge order: oldest first, and a stacked PR only after the PR it sits on. Per
PR, re-read it through `bond:PRStatus` immediately before merging — an earlier
merge in this sweep may have moved its base. Merge only when **all** hold:

- open and **not a draft**;
- CI **passed** on the head being merged (`none` passes only when the repo has
  no CI at all);
- `MERGEABLE`, not `BEHIND` a base that requires up-to-date branches;
- GitHub `reviewDecision` is `APPROVED`, or empty with no required review on
  the base; Bitbucket: no participant has requested changes, and the approvals
  the repo's branch restrictions require are present (unreadable ⇒ at least
  one approval from someone other than the author);
- `new comments: 0`;
- no standing instruction excludes it.

Then:

- GitHub: `gh pr merge <n> --squash --match-head-commit <head sha read just
  now>` — the sha pins the merge to the head that was checked.
- Bitbucket: `merge_pull_request` with `merge_strategy: squash` and
  `close_source_branch: true` — or `false` when another open PR targets the
  head branch (it would be orphaned; step 6 deletes the branch later). The tool missing (it is off by default in the
  MCP) ⇒ report *merge by hand*, do not fall back to anything else.

A refused merge is reported with the host's reason, never retried around.

### 6. Clean up merged PRs

After each confirmed merge (`state: MERGED` on a fresh read):

1. A worktree holds the head branch (`git worktree list --porcelain`) ⇒
   **Teardown** with that path. Dirty ⇒ leave it and report.
2. The branch is the base of another open PR ⇒ keep it: deleting it closes
   that PR on GitHub. Retarget the dependent PR onto this PR's base and run
   `/bond:rebase <dependent> <base> --from <merged head>`.
3. A PR from a fork (`isCrossRepository`) ⇒ touch no branch: `origin` has none
   of its own, and a same-named one is unrelated. Otherwise delete the remote branch — `git push origin --delete <head>` (an
   already-deleted ref is fine; the host may auto-delete) — and the local one,
   `git branch -D <head>`, only when the local branch tip equals the head sha
   that was merged — a squash leaves no ancestry to check, and anything past
   that sha is unmerged work.

Last: `git worktree prune`, and in the main checkout, when it is clean and on
the base, `git pull --ff-only`.

### 7. End table

Same columns as step 3, with the result: *merged*, *rebased (CI running)*,
*retargeted*, *restarted*, *conflict — needs you*, *CI red in code —
/bond:fix-ci*, *waiting on review*, *draft*. Then *Needs you*: hand-backs,
refused merges with the reason, comments to address, dirty worktrees left.

## Do NOT

- Do not merge a draft, mark a PR ready, or approve one.
- Do not bypass required reviews or checks: no `--admin`, no `--auto`, no
  disabling a branch protection or merge check, no dismissing a review.
- Do not merge on a head that was not the one read just before the merge.
- Do not restart a pipeline more than once per PR, or restart one that failed
  in code.
- Do not fix a code CI failure or a review comment here — that is
  `/bond:fix-ci` and `/bond:ship-pr`.
- Do not force-push a branch another author committed to, `--force` anything,
  or use `[skip ci]`.
- Do not delete a branch another open PR targets, a branch with commits that
  were not on the merged PR, or a dirty worktree.
- Do not write anything under `--dry-run`.
