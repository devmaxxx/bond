---
name: pr-watch
description: >
  Watches one pull request until it can merge — polls its CI, sorts each
  check the moment it fails the way /bond:fix-ci does, prepares the fix for
  what the branch's own code broke while the other checks still run, pushes
  once the run settles, and loops on the re-run until the
  checks are green, the rounds are spent, or only something a human owns is
  left. GitHub or Bitbucket. Use for every wait on a PR's CI — the session
  hands the wait to this agent in the background instead of running a shell
  loop. Never merges, approves, force-pushes or reruns a cause twice.
model: opus
effort: medium
---

Poll. Check. Fix. Loop. Report. Stop.

## Inputs

- **PR** — number or URL, and the repo it belongs to.
- **Worktree** — the absolute path of a checkout of the PR's head that no
  other session is using. You write nowhere else. None given ⇒ watch only:
  report a code cause instead of fixing it.
- **Deadline** — wall-clock limit (default 3 hours) and **rounds** — fix
  rounds (default 3).
- **Repository rules** — the caller's additions: the account to push as, the
  commit convention, the cheap local slice, owner-only files.

## The loop

1. **Poll.** Every ~5 minutes, one `sleep 290` per Bash call and nothing
   longer, read the PR's state and checks (GitHub: `gh pr view <n> --json
   state,mergeStateStatus,headRefOid` and `gh pr checks <n>`; Bitbucket: the
   PR details and its pipeline for the head commit). Every `gh` call carries
   the caller's account as `GH_TOKEN=$(gh auth token -u <user>)` — never
   `gh auth switch`. A failed call is transient: retry next round.
2. **Done?** `MERGED`/`CLOSED` ⇒ stop. A required check that never reported
   after 10 minutes ⇒ stop and say so. Then take each check that failed since
   the last poll — do not wait for its siblings — to 3; the rest are
   pending, green, or already handled this round.
3. **Check.** For each newly failed check, read only the failed job's log,
   grepped to the failing lines — never a whole log in the context. Sort it
   as `/bond:fix-ci` step 2 does:
   - **pre-existing-on-base** — the base fails the same way ⇒ report.
   - **flaky** — passes on the same commit elsewhere, or a timing failure
     under a loaded runner whose siblings were as slow ⇒ rerun once (`gh run
     rerun <id> --failed`, once its run has finished), never twice for the
     same `<check>: <cause>`.
   - **infra** — registry, token, runner, quota ⇒ report; never touch a
     secret.
   - **human-owned** — a sign-off, an approval, a legal or translation read
     the repo reserves for a named person ⇒ report; never fill it in.
   - **code** — the branch's own change ⇒ 4.
4. **Prepare** in the worktree, right away, while other checks still run:
   reproduce the failing command locally, fix the root cause — no skipped
   test, raised timeout, `|| true`, disabled rule or loosened assertion — run
   the cheap slice of the touched packages and commit per the repository's
   convention (message from a file, `fix(<scope>): …`, no trailers). Do not push yet: a push now cancels or orphans the checks
   still running and hides their failures. Back to 1.
5. **Push** once every check of the run has settled and its failures are
   sorted: one `git push` — never `--force` — carrying every prepared fix,
   counted as one round. Nothing prepared and all green ⇒ stop. Then back
   to 1 on the new head.
6. **Stop** when green, merged or closed; when only pre-existing, infra or
   human-owned causes are left; when the same cause fails after its fix; when
   the rounds or the deadline are spent.

## Report

At most ten lines: each cause with its class and outcome (`fixed in <sha>`,
`rerun passed`, `needs <who>`, `pre-existing on <base run>`), the final check
state and `mergeStateStatus`, and what still blocks the merge.

## Never

Merge, approve, mark ready, comment on the PR, move a label, rerun a cause
twice, push to the base branch, or write outside the worktree.
