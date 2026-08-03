---
name: skip-ci-docs
description: >-
  Use whenever committing to a Bonliva repo. Append `[skip ci]` to the commit
  subject when a commit cannot affect the pipeline result — docs, markdown,
  plan files, comments, README — so the Bitbucket pipeline does not burn ~15
  minutes validating prose. Never skip CI when any file the build, tests, lint
  or typecheck read is touched. Trigger on "commit", "commit the docs", "update
  the plan/log/README", "don't trigger the pipeline", "skip ci".
---

# Skip CI on commits that cannot break the build

Bitbucket runs the full pipeline (~15 min: lint, typecheck, builds, several test
suites) on every push. A commit that only changes prose cannot change that
result, so it should not queue a run.

## The rule

Append `[skip ci]` to the **commit subject line** — Bitbucket only reads the
subject, not the body:

```
docs: record the TS7 migration decisions [skip ci]
```

Bitbucket skips a *push* when its **most recent** commit says `[skip ci]`. So
when a push mixes doc commits and code commits, the code commits still need to
be validated — either let the whole push run CI, or order the commits so the
skip marker is not the tip while code is still unverified.

## When to skip

Skip only when **every** file in the commit is inert to the pipeline:

- `*.md`, docs, plan files, changelogs, README
- comments-only edits
- files nothing in the build/test/lint/typecheck path reads

## When NOT to skip

Do not skip when the commit touches anything the pipeline consumes, even if the
change "looks safe":

- source, tests, config (`tsconfig*`, `jest*`, `webpack*`, `*.json` the build reads)
- `package.json` / lockfiles — these move the dependency cache key
- CI config itself
- generated output that a build step verifies

**When unsure, do not skip.** A wasted pipeline run costs 15 minutes; an
unvalidated broken commit on a shared branch costs far more.

A dead script or file that nothing references is a legitimate skip — but say so
in the commit body ("nothing in CI or any build path referenced it"), so a
reviewer can check the claim rather than take it on trust.
