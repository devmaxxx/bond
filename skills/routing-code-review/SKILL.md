---
name: routing-code-review
description: Use when a `/code-review` is about to be launched — at task end by finishing-with-code-review, in the review step of /implement or /fix-qa, or because the user asked for a diff, branch, PR or path to be reviewed — and no level was typed for it in this conversation; when you notice yourself picking a review level or a `--fix`, `--comment` or `--post` flag; when the user names a level or asks for ultra; or when the diff under review changes shape after it was routed (new commits land, the target moves from the tree to a PR, a second fix round starts).
---

# Routing code review

## Contract

Every launch carries a route: level, target, flags. Default level: `high`. `max` is never taken on your own judgement — its predicates buy a question, and only the user's answer spends it. Below `high` the level table decides alone: downward is free. `ultra` is not a level this skill can take at all; it is user-triggered and billed to the user, launched by the user typing it, and the most this skill does is print the line for them to type.

The level is the reviewer's reasoning effort. `/code-review <level>` forks one background agent on the session's own model with the same prompt at every level, so a review level costs what an effort tier costs: `low` 0.6× high, `max` ≈1.7×. What the extra effort buys is coverage, not a second opinion.

The fork runs from **this session, never from a subagent** — a fork launched under a subagent has no `ReportFindings` and returns nothing. Its report arrives when the fork ends: nothing after the launch happens until it does. One run reports at most 15 findings, whatever the level.

Override: a level, target or flag is named when the user wrote it in this conversation for this review, or picked it in answer to the question. A level typed on an earlier review of the same target in this task holds for that target's re-runs. CLAUDE.md, the command files and this skill name nothing.

Predicates are measured off the diff, not guessed. The task's own `scan:` and `route:` lines are part of the card.

## Scan

Read-only, at most five tool calls, all `git` or `gh`:

1. `git status --short; git rev-parse --abbrev-ref HEAD @{upstream}`
2. `git diff --stat=200 <base>...HEAD; git diff --stat=200 HEAD` — the union of the two is `files`
3. `gh pr view --json number,state,isDraft,baseRefName,headRefOid,url` — a failure means no GitHub PR, not no PR
4. Only when this conversation carries no `scan:` card for this diff: `git diff <base> | grep -ciE '<pattern>'` for the risk words and the path patterns — fills `risk` and the test-hunk half of `tests`
5. Only when every changed path is code and `files ≤ 5`: `git diff -U0 <base>` — settles `comment-only`

A field the calls did not settle is `?`. Emit the card as one line:

