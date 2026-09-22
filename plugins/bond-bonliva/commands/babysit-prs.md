---
description: Sweep every open PR you authored — unresolved review comments, red CI, stale branches — fix what it can, and report; pushes only under --push
---

# /bond-bonliva:babysit-prs

Takes **all** of your open pull requests in the current project, works out what
each one is waiting on, fixes what can be fixed, and prints one report. It is the
bulk counterpart to `/bond:fix-pr`, which handles a single PR's red pipeline.

Designed to be run repeatedly: one invocation is **one sweep**, and a sweep is
bounded (`--max`, default 5 PRs with real work). Wrap it in `/loop` to babysit
continuously:

```
/loop /bond-bonliva:babysit-prs --push
```

Each tick picks up PRs pushed since the last one, and a ledger in the scratchpad
means the next tick continues where this one stopped instead of redoing it.

> **Report first, push second.** By default nothing leaves the machine: fixes are
> made in per-branch worktrees and summarised. `--push` is what turns the sweep
> autonomous.

## Arguments

`$ARGUMENTS` — all optional.

### Flags

| Flag | Effect |
| --- | --- |
| `--push` | Push each fixed branch and reply to / resolve the review threads it addressed. Without it, **nothing is pushed and no comment is posted**. |
| `--max N` | Process at most `N` PRs that have real work this sweep (default `5`). PRs classified **clean** don't count against it. |
| `--only <what>` | Restrict the work buckets: any comma-separated subset of `review,ci,stale`. Default: all three. |
| `--pr <n>[,<n>…]` | Restrict the sweep to these PR numbers, ignoring the ledger order. |
| `--no-drafts` | Skip draft PRs. Default is to include them. |
| `--fresh` | Ignore the ledger and start the rotation from the top. |

## Steps

### 1. Resolve the project

Resolve the project profile (`${CLAUDE_PLUGIN_ROOT}/shared/project-profile.md`)
for `HOST`, `OWNER`/`WORKSPACE`, `REPO_SLUG`, `BASE_BRANCH` and `TRACKER`.

### 2. List your open PRs

**GitHub**

```
gh pr list --repo <OWNER>/<REPO_SLUG> --author '@me' --state open \
  --json number,title,headRefName,isDraft,reviewDecision,mergeable,updatedAt \
  --limit 100
```

**Bitbucket** — `mcp__bond-bitbucket__get_pull_requests` filtered to your account,
then `get_pull_request_statuses` per PR for CI.

Drop drafts under `--no-drafts`. If the list is empty, say so and stop — that is a
clean sweep, not a failure.

Do **not** pull `statusCheckRollup` for the whole list in one call; on a repo with
many workflows the payload is enormous. Fetch CI per PR in step 3, for the PRs you
actually intend to touch.

### 3. Classify each PR

Build the table first, cheaply, then classify. Buckets, in priority order:

| Bucket | Trigger | Fixed by |
| --- | --- | --- |
| **review** | Unresolved review threads or actionable bot comments on the head commit | Step 4 |
| **ci** | Any check on the head commit is `FAILURE` / `TIMED_OUT` / `CANCELLED` | The `/bond:fix-pr` diagnosis + fix procedure |
| **stale** | `mergeable: CONFLICTING`, or the branch is behind `BASE_BRANCH` | Rebase |
| **blocked** | CI still running, or the PR is merged/closed | Nothing — report and move on |
| **clean** | None of the above | Nothing |

Reading review comments on GitHub:

```
gh api repos/<OWNER>/<REPO>/pulls/<n>/comments --paginate   # inline review comments
gh api repos/<OWNER>/<REPO>/pulls/<n>/reviews  --paginate   # review verdicts + bodies
gh api repos/<OWNER>/<REPO>/issues/<n>/comments --paginate  # conversation comments
```

A comment is **actionable** when it asks for a change to the diff. Skip: approvals,
"LGTM", questions already answered in a later comment, threads marked resolved,
CI-bot status noise, and anything you already addressed in a previous sweep (the
ledger records comment ids). When a comment is ambiguous, do **not** guess — list it
under *Needs you* in the report and leave the thread alone.

A PR whose only finding is `blocked` or `clean` is reported, not worked on, and does
not count against `--max`.

### 4. Fix, one PR at a time

Take PRs with real work in ledger order — least-recently-swept first — until `--max`
is reached. For each:

1. **Set up the branch** (`${CLAUDE_PLUGIN_ROOT}/shared/implement-flow.md`) with
   `BRANCH_NAME` = the PR's head branch, `BRANCH_SOURCE=existing`,
   `WORKTREE_SUFFIX=-babysit`. Always a worktree — the sweep must never touch the
   checkout the user is working in, and several PRs in one sweep means several
   branches.
