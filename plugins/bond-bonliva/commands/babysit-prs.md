---
description: Sweep every open PR you authored — unresolved review comments, red CI, stale branches — fix what it can, and report; pushes only under --push
---

# /bond-bonliva:babysit-prs

Takes **all** of your open pull requests in the current project, works out what
each one is waiting on, fixes what can be fixed, and prints one report. It is the
bulk counterpart to `/bond:fix-pr`, which handles a single PR's red pipeline.

One invocation is **one sweep**, and a sweep is bounded (`--max`, default 5 PRs
with real work). Wrap it in `/loop` to babysit continuously:

```
/loop /bond-bonliva:babysit-prs --push
```

Each tick picks up PRs pushed since the last one, and the ledger means the next
tick continues where this one stopped instead of redoing it.

> **Report first, push second.** By default nothing leaves the machine: fixes are
> made in per-branch worktrees and summarised. `--push` is what turns the sweep
> autonomous.
>
> This command **does not inherit** `implement-flow.md`'s own **Do NOT** list,
> because that list assumes one interactive ticket. Its own list at the bottom is
> the binding one; the only shared rules it adopts are named there.

## Arguments

`$ARGUMENTS` — all optional.

### Flags

| Flag | Effect |
| --- | --- |
| `--push` | Push each fixed branch and answer the review threads it addressed. Without it, **nothing is pushed and no comment is posted**. |
| `--max N` | Process at most `N` PRs that have real work this sweep (default `5`). PRs classified **clean** or **blocked** don't count against it. |
| `--only <what>` | Restrict the work buckets to a comma-separated subset of `review,ci,stale` (step 4). Default: all three. |
| `--pr <n>[,<n>…]` | Restrict the sweep to these PR numbers (step 3), ignoring ledger order. |
| `--no-drafts` | Skip draft PRs (step 3). Default is to include them. |
| `--fresh` | Ignore the ledger: no rotation memory, no suppressed comments, attempt counts reset (step 2). |

## The ledger

Defined here because steps 3, 4, 5 and 7 all touch it. It lives at
`~/.claude/bond/babysit-prs-<OWNER>-<REPO_SLUG>.json` — **not** the session
scratchpad, which is empty on every fresh invocation and would make the rotation
and the attempt cap meaningless outside a single `/loop`.

```json
{
  "sweptAt": "<ISO timestamp>",
  "prs": {
    "<number>": {
      "headOid": "<sha the entry describes>",
      "lastSweptAt": "<ISO>",
      "handledCommentIds": [123, 456],
      "handledThreadIds": ["PRRT_kw…"],
      "attempts": 2,
      "outcome": "pushed | attempted | reported | clean | blocked",
      "needsHuman": ["<short reason>"]
    }
  }
}
```

- **`headOid`** is the invalidation key. When a PR's current head differs from
  the recorded one, someone pushed: reset `handledCommentIds`, `handledThreadIds`
  and `attempts` for that PR and re-read it from scratch.
- **`attempts`** is how many sweeps have already tried to fix this same head and
  failed. At `2`, stop trying: report the PR under *Needs you* and never touch it
  again until its head moves. Without this an unfixable PR is retried forever
  under `/loop`.
- Missing file, or `--fresh`: treat every PR as unseen.

## Steps

### 1. Resolve the project

Resolve the project profile (`${CLAUDE_PLUGIN_ROOT}/shared/project-profile.md`)
for `HOST`, `OWNER`/`WORKSPACE`, `REPO_SLUG`, `BASE_BRANCH` and `TRACKER`.

### 2. Read the ledger

Load it, or start empty under `--fresh` / when the file does not exist.

### 3. List your open PRs

**GitHub**

```
gh pr list --repo <OWNER>/<REPO_SLUG> --author '@me' --state open \
  --json number,title,headRefName,headRefOid,isDraft,reviewDecision,mergeable,mergeStateStatus,updatedAt \
  --limit 100
```

`headRefOid` is what the ledger's invalidation turns on, and `mergeStateStatus`
is what carries `BEHIND` — omit either and step 4 cannot classify.

**Bitbucket** — `mcp__bond-bitbucket__get_pull_requests` filtered to your account.
It has no `mergeStateStatus`; use the PR's `merge_commit`/conflict fields for
**stale** and accept that "behind base" is not detectable there.

Then filter: drop drafts under `--no-drafts`, and keep only the listed numbers
under `--pr`. Empty list ⇒ say so and stop; that is a clean sweep, not a failure.

Do **not** ask for `statusCheckRollup` across the whole list — on a repo with many
workflows that payload is enormous. CI is read per PR in step 4.

### 4. Classify each PR

Per PR, in this order, stopping at the first bucket that fires:

