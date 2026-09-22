# Planning model

`opus` plans. `fable` only when the user wrote it, or picked it in answer to the escalation question. Predicates that make `fable` worth asking about: designs=2+ and the request picks none · modules ≥ 3 or a process boundary · criteria must be invented · schema, surface, security or concurrency not `none` · a prior plan was abandoned.

`fable` unavailable — absent from the model list, or its usage limit is spent — plans with `opus` at the same tier, including when the user named `fable`. Say it in the route line: `plan=opus/<tier> (fable unavailable)`. Never lower the tier to compensate, never wait for a limit to reset, never ask which model instead.

# Asking

Any xhigh, max or fable predicate ⇒ one `AskUserQuestion` right after the scan, before any other tool call, quoting the card fields that fired. One question per task, not per phase, not per predicate. Options: the pair the card argues for first, marked `(Recommended)`; `opus`/`high` always offered; `fable` to plan when a fable predicate fired. Every option's description says, from the card, what that pair buys on this task and what it costs: the concrete failure the extra effort catches (`schema=migrations/ → a wrong column type in prod has no rollback`), or what the default leaves to chance, and the price (xhigh ≈1.6× high, max ≈1.7×; fable costs more than opus per token, so it plans once and never builds). A reason that names no card field is not a reason — then `opus`/`high` is the recommendation.

Run at the answer, and treat it as a named override for the rest of the task. Cannot ask, or no pick — non-interactive session, a hook or cron turn, or you are already a subagent — then `opus`/`high`, with `(escalation not asked)` in the route line. Never ask twice for the same task; a shape change earns one more scan and one more question.

# Procedure

1. Record what the user named.
2. Read the session pair.
3. `low` from the prompt alone ⇒ no scan. Otherwise scan and emit the `scan:` line.
4. Phases: plan when the spec is incomplete, designs=2+, or an escalation predicate fired; build when any file is written. Test runs and diff reads belong to build. A turn that ends with no file written and no plan handed on is answered here.
5. Escalation predicate fired ⇒ ask once, then use the answer. No predicate ⇒ no question.
6. Give each phase its pair and emit one line before any tool call other than the scan and the question: `route: tier=<t> (<card fields that fired, or "default">) plan=<model>/<tier> build=<model>/<tier> → <here|spawn>`.
7. Only for a phase step 6 marked `spawn` — named or granted above the session's pair — spawn with `Agent(subagent_type: "bond:effort-<tier>", model: "<phase model>", description: "<model>/<tier> <phase> · <ticket or title>")`, the card in the prompt. The description is the one line the agent panel shows for the spawn: pair first, then the job — `opus/xhigh build · ERP-1083 lock scope`. A planning agent returns a plan and spawns nothing. Independent escalated builds are one spawn each, in parallel, each at the task's pair; splitting never re-tiers, only the plan drop lowers a build. While a spawn runs, the session edits nothing.
8. `bond:effort-<tier>` not in the agent list: spawn `general-purpose` with the phase model, report the effort fallback, tell the user to update the bond plugin.
9. Task shape changes: stop at the current tool call, leave the file in hand, redo 3–7 for the remainder.

Example, session `opus`/`high`, "replace role strings with a policy table, migrate, keep the old API":

```
scan: files=14 (src/auth/**, src/api/roles.ts, migrations/) · modules=3 · test=src/auth/roles.test.ts · schema=migrations/ · surface=GET /roles · security=authz · concurrency=none · repro=none · designs=2+: table in db / table in config
AskUserQuestion: "schema=migrations/, surface=GET /roles, security=authz, designs=2+. Route it up?"
  fable plans, opus builds (Recommended) — designs=2+ with authz on the surface: fable settles db-table vs config-table once, before 14 files move; ≈1.7× one high plan, builds stay opus
  opus/xhigh — same care on both phases, no separate design pass; ≈1.6× high throughout
  opus/high — default; what it leaves to chance: the old-API shim written after the migration instead of before it
answer: fable plans, opus builds
route: tier=xhigh (schema, surface, security, designs — granted) plan=fable/xhigh build=opus/xhigh → spawn, spawn
Agent(subagent_type: "bond:effort-xhigh", model: "fable", description: "fable/xhigh plan · policy table", prompt: "Phase: plan. scan: … ")
Agent(subagent_type: "bond:effort-xhigh", model: "opus",  description: "opus/xhigh build · policy table", prompt: "Phase: build. Plan: … scan: … Repro: …")
```

Unanswered, the same task runs `plan=opus/high build=opus/high → here, here`. A `medium` or `low` task in an `opus`/`high` session prints `→ here` too: downward never spawns.
