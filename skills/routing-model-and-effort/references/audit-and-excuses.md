# Audit

`python3 scripts/route-audit.py [--since YYYY-MM-DD] [--project <substring>] [--json]`, run from this skill's base directory (printed when the skill loads), reads every transcript under `~/.claude/projects` and prints, per route: date, session, tier, the fields that fired, the card, files actually edited by the session and its subagents, whether a question was asked and what was answered — then totals by tier and the declined-ask rate. Run it before moving a threshold or a predicate: a rule changes when the audit shows it firing wrong, not when a task felt wrong.

# Excuses

| Thought | Reality |
|---|---|
| "Mechanical, a cheap model is enough" | Difficulty sets effort; the phase sets the model. |
| "Low tier, so spawn it cheap" | A spawn re-reads the whole context; downward runs here. |
| "Already opus, so effort is moot" | opus/high is not opus/xhigh. |
| "The user said quick" | A latency wish; only a named effort replaces the tier. |
| "A subagent lacks my context" | Hand it paths, plan, repro, the card. |
| "Granted xhigh, but I'll stay here" | A granted pair is not the session's; that phase spawns. |
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
| "The options speak for themselves" | An option without its reason is a coin toss; say what the tier catches and what it costs. |