| Bucket | Trigger | Handled in |
| --- | --- | --- |
| **blocked** | `attempts >= 2` on the current `headRefOid`, or CI is **running** | — |
| **ci** | CI is **failed** | Step 5b |
| **review** | An unresolved review thread, or an actionable conversation comment, not already in the ledger | Step 5c |
| **stale** | `mergeable: CONFLICTING`, or `mergeStateStatus: BEHIND` | Step 5a |
| **clean** | none of the above | — |

`--only` drops the buckets it does not name; a PR whose only bucket was dropped
classifies **clean** for this sweep.

**CI state.** Run the **PR details and CI status** procedure in
`${CLAUDE_PLUGIN_ROOT}/shared/project-profile.md`. It normalises both hosts to
**running** / **passed** / **failed** — never branch on raw GitHub conclusions or
raw Bitbucket states yourself, which is exactly what that procedure exists to
prevent.

**`mergeable: UNKNOWN`.** GitHub computes mergeability asynchronously, so a list
query often returns `UNKNOWN`. Re-read that one PR with
`gh pr view <n> --json mergeable,mergeStateStatus` before classifying; still
unknown ⇒ **blocked**, not **clean**.

**Review threads (GitHub).** Thread resolution state is GraphQL-only — no REST
endpoint exposes `isResolved`, and no REST endpoint resolves a thread:

```
gh api graphql -f query='
  query($owner:String!,$repo:String!,$number:Int!){
    repository(owner:$owner,name:$repo){ pullRequest(number:$number){
      reviewThreads(first:100){ nodes{
        id isResolved isOutdated
        comments(first:50){ nodes{ databaseId path line body author{login} } } } } } } }
' -f owner=<OWNER> -f repo=<REPO_SLUG> -F number=<n>
```

The thread `id` (a `PRRT_…` node id) is what step 5d resolves with, and what the
ledger stores as `handledThreadIds`. The per-comment `databaseId` is the REST id
used for replies. Conversation comments live outside threads —
`gh api repos/<OWNER>/<REPO_SLUG>/issues/<n>/comments --paginate` — and have no
resolution state; the ledger's `handledCommentIds` is the only thing that keeps
them from being re-worked.

**Bitbucket** — `mcp__bond-bitbucket__get_pull_request_comments`, whose comments
carry their own resolution state.

A comment is **actionable** when it asks for a change to the diff. Skip:
approvals, "LGTM", questions a later comment already answers, resolved threads,
outdated threads, CI-bot status noise, and anything in the ledger. When a comment
is ambiguous, do **not** guess — list it under *Needs you* and leave the thread
alone.

### 5. Fix, one PR at a time

Take **ci**, **review** and **stale** PRs in ledger order — least-recently-swept
first, never-swept first of all — until `--max` is reached.

Set up the branch once per PR via the **Set up the branch** procedure in
`${CLAUDE_PLUGIN_ROOT}/shared/implement-flow.md`, with `BRANCH_NAME` = the PR's
head branch, `BRANCH_SOURCE=existing`, `WORKTREE_SUFFIX=-babysit`, `MODE=auto`.
Always a worktree: the sweep must never touch the checkout the user is working
in. Record the worktree path — it is `WORKTREE` for the rest of this PR, and step
6 needs it.

> Do **not** call `/bond:fix-pr`'s step 4. It sets the branch up a second time
> with its own `-prfix` suffix — `git worktree add` refuses a branch already
> checked out elsewhere, so the PR would simply abort — and it ends in **Ship +
> PR**, which commits and pushes on its own. Only its step 3 (diagnosis) is
> delegated to, below.

**a. stale** — rebase onto `BASE_BRANCH`. If it does not resolve cleanly and
mechanically, `git rebase --abort`, record the conflicting paths under *Needs
you*, and move to the next PR. A rebased branch has a rewritten history, so its
push in step 6 needs `--force-with-lease`; mark the PR as such. Never invent a
resolution for a conflict whose intent you cannot read.

**b. ci** — run **step 3 of `/bond:fix-pr`** (repo root `commands/fix-pr.md`) to
diagnose: pull the failed steps' logs only (`gh run view <run-id> --log-failed`,
or `mcp__bond-bitbucket__get_pipeline_step_logs`), and produce one root-cause
entry per distinct failure. Summarise; never echo logs whole. Then fix those root
causes here, via the **Analyse the codebase** and **Implement** procedures with
`FOCUS`/`SCOPE` = the diagnosed causes.

**c. review** — apply the actionable comments through the same **Implement**
procedure, grouped per file, each comment quoted as the reason for its change.

**d. Verify** — the **Test** procedure for what changed, then the **Review and
fix** procedure over the result. A PR whose fix does not pass both is recorded
`attempted` with `attempts` incremented, and is **not pushed even under
`--push`**.

