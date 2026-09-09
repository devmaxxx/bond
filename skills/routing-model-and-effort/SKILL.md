---
name: routing-model-and-effort
description: Use when a task arrives that will change files or needs a plan; when you notice yourself choosing a model or a reasoning effort; when deciding between spawning a subagent and continuing in-thread; when the user names a model or an effort level; or when a task changes shape mid-turn (new files surface, a migration appears, a requirement is added).
---

# Routing model and effort

## Contract

Every phase carries a pair (model, effort). Default pair: `opus`/`high`, plan and build alike. `fable`, `xhigh` and `max` are never taken on your own judgement: their predicates buy a question, and only the user's answer spends it. Below `high` the tier table decides alone — downward is free. A pair equal to the session's runs here; any other pair runs in a new subagent. Model and effort freeze at spawn: `SendMessage` keeps them, `fork` keeps the parent's whole pair and is never a routing move.

Predicates are measured, not guessed: a scan of the repository fills a card, and the tier table reads the card. The prompt alone settles only the `low` row.

Session pair: model from the system prompt; effort from the user's `/effort` or `CLAUDE_CODE_EFFORT_LEVEL` when visible in this conversation, else the harness default `high`. Never read effort from the numeric `reasoning_effort` tag. Spawned as `bond:effort-<tier>`: that tier and the model passed at spawn are your pair; run your phase — no scan, no routing spawn, no escalation question. A sonnet or haiku session therefore spawns every build.

Override: a model or effort is named when the user wrote its name (`sonnet`, `opus`, `haiku`, `fable`; `low` … `max`) in a turn of this conversation for this work, or picked it in answer to the escalation question. Adjectives (cheap, fast, quick, smart), the system prompt, CLAUDE.md, and agent definitions name nothing. A named model applies to the phases it is named for, to all when no phase is given. A named effort replaces the tier for every phase.

## Scan

Unless the `low` row holds from the prompt alone, scan before routing. Read-only, in this session, at most six tool calls: `ls`, `git ls-files`, `grep -rln`, `git log --oneline -n`, `head -40` of a file. Never a file body, never a test run, never a seventh call — a field six calls did not settle is `?`. Emit the card as one line:

```
scan: files=<n> (<paths|globs>) · modules=<n> · test=<path|none> · schema=<path|none> · surface=<what|none> · security=<what|none> · concurrency=<what|none> · repro=<cmd|none> · designs=<1|2+: a / b>
```

- `files`: what the edit touches, found by grepping the named symbols and their call sites, plus the tests and docs that must follow.
- `modules`: distinct top-level directories among those files.
- `test`: an existing test that exercises them.
- `schema`: a persisted-data or schema migration among them — a tool, framework or version bump is not one.
- `surface`: anything consumed outside the package: HTTP routes, CLI flags, config keys, env vars, published exports, numbers in a README.
- `security`: authz, secrets, PII, audit trails.
- `concurrency`: locks, threads, queues, async coordination.
- `repro`: a failing test or command, when the task is a bug.
- `designs`: your call, not the repo's — `1` when the request fixes the approach, `2+` otherwise, each named in three words.

A `?` counts as the predicate holding: above `high` it asks, below `high` it blocks the drop. The card goes into every spawn prompt; the builder does not rescan.

## Effort tiers

Start at `high`. Drop to `medium` or `low` when every predicate of that row holds on the card. Any xhigh or max predicate: do not take the tier — ask (below), and run `high` until the answer says otherwise.

| Tier | Predicates |
|---|---|
| max (ask) | irreversible, no rollback · adversarial correctness: authz, crypto, lock order, published numbers · failure is silent · a prior attempt regressed |
| xhigh (ask) | files ≥ 20 · criteria must be invented · a bug with repro=none · schema, surface, security or concurrency not `none` · designs=2+ |
| high (default) | everything else: no escalation granted, and neither medium nor low fully holds |
| medium (all) | files ≤ 5 · modules=1 · spec complete · test present, or the types judge it |
| low (all) | one file · target named literally · end state stated |

The thresholds are the table's: 20 and 5. A number of your own is not a predicate. Plan runs at the task's tier. The build tier is one lower whenever the plan in hand names every file and its edit and no escalation is in force; a relayed summary is not a plan.

## Planning model

`opus` plans. `fable` only when the user wrote it, or picked it in answer to the escalation question. Predicates that make `fable` worth asking about: designs=2+ and the request picks none · modules ≥ 3 or a process boundary · criteria must be invented · schema, surface, security or concurrency not `none` · a prior plan was abandoned.

`fable` unavailable — absent from the model list, or its usage limit is spent — plans with `opus` at the same tier, including when the user named `fable`. Say it in the route line: `plan=opus/<tier> (fable unavailable)`. Never lower the tier to compensate, never wait for a limit to reset, never ask which model instead.

## Asking

