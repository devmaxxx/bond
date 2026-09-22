---
name: routing-model-and-effort
description: Use when a task arrives that will change files or needs a plan; when you notice yourself choosing a model or a reasoning effort; when deciding between spawning a subagent and continuing in-thread; when the user names a model or an effort level; or when a task changes shape mid-turn (new files surface, a migration appears, a requirement is added).
---

# Routing model and effort

## Contract

Every phase carries a pair (model, effort); default `opus`/`high`. `fable`, `xhigh` and `max` are never your own judgement: their predicates buy a question, the user's answer spends it. A phase runs here unless its granted pair is above the session's. `opus` plans; `fable` only when the user wrote or picked it.

Details: references/routing-rules.md — read for the session pair, overrides, the card fields and the tier rules.

## Scan

No `low` from the prompt alone ⇒ scan first: six read-only calls at most; an unsettled field is `?`, which counts as the predicate holding. The card:

```
scan: files=<n> (<paths|globs>) · modules=<n> · test=<path|none> · schema=<path|none> · surface=<what|none> · security=<what|none> · concurrency=<what|none> · repro=<cmd|none> · designs=<1|2+: a / b>
```

## Effort tiers

Start at `high`; drop a row only when every predicate of it holds. An xhigh or max predicate asks instead.

| Tier | Predicates |
|---|---|
| max (ask) | irreversible, no rollback · adversarial correctness: authz, crypto, lock order, published numbers · failure is silent · a prior attempt regressed |
| xhigh (ask) | files ≥ 20 · criteria must be invented · a bug with repro=none · schema, surface, security or concurrency not `none` · designs=2+ |
| high (default) | everything else: no escalation granted, and neither medium nor low fully holds |
| medium (all) | files ≤ 5 · modules=1 · spec complete · test present, or the types judge it |
| low (all) | one file · target named literally · end state stated |

Plan runs at the task's tier; build one lower when the plan names every file and its edit.

## Procedure

1. Record what the user named, read the session pair, scan, emit the card.
2. Phases: plan when the spec is incomplete, designs=2+ or a predicate fired; build when a file is written.
3. A predicate fired ⇒ one `AskUserQuestion` right after the scan, quoting the fields that fired; one per task. Options: the card's pair first, marked `(Recommended)`; `opus`/`high` always; `fable` to plan when its predicate fired. Each option says, from a card field, what the pair catches and what it costs.
4. Emit before any other tool call: `route: tier=<t> (<card fields that fired, or "default">) plan=<model>/<tier> build=<model>/<tier> → <here|spawn>`.
5. Only a phase marked `spawn` spawns, the card in its prompt; while it runs the session edits nothing. Shape change ⇒ route the remainder again.

Details: references/asking-and-procedure.md (full steps, example, option wording) · references/audit-and-excuses.md (before moving a threshold).