2. **stale** — rebase onto `BASE_BRANCH`. If the rebase does not resolve cleanly
   and mechanically, abort it, report the conflicting paths under *Needs you*, and
   move to the next PR. Never invent a resolution for a conflict you cannot read
   the intent of.
3. **ci** — run steps 3 and 4 of `/bond:fix-pr` (diagnose from `gh run view
   <run-id> --log-failed`, then the shared implement/test procedures) scoped to the
   diagnosed root causes. Summarise logs; never echo them whole.
4. **review** — apply the actionable comments. Group them per file, and treat each
   as a `Files to change` entry with the comment quoted as its reason.
5. **Test** — run the repo's own checks for what changed, per the shared **Test**
   procedure. A PR whose fix does not pass its own tests is reported as *attempted*,
   and is not pushed even under `--push`.
6. **Teardown** the worktree once the branch is pushed, or keep it and name the path
   in the report when running without `--push` so the user can inspect the diff.

Append one dated section to the PR's plan file (`docs/plans/<KEY>.md`, falling back
to the branch slug) with `PLAN_MODE=append`:

```
## Babysit round — <YYYY-MM-DD> (PR #<id>)

### Found
- review — <file:line> — "<comment, trimmed>"
- ci — <step> — <root cause>
- stale — behind <BASE_BRANCH> by <n> commits

### Changed
- `<path>` — <what and why, tied to a finding>

### Left alone
- <finding> — <why it needs a human>
```

### 5. Push (only under `--push`)

For each PR whose fix passed its tests:

1. Commit per the shared **Ship + PR** procedure with `PR_HANDLING=update` — the
   push updates the existing PR and never opens a second one.
2. Reply to each review thread that was addressed, one short sentence naming the
   commit, then resolve it. On GitHub:
   `gh api -X POST repos/<OWNER>/<REPO>/pulls/<n>/comments/<comment-id>/replies -f body='…'`.
   Never resolve a thread you did not actually address.
3. Do **not** re-request review, ping reviewers, or mark a draft ready. Those are the
   user's calls; `/bond-bonliva:request-review` exists for the first.

The freshly started pipeline is **not** watched inside the sweep — the next tick picks
it up.

### 6. Write the ledger

Write `<scratchpad>/babysit-prs-<REPO_SLUG>.json` before reporting:

```json
{
  "sweptAt": "<ISO timestamp>",
  "prs": {
    "<number>": {
      "headSha": "<sha>",
      "lastSweptAt": "<ISO>",
      "handledCommentIds": [123, 456],
      "outcome": "pushed | attempted | reported | clean | blocked",
      "needsHuman": ["<short reason>"]
    }
  }
}
```

Read it at the start of step 3 (unless `--fresh`) and use it to: order the rotation,
skip comments already handled, and drop a PR's `handledCommentIds` when its `headSha`
changed under you (someone pushed — re-read it from scratch).

### 7. Report

One table, every open PR, one line each:

```
#398  fix/erp-1155-…   ci      fixed    2 files   timeout in embedding.spec.ts
#381  feat/ERP-1278    clean   —        —         —
#14   feat/ERP-923     review  needs you            "why is the guard inside the loop?"
```

Then, below it:

- **Pushed** — PR numbers, and what each push contains (omit without `--push`).
- **Needs you** — every finding left alone, with the PR, the file, and the question.
- **Next tick** — how many PRs still have work queued behind `--max`.

Keep it to the table plus those three lists. A sweep over a dozen PRs turns into a
wall of prose otherwise.

## Loop pacing

When run under `/loop` without an interval, pick the next wakeup from what the sweep
is actually waiting on:

- A pipeline started by this sweep — one check at roughly the repo's typical run
  length, not a minute-by-minute poll.
- Nothing pending, everything clean — 1800s or more.
- Work still queued behind `--max` — 60–120s, since the next tick has real work
  waiting and nothing to wait for.

Stop the loop when every open PR is `clean` or `needs you` for two consecutive ticks:
more sweeps cannot change either.

## Do NOT

- Do not push, comment, or resolve a thread without `--push`.
- Do not resolve a review thread you did not address, and never dismiss a review.
- Do not guess at an ambiguous review comment — report it under *Needs you*.
- Do not force-resolve a rebase conflict; abort and hand it back.
- Do not mark a draft ready, re-request review, or merge anything. Ever.
- Do not work in the user's checkout — every PR gets its own `-babysit` worktree.
- Do not echo whole CI logs or whole comment threads.
- The shared flow's own **Do NOT** list applies.
