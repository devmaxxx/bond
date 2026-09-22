# Contract

Every launch carries a route: level, target, flags. Default level: `high`. `max` is never taken on your own judgement — its predicates buy a question, and only the user's answer spends it. Below `high` the level table decides alone: downward is free. `ultra` is not a level this skill can take at all; it is user-triggered and billed to the user, launched by the user typing it, and the most this skill does is print the line for them to type.

The level is the reviewer's reasoning effort. `/code-review <level>` forks one background agent on the session's own model with the same prompt at every level, so a review level costs what an effort tier costs: `low` 0.6× high, `max` ≈1.7×. What the extra effort buys is coverage, not a second opinion.

The fork runs from **this session, never from a subagent** — a fork launched under a subagent has no `ReportFindings` and returns nothing. Its report arrives when the fork ends: nothing after the launch happens until it does. One run reports at most 15 findings, whatever the level.

Override: a level, target or flag is named when the user wrote it in this conversation for this review, or picked it in answer to the question. A level typed on an earlier review of the same target in this task holds for that target's re-runs. CLAUDE.md, the command files and this skill name nothing.

Predicates are measured off the diff, not guessed. The task's own `scan:` and `route:` lines are part of the card.

# Scan

Read-only, at most five tool calls, all `git` or `gh`:

1. `git status --short; git rev-parse --abbrev-ref HEAD @{upstream}`
2. `git diff --stat=200 <base>...HEAD; git diff --stat=200 HEAD; git diff --shortstat <base>` — the union of the first two is `files`; insertions plus deletions of the third is `lines`
3. `gh pr view --json number,state,isDraft,baseRefName,headRefOid,url` — a failure means no GitHub PR, not no PR
4. Only when this conversation carries no `scan:` card for this diff: `git diff <base> | grep -ciE '<pattern>'` for the risk words and the path patterns — fills `risk` and the test-hunk half of `tests`
5. Only when every changed path is code and `files ≤ 5`: `git diff -U0 <base>` — settles `comment-only`

A field the calls did not settle is `?`. Emit the card as one line:

```
review: target=<pr #n→base | branch <name>…<base> | tree | path <p>> · files=<n> (<paths|globs>) · lines=<n> · modules=<n> · tests=<moved|none|n/a> · kind=<code|docs-only|comment-only|mechanical> · risk=<schema|security|concurrency|numbers|none|?> (<from scan|from diff>) · prior=<level>+<files since>|none · task=<tier> <granted: fields|declined|default>|low|none
```

- `files`: the union of what is committed since the base and what the working tree still holds — a review of the branch sees both.
- `modules`: distinct top-level directories among those paths; the second level under `apps/ libs/ packages/ crates/`.
- `tests`: a test path or a test hunk among the changes. `n/a` when no source file changed.
- `kind`: `docs-only` when every path matches the docs pattern · `comment-only` when the code hunks touch nothing but comments · `mechanical` when the task's `route:` line says `tier=low` · else `code`.
- `risk`: inherited from the task card's `schema`, `security` and `concurrency`, and from its `surface` when that names published numbers; otherwise the diff grep.
- `prior`: the level of the last review of this same target in this task, and the files changed since it. `none` on a first run.
- `task`: the task's own routing tier, and what its escalation question settled.

The patterns, written once:

```
docs          \.(md|mdx|txt|rst)$|^docs/|^LICENSE|^CHANGELOG
test paths    (^|/)(tests?|__tests__|spec)/|\.(test|spec)\.|_test\.
test hunks    #\[(tokio::)?test\]|#\[cfg\(test\)\]|\b(describe|it|test)\(
schema        (^|/)(migrations?|schema|prisma|drizzle)/|\.sql$
security      auth|acl|permission|role|token|secret|crypt|password|session|payment|invoice|billing|audit|gdpr|pii
concurrency   \b(Mutex|RwLock|lock\(|atomic|spawn|thread|tokio|semaphore|channel|queue)\b
```

A `?` counts as the predicate holding: on a max field it asks, below `high` it blocks the drop. A re-run does not rescan unless the diff changed shape.

# Levels

Start at `high`. Drop to `medium` or `low` when every predicate of that row holds on the card. Any max predicate: do not take the level — ask, and run `high` until the answer says otherwise.

| Level | Predicates | Argument |
|---|---|---|
| ultra (the user's) | never launched here; offered whenever a max predicate fires, recommended when `files ≥ 20` | user-triggered and billed to the user; the 15-finding cap is what makes ultra, not max, the answer to a large diff |
| max (ask) | `files ≥ 20` · `risk` not `none` unless the task's answer settled that field · base `release/*` or `hotfix/*` · a second fix round on the same target · a prior review's fixes reverted | 20 is the effort router's xhigh threshold; the risk fields are its max row; a release or hotfix base means a miss ships; a second round or a revert is a prior attempt that regressed |
| high (default) | everything else | the standing default: the level a diff gets when nothing on the card argues for another |
| medium (all) | `files ≤ 5` · `modules=1` · `tests=moved` or the types judge it · `risk=none` · `task` not granted above high — **or** `prior=high+≤5`, the re-run over that review's own fixes | 5 and 1 are the router's medium row read off the diff; a second high pass over a diff that just passed at high re-finds nothing |
| low (all) | `files=1` · `kind=mechanical` · `risk=none` — **or** `lines ≤ 100` · `risk=none` · `task` not granted above high | the router's low row, inherited through the task's route line, plus the one-file check; a diff under a hundred lines gets one low pass, never a split |
| skip | `kind=docs-only` or `comment-only` — **or** `lines ≤ 20` · `files ≤ 2` · `risk=none` · `tests=moved` or `n/a` | a review of prose finds prose; a twenty-line change with its test is cheaper to read than to fork a reviewer over; the skip is said in words in the recap |

The thresholds are the effort router's and the harness's: 5, 1, 20, 15 — plus the diff-size lines 20 and 100. A number of your own is not a predicate.

**The task's question is the review's question.** When a max predicate of the review is a field the task's own escalation question already put to the user, that answer stands — granted ⇒ `max`, declined ⇒ `high` — and no second question is asked. The review asks its own only for a field the task card did not carry: `files ≥ 20` first seen on the diff, a `release/*` or `hotfix/*` base, a second fix round, a reverted fix, or `task=none`. `files ≥ 20` already answered on the task asks nothing, but the route line still prints the ultra invocation once:

```
review: target=pr #911→main · files=31 (apps/api/**, apps/web/**, libs/db/migrations/**) · modules=3 · tests=moved · kind=code · risk=schema (from scan) · prior=none · task=xhigh granted (schema, surface, files)
review-route: level=max (inherited: schema granted) target=pr #911 flags=--fix → launch ×3 by module; ultra available: /code-review ultra 911
```