```
review: target=<pr #n→base | branch <name>…<base> | tree | path <p>> · files=<n> (<paths|globs>) · modules=<n> · tests=<moved|none|n/a> · kind=<code|docs-only|comment-only|mechanical> · risk=<schema|security|concurrency|numbers|none|?> (<from scan|from diff>) · prior=<level>+<files since>|none · task=<tier> <granted: fields|declined|default>|low|none
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

## Levels

Start at `high`. Drop to `medium` or `low` when every predicate of that row holds on the card. Any max predicate: do not take the level — ask, and run `high` until the answer says otherwise.

| Level | Predicates | Argument |
|---|---|---|
| ultra (the user's) | never launched here; offered whenever a max predicate fires, recommended when `files ≥ 20` | user-triggered and billed to the user; the 15-finding cap is what makes ultra, not max, the answer to a large diff |
| max (ask) | `files ≥ 20` · `risk` not `none` unless the task's answer settled that field · base `release/*` or `hotfix/*` · a second fix round on the same target · a prior review's fixes reverted | 20 is the effort router's xhigh threshold; the risk fields are its max row; a release or hotfix base means a miss ships; a second round or a revert is a prior attempt that regressed |
| high (default) | everything else | the standing default: the level a diff gets when nothing on the card argues for another |
| medium (all) | `files ≤ 5` · `modules=1` · `tests=moved` or the types judge it · `risk=none` · `task` not granted above high — **or** `prior=high+≤5`, the re-run over that review's own fixes | 5 and 1 are the router's medium row read off the diff; a second high pass over a diff that just passed at high re-finds nothing |
| low (all) | `files=1` · `kind=mechanical` · `risk=none` | the router's low row, inherited through the task's route line, plus the one-file check |
| skip | `kind=docs-only` or `comment-only` | a review of prose finds prose; the skip is said in words in the recap |

The thresholds are the effort router's and the harness's: 5, 1, 20, 15. A number of your own is not a predicate.

**The task's question is the review's question.** When a max predicate of the review is a field the task's own escalation question already put to the user, that answer stands — granted ⇒ `max`, declined ⇒ `high` — and no second question is asked. The review asks its own only for a field the task card did not carry: `files ≥ 20` first seen on the diff, a `release/*` or `hotfix/*` base, a second fix round, a reverted fix, or `task=none`. `files ≥ 20` already answered on the task asks nothing, but the route line still prints the ultra invocation once:

```
review: target=pr #911→main · files=31 (apps/api/**, apps/web/**, libs/db/migrations/**) · modules=3 · tests=moved · kind=code · risk=schema (from scan) · prior=none · task=xhigh granted (schema, surface, files)
review-route: level=max (inherited: schema granted) target=pr #911 flags=--fix → launch ×3 by module; ultra available: /code-review ultra 911
```

## Target

Precedence, first that holds:

1. the target the user named in this conversation
2. `pr #n` — `gh` resolves an open PR for this branch, `HEAD` equals its `headRefOid`, and the tree is clean
3. `branch` — `<base>...HEAD` plus whatever the working tree still holds
4. `tree` — there is no base yet
5. `path <p>` — one leg of a split run

A PR number reviews only what is pushed, which is why an unpushed fix or a dirty tree drops the target to the branch. Bitbucket PRs are always `branch`: the fork fetches a PR through `gh`, and that is GitHub only.

**Split.** `files ≥ 20` and the answer is `high` or `max` ⇒ one run per module among the changed paths, each at the routed level, because the 15-finding cap is per run and a 31-file diff spends it before it reaches the third module. Each run waits for its own report before the next starts. The first such run verifies that a directory target actually scopes the diff; if it does not, one run, and `(cap 15, unsplit)` in the route line.

## Flags

`--fix` is a property of the target, not of the level: on when the diff is this conversation's own work, off when the target is a PR or branch this conversation did not write, or the user said review-only. Fixes land in the working tree, which is not their branch.

`--comment` writes on a PR other people read. Only on the user's word in this conversation, once per PR. Expect the bond `check-commit` hook to block the fork's `gh pr comment` if its footer carries a signature — that is the hook working; never lift it for a review.

`--post` speaks as the user's GitHub account and exists only on `ultra`, which this skill never launches. Never pass it. The printed ultra line mentions it as the user's choice.

Never `--fix` together with `--comment`.

## Asking

Any max predicate the task did not settle ⇒ one `AskUserQuestion` right after the scan, before any other tool call, quoting the card fields that fired. One question per review, not per predicate.

Options: the level the card argues for first, marked `(Recommended)` — `ultra` when `files ≥ 20`, else `max`; `high --fix` always offered; `ultra` offered whenever any max predicate fired, worded as the exact line for the user to type. Every option says, from the card, what it buys on this diff and what it costs — the concrete miss the extra coverage catches, or what the default leaves to chance. An option that names no card field is a coin toss.

The answer is a named override for the rest of the task. Cannot ask — non-interactive, a hook or cron turn, `/implement` in `auto` mode, or you are already a subagent — then `high`, with `(escalation not asked)` in the route line. Answer `ultra` ⇒ print the line, launch nothing, and apply the findings when the user's run reports back.

## Procedure

1. Record what the user named: level, target, flags.
2. Read the task's `route:` line, its answer, and any earlier `review:` / `review-route:` line in this conversation.
3. Scan, and emit the `review:` line.
4. `kind=docs-only` or `comment-only` ⇒ `review-route: level=skip (<kind>)`, say it in words, stop.
5. A max predicate the task did not settle ⇒ ask once, then use the answer.
6. Emit one line before any launch:

```
review-route: level=<l> (<fields that fired | "default" | "inherited: <field> granted" | "escalation not asked">) target=<t> flags=<--fix|none> → <launch | launch ×n by module | skip | handed to Max: /code-review ultra <t>>
```

7. Launch from the session: `Skill(skill: "code-review", args: "<level> <target> <flags>")`. Then wait — no other tool call until the fork's report is in.
8. Re-run after the fixes land: the `prior` row decides it, not the first route.
9. The diff changes shape — new commits land, the target moves from the tree to a PR, a second fix round starts — one more scan, at most one more question.

Example, a branch the session wrote itself, on a task that never escalated:

```
review: target=branch feat/invoice-lock…main · files=23 (apps/api/src/billing/**, libs/queue/**) · modules=2 · tests=moved · kind=code · risk=concurrency (from diff) · prior=none · task=high default
AskUserQuestion: "files=23 ≥ 20 and risk=concurrency; the task itself never asked. How deep?"
  ultra (Recommended) — /code-review ultra feat/invoice-lock — cloud, billed to you; the one level the 15-finding cap does not bind, and 23 files across a queue is where it bites; --post lands the result on the PR as you
  max ×2 by module — the acquire-order pass this diff argues for, one run per module so the cap is per module; ≈1.7× high, twice
  high --fix — the default; what it leaves to chance: a lock order only two of the 23 files show together
answer: max
review-route: level=max (files=23, risk=concurrency) target=branch flags=--fix → launch ×2 by module
Skill(skill: "code-review", args: "max apps/api/src/billing --fix")   # then wait for its report
Skill(skill: "code-review", args: "max libs/queue --fix")
```

Unanswered, the same diff runs `level=high (escalation not asked) target=branch flags=--fix`.

## Audit

`python3 ../routing-model-and-effort/scripts/route-audit.py --reviews [--since YYYY-MM-DD] [--project SUBSTR]`, run from this skill's base directory (printed when the skill loads), lists every `review-route:` line beside the task routes of the same sessions, and totals by level. Run it before moving a threshold or a predicate: a level changes when the audit shows it firing wrong, not when a review felt wrong.

## Excuses

| Thought | Reality |
|---|---|
| "Max always types medium" | A typed level names that review; the next one is routed off its own diff. |
| "high found nothing, medium next time" | A clean pass is a result, not a predicate; `prior` lowers only the re-run over its own fixes. |
| "It's a big PR, run max" | Twenty files buy a question, not a level — and max still reports fifteen. Ultra is the answer, and the user types it. |
| "Ultra is the best, launch it" | Ultra is the user's to launch and to pay for; the skill prints the line. |
| "--comment just posts the findings" | It writes on a PR other people read; the user says when. |
| "--fix is harmless on their PR" | Fixes land in the working tree, which is not their branch; off unless the diff is ours. |
| "The subagent can run it" | The fork loses `ReportFindings` under a subagent; the session launches it. |
| "It returned 'launched', carry on" | The report arrives when the fork ends; nothing after the launch until then. |
| "The PR is open, target the number" | The number reviews what is pushed; the branch target sees the unpushed fix too. |
| "Docs-only, but let it run" | The skip is the rule, and it is said in words; a review of prose finds prose. |
| "The task was xhigh, so max" | The answer carries only for the field it answered; a design grant is not a risk grant. |
| "One more call settles it" | Five calls; the sixth is `?`, and `?` has a rule. |
