---
name: routing-code-review
description: Use when a `/code-review` is about to be launched — at task end by finishing-with-code-review, in the review step of /implement or /fix-qa, or because the user asked for a diff, branch, PR or path to be reviewed — and no level was typed for it in this conversation; when you notice yourself picking a review level or a `--fix`, `--comment` or `--post` flag; when the user names a level or asks for ultra; or when the diff under review changes shape after it was routed (new commits land, the target moves from the tree to a PR, a second fix round starts).
---

# Routing code review

## Contract

Default `high`; `max` asks first, and `ultra` is the user's to type.

## Levels

Start at `high`; drop a row only when every predicate of it holds.

- **skip** — `kind=docs-only`/`comment-only`, or `lines ≤ 20` · `files ≤ 2` · `risk=none`.
- **low** — `files=1` · `kind=mechanical`, or `lines ≤ 100`, with `risk=none`.
- **medium** — `files ≤ 5` · `modules=1` · `tests=moved` · `risk=none`, or `prior=high+≤5`.
- **max (ask)** — `files ≥ 20` · `risk` not `none` · base `release/*`/`hotfix/*` · a second fix round · a reverted fix.

A field the task's own question settled is settled here — granted ⇒ `max`, declined ⇒ `high`.

## Target and flags

Target: the one the user named, else `pr #n` when the PR is pushed and the tree clean, else `branch`, `tree`, `path <p>`; Bitbucket is always `branch`. `files ≥ 20` ⇒ one run per module, each waiting for its report.

`--fix` on this conversation's own work, off on a PR or branch it did not write. `--comment` only on the user's word, once per PR. Never `--post`, never `--fix` with `--comment`.

## Procedure

1. Record what the user named, read the task's `route:` line, scan (five read-only `git`/`gh` calls; an unsettled field is `?`, which holds the predicate) and emit the `review:` card:

```
review: target=<…> · files=<n> · lines=<n> · modules=<n> · tests=<…> · kind=<…> · risk=<…> · prior=<…> · task=<…>
```

2. The skip row holds ⇒ emit `level=skip` with its reason, say it in words, stop.
3. A max predicate the task did not settle ⇒ one `AskUserQuestion` after the scan, quoting the fields that fired; one per review.
4. Emit before any launch:

```
review-route: level=<l> (<fields that fired | "default" | "inherited: <field> granted" | "escalation not asked">) target=<t> flags=<--fix|none> → <launch | launch ×n by module | skip | handed to Max: /code-review ultra <t>>
```

5. Launch from the session, never from a subagent: `Skill(skill: "code-review", args: "<level> <target> <flags>")`, then wait for its report.
6. Re-run after fixes: the `prior` row decides it. A shape change ⇒ one more scan, one more question at most.

Details: references/contract-scan-and-levels.md (scan calls, card fields, table) · references/target-flags-and-asking.md (targets, flags) · references/procedure-audit-and-excuses.md (option wording, audit, excuses) — read when the body's line is not enough.
