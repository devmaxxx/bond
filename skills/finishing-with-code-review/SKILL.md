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

**The skips, keyed to the router's card:** `kind=docs-only` or `kind=comment-only` — the diff
touches documentation only (`*.md`, or comment-only edits) — or a small, low-risk diff
(`lines ≤ 20`, `files ≤ 2`, `risk=none`, its test moved). The router emits
`review-route: level=skip`, the recap says why ("docs-only" / "12-line diff"), and the task stops
there. A diff up to 100 lines with `risk=none` runs one `low` pass, never split.

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
   pushed, push again — through the account rule in `authorship-conventions`.
5. **Recap** names the level it ran at and the card fields that set it, how many findings there
   were, how many were fixed, which were skipped and why. Zero findings is said in words:
   "review: nothing found".

## Rationalizations that do not count

Details: references/rationalizations.md — read when a reason to skip the review
is forming.

## Red flags — stop and run the review

Details: references/red-flags.md — read when the task feels finished and the
review has not run.
