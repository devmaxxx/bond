---
name: finishing-with-code-review
description: Use when a task that changed code is about to be reported done — before the recap, before opening or publishing a PR, after a subagent's build lands, after resolving merge conflicts, or when the user says "готово", "ship it", "commit and open a PR".
---

# Finishing with code review

## Overview

A task that changed code ends with a `/code-review` over the whole diff at the level
`bond:routing-code-review` reads off it, `--fix` on, the findings applied, the tests re-run, and
the fixes committed — then the recap. Not before. The review is part of the task, not a
follow-up: a task reported done with the review unrun is not done.

**Violating the letter of this rule is violating its spirit.**

## When it fires

Every task whose diff touches a source, test, build or config file. Subagent-built phases are not
exempt: the session runs the review over the branch, not the builder over its own phase.

**The one skip, keyed to the router's card:** `kind=docs-only` or `kind=comment-only` — the diff
touches documentation only (`*.md`, or comment-only edits). The router emits
`review-route: level=skip`, the recap says "docs-only, review skipped", and the task stops there.

## Procedure

1. **Route.** `bond:routing-code-review`: its card, its question if one fires, its
   `review-route:` line. The target rule is the router's — the PR number only when HEAD is
   pushed and the tree is clean, otherwise the branch against its base.
2. **Launch** from the session, never from a subagent:
   `Skill(skill: "code-review", args: "<level> <target> --fix")` as the route line says. It forks
   into the background; wait for its report before step 3.
3. **Apply and prove.** Fixes land in the working tree; re-run the project's tests and lint. For
   a Rust repo that is `cargo test` and `cargo clippy --all-targets -- -D warnings`.
4. **Commit** the fixes under a Conventional subject (`fix(scope): …`, `refactor(scope): …`),
   the message passed on stdin in its own shell call, no trailers. If the branch is already
   pushed, push again — through the account rule in `switching-github-accounts`.
5. **Recap** names the level it ran at and the card fields that set it, how many findings there
   were, how many were fixed, which were skipped and why. Zero findings is said in words:
   "review: nothing found".

## Rationalizations that do not count

| Excuse | Reality |
|---|---|
| "The subagent ran the tests" | Tests prove the code does what its author meant. The review looks for what nobody meant. |
| "The diff is tiny" | Tiny diffs ship the bugs big ones get reviewed for. |
| "Max is waiting" | Max asked for this at the end of every task. The wait is the price he chose. |
| "An earlier phase was reviewed" | The target is the whole branch diff, and the last phase moved it. |
| "It's a merge, not new code" | A conflict resolution is code nobody wrote on purpose. Review it. |
| "I'll run it after the PR is open" | The PR's first revision is the one people read. Review, then open. |
| "The review is a separate task" | It is this task's last step. Splitting it is skipping it. |
| "The level is obvious" | The router reads it off the diff; a level you picked is a guess. |
| "It said launched, so it ran" | It ran when the report is in. |
| "I'll read the diff myself, it's faster" | Your own reading is what produced the diff. The review is ten independent angles you do not have; invoke the skill, not your judgement. |

## Red flags — stop and run the review

- The next thing you were about to write is the recap.
- You are about to create a PR or mark one ready.
- A builder's report just arrived and you are composing the commit.
- You caught yourself judging the change "safe enough".
- You are re-reading the diff yourself instead of invoking the review.
- The launch returned and you kept going.
