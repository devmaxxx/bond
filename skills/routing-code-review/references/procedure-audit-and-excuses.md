# Procedure

1. Record what the user named: level, target, flags.
2. Read the task's `route:` line, its answer, and any earlier `review:` / `review-route:` line in this conversation.
3. Scan, and emit the `review:` line.
4. The skip row holds ⇒ `review-route: level=skip (<kind> | lines=<n>)`, say it in words, stop.
5. A max predicate the task did not settle ⇒ ask once, then use the answer.
6. Emit one line before any launch — the format is in `SKILL.md`.
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

# Audit

`python3 ../routing-model-and-effort/scripts/route-audit.py --reviews [--since YYYY-MM-DD] [--project SUBSTR]`, run from this skill's base directory (printed when the skill loads), lists every `review-route:` line beside the task routes of the same sessions, and totals by level. Run it before moving a threshold or a predicate: a level changes when the audit shows it firing wrong, not when a review felt wrong.

# Excuses

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
