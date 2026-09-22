# Contract

Every phase carries a pair (model, effort). Default pair: `opus`/`high`, plan and build alike. `fable`, `xhigh` and `max` are never taken on your own judgement: their predicates buy a question, and only the user's answer spends it. Below `high` the tier table decides alone — downward is free. **Phases run here, in this session, by default.** A new subagent is spawned only when a phase's pair is above the session's and the user named it or granted it in answer to the escalation question. A pair at or below the session's runs here: a fresh context re-reads everything this session already holds, and that costs more than a lower tier saves. Model and effort freeze at spawn: `SendMessage` keeps them, `fork` keeps the parent's whole pair and is never a routing move.

Predicates are measured, not guessed: a scan of the repository fills a card, and the tier table reads the card. The prompt alone settles only the `low` row.

Session pair: model from the system prompt; effort from the user's `/effort` or `CLAUDE_CODE_EFFORT_LEVEL` when visible in this conversation, else the harness default `high`. Never read effort from the numeric `reasoning_effort` tag. Spawned as `bond:effort-<tier>`: that tier and the model passed at spawn are your pair; run your phase — no scan, no routing spawn, no escalation question.

Override: a model or effort is named when the user wrote its name (`sonnet`, `opus`, `haiku`, `fable`; `low` … `max`) in a turn of this conversation for this work, or picked it in answer to the escalation question. Adjectives (cheap, fast, quick, smart), the system prompt, CLAUDE.md, and agent definitions name nothing. A named model applies to the phases it is named for, to all when no phase is given. A named effort replaces the tier for every phase.

# Scan

Unless the `low` row holds from the prompt alone, scan before routing. Read-only, in this session, at most six tool calls: `ls`, `git ls-files`, `grep -rln`, `git log --oneline -n`, `head -40` of a file. Never a file body, never a test run, never a seventh call — a field six calls did not settle is `?`. Emit the card as one line — the format is in `SKILL.md`.

# What fills each scan field

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

# Effort tiers

Start at `high`. Drop to `medium` or `low` when every predicate of that row holds on the card. Any xhigh or max predicate: do not take the tier — ask (below), and run `high` until the answer says otherwise.

The thresholds are the table's: 20 and 5. A number of your own is not a predicate. Plan runs at the task's tier. The build tier is one lower whenever the plan in hand names every file and its edit and no escalation is in force; a relayed summary is not a plan.
