---
name: pr-review-comment
description: >-
  Use when asked for a senior-reviewer PR review written up as one PR comment —
  the vertical-horizontal review plus evidence: a fresh merge of the base, a
  one-line verdict first, operational claims backed by read-only prod or staging
  numbers, async/queue, write-path and rollback checks, description claims
  re-checked, severity per finding, open questions. Trigger on "review this PR
  like a senior reviewer", "write a PR review comment", "review PR with prod
  data", "post a review on the PR", and on /bond:review-pr.
---

# PR review comment

The vertical-horizontal-review skill is the core: run both passes. This skill
adds the evidence and the write-up a human merges on.

1. **Fresh merge.** In a worktree, merge the current base into the PR head
   without committing or pushing; review that tree and say so in line 1. A
   conflict is the first finding.
2. **Discover the risk lenses** the diff touches: volume against a limit,
   queued or scheduled work, a new side effect on writes, config or schedule
   removal, migrations. Run each that applies —
   references/evidence-checks.md has the questions per lens.
3. **Measure, read-only.** An operational claim (fits the rate limit, the
   backlog is small, N rows affected) gets a number from real data: aggregate
   SELECTs against prod or staging in a read-only transaction, compared with
   the code's own limit in the same unit. Name the source and the window. No
   access ⇒ write "not measured" and make it an open question — never estimate
   a number as if measured, never write to a shared environment.
4. **Re-check the PR description.** Every count, behaviour or "no impact"
   claim in it, against the merged tree and the data; a stale one is a finding.
5. **Grade every finding** blocker / should-fix / minor / nit, each with layer,
   file or symbol, the concrete failure scenario and a suggested fix. A lens
   checked with nothing found is reported as **OK** with the one fact that
   proves it.
6. **Write the comment** in the shape of references/comment-format.md: title,
   method line, verdict, one section per lens, then `Vertical findings`,
   `Horizontal findings`, `Open questions`. Plain prose, no caveman style, no
   AI signature.
7. **Post once**, only when asked to: a single PR comment (`gh pr comment
   <id> --body-file <file>` on GitHub, `add_pull_request_comment` on
   Bitbucket). Otherwise print it. Then remove the merge worktree.

Open questions hold what only a human can decide — a staging run before
release, an alert for a failure mode the change makes silent, an owner call.