Append one dated section to the PR's plan file (`docs/plans/<KEY>.md` under
`TRACKER=jira`, else the branch slug). Write it directly — do **not** run the
**Implementation plan** procedure, whose `CONFIRM_PROMPT` would stall an
unattended `/loop` tick waiting for a human:

```
## Babysit round — <YYYY-MM-DD> (PR #<id>)

### Found
- review — <file:line> — "<comment, trimmed>"
- ci — <step> — <root cause>
- stale — <CONFLICTING | behind BASE_BRANCH>

### Changed
- `<path>` — <what and why, tied to a finding>

### Left alone
- <finding> — <why it needs a human>
```

### 6. Push — only under `--push`

Without `--push`, skip this step entirely: leave every worktree in place and name
its path in the report so the user can read the diff. Nothing else happens.

With `--push`, for each PR that passed step 5d — using plain git in that PR's
worktree, **not** the **Ship + PR** procedure, which is auto-mode-only and would
have pushed the un-gated ci fixes too:

1. `git add -A && git commit` with a Conventional Commits subject naming the PR
   and the bucket. `git push` — `--force-with-lease` for a branch step 5a
   rebased, plain otherwise. The push updates the existing PR; never open a
   second one.
2. Answer each review item that was addressed, one short sentence naming the
   commit:
   - inline review comment —
     `gh api -X POST repos/<OWNER>/<REPO_SLUG>/pulls/<n>/comments/<databaseId>/replies -f body='…'`
     (this path takes **only** inline review-comment ids; a conversation-comment
     id 404s here);
   - conversation comment —
     `gh api -X POST repos/<OWNER>/<REPO_SLUG>/issues/<n>/comments -f body='…'`;
   - then resolve the thread, which is GraphQL-only:
     `gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id=<thread node id>`.
   On Bitbucket: `mcp__bond-bitbucket__add_pull_request_comment` and
   `mcp__bond-bitbucket__resolve_pull_request_comment`.
   Never resolve a thread you did not actually address.
3. Run the **Teardown** procedure for that PR's worktree — after the push, never
   before it, or the commit is discarded with the worktree.

Do **not** re-request review, ping reviewers, or mark a draft ready. Those are the
user's calls; `/bond-bonliva:request-review` exists for the first. The freshly
started pipeline is not watched inside the sweep — the next tick picks it up.

### 7. Write the ledger

Write every PR the sweep saw, including the clean ones, with the `headOid` it was
classified at. `outcome` is the ledger enum, and the report in step 8 uses the
same five words:

| Outcome | Means |
| --- | --- |
| `pushed` | fixed, verified, pushed |
| `attempted` | fixed but failed step 5d, or fixed with no `--push` — nothing shipped |
| `reported` | work found, not attempted this sweep (`--max`, or needs a human) |
| `clean` | nothing to do |
| `blocked` | CI running, mergeability unknown, or `attempts >= 2` |

### 8. Report

One table, every open PR, one line each — bucket and outcome, no synonyms:

```
#398  fix/erp-1155-…   ci      pushed     2 files   timeout in embedding.spec.ts
#381  feat/ERP-1278    —       clean      —         —
#14   feat/ERP-923     review  reported   —         "why is the guard inside the loop?"
```

Then, below it:

- **Pushed** — PR numbers and what each push contains. Omit without `--push`.
- **Needs you** — every finding left alone, with the PR, the file and the
  question; plus every PR at `attempts >= 2`.
- **Next tick** — how many PRs still have work queued behind `--max`.

Keep it to the table plus those three lists. A sweep over a dozen PRs turns into a
wall of prose otherwise.

## Loop pacing

Under `/loop` with no interval, pick the next wakeup from what the sweep is
actually waiting on:

- a pipeline this sweep started — one check at roughly the repo's typical run
  length, not a minute-by-minute poll;
- work still queued behind `--max` — 60–120s: the next tick has real work and
  nothing to wait for;
- everything `clean`, `blocked` or *Needs you* — 1800s or more.

Stop the loop when two consecutive ticks produce no `pushed` and no new finding:
more sweeps cannot change that.

## Do NOT

- Do not push, comment, or resolve a thread without `--push`.
- Do not call `/bond:fix-pr`'s step 4, or the **Ship + PR** procedure — both push
  on their own and bypass the `--push` gate.
- Do not push a fix that failed step 5d, and do not attempt a PR a third time on
  the same head.
- Do not resolve a review thread you did not address, and never dismiss a review.
- Do not guess at an ambiguous review comment — report it under *Needs you*.
- Do not force-resolve a rebase conflict; abort and hand it back.
- Do not `--force-with-lease` a branch this sweep did not rebase.
- Do not mark a draft ready, re-request review, or merge anything. Ever.
- Do not work in the user's checkout — every PR gets its own `-babysit` worktree.
- Do not echo whole CI logs or whole comment threads.