Any xhigh, max or fable predicate ⇒ one `AskUserQuestion` right after the scan, before any other tool call, quoting the card fields that fired. One question per task, not per phase, not per predicate. Options: `opus`/`high` (the default, first), the tier the predicate points at, and `fable` to plan when a fable predicate fired.

Run at the answer, and treat it as a named override for the rest of the task. Cannot ask, or no pick — non-interactive session, a hook or cron turn, or you are already a subagent — then `opus`/`high`, with `(escalation not asked)` in the route line. Never ask twice for the same task; a shape change earns one more scan and one more question.

## Procedure

1. Record what the user named.
2. Read the session pair.
3. `low` from the prompt alone ⇒ no scan. Otherwise scan and emit the `scan:` line.
4. Phases: plan when the spec is incomplete, designs=2+, or an escalation predicate fired; build when any file is written. Test runs and diff reads belong to build. A turn that ends with no file written and no plan handed on is answered here.
5. Escalation predicate fired ⇒ ask once, then use the answer. No predicate ⇒ no question.
6. Give each phase its pair and emit one line before any tool call other than the scan and the question: `route: tier=<t> (<card fields that fired, or "default">) plan=<model>/<tier> build=<model>/<tier> → <here|spawn>`.
7. Spawn with `Agent(subagent_type: "bond:effort-<tier>", model: "<phase model>", description: "<model>/<tier> <phase> · <ticket or title>")`, the card in the prompt. The description is the one line the agent panel shows for the spawn: pair first, then the job — `opus/xhigh build · ERP-1083 lock scope`. The session spawns every phase; a planning agent returns a plan and spawns nothing. Independent builds are one spawn each, in parallel, each at the task's pair; splitting never re-tiers, only the plan drop lowers a build. While a spawn runs, the session edits nothing.
8. `bond:effort-<tier>` not in the agent list: spawn `general-purpose` with the phase model, report the effort fallback, tell the user to update the bond plugin.
9. Task shape changes: stop at the current tool call, leave the file in hand, redo 3–7 for the remainder.

Example, session `opus`/`high`, "replace role strings with a policy table, migrate, keep the old API":

```
scan: files=14 (src/auth/**, src/api/roles.ts, migrations/) · modules=3 · test=src/auth/roles.test.ts · schema=migrations/ · surface=GET /roles · security=authz · concurrency=none · repro=none · designs=2+: table in db / table in config
AskUserQuestion: "schema=migrations/, surface=GET /roles, security=authz, designs=2+. Route it up?" → opus/high · opus/xhigh · fable plans, opus builds
answer: fable plans, opus builds
route: tier=xhigh (schema, surface, security, designs — granted) plan=fable/xhigh build=opus/xhigh → spawn, spawn
Agent(subagent_type: "bond:effort-xhigh", model: "fable", description: "fable/xhigh plan · policy table", prompt: "Phase: plan. scan: … ")
Agent(subagent_type: "bond:effort-xhigh", model: "opus",  description: "opus/xhigh build · policy table", prompt: "Phase: build. Plan: … scan: … Repro: …")
```

Unanswered, the same task runs `plan=opus/high build=opus/high`.

## Audit

`python3 scripts/route-audit.py [--since YYYY-MM-DD] [--project <substring>] [--json]`, run from this skill's base directory (printed when the skill loads), reads every transcript under `~/.claude/projects` and prints, per route: date, session, tier, the fields that fired, the card, files actually edited by the session and its subagents, whether a question was asked and what was answered — then totals by tier and the declined-ask rate. Run it before moving a threshold or a predicate: a rule changes when the audit shows it firing wrong, not when a task felt wrong.

## Excuses

| Thought | Reality |
|---|---|
| "Mechanical, a cheap model is enough" | Difficulty sets effort; the phase sets the model. |
| "Spawning costs more than the task" | A spawn is a prompt; low costs 0.6× high. |
| "Already opus, so effort is moot" | opus/high is not opus/xhigh. |
| "The user said quick" | A latency wish; only a named effort replaces the tier. |
| "A subagent lacks my context" | Hand it paths, plan, repro, the card. |
| "I'm already here, I'll plan it" | Mid-conversation is not a pair match. |
| "The predicate holds, escalate and mention it" | The predicate buys a question, not a tier. |
| "Asking burns a turn" | One question is cheaper than a whole task at xhigh. |
| "It feels like a high task" | Feelings pick nothing; below high every predicate of the row must hold. |
| "This plan looks hairy, take fable" | fable comes from the user's word or their answer, never from the look of it. |
| "fable is capped, I'll wait or ask" | opus plans it at the same tier, now. |
| "The prompt says migration" | The card says whether `schema` is touched; a version bump is not a migration. |
| "It is surely 20+ files" | Six calls count them; a guess is not a predicate. |
| "One more file and the scan is sure" | Six calls; the seventh is `?`, and `?` has a rule. |
| "The scan is overhead on a small task" | `low` from the prompt skips it; six read-only calls are cheaper than one wrong tier. |
| "The description is just a label" | It is the only line the panel shows; pair and job, or the spawn is anonymous. |
