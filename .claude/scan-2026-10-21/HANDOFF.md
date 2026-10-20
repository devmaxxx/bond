# beauty-crm night scan kit — 2026-10-21

A read-only, multi-agent scan of the whole repository at the latest `origin/main`: architecture,
code, security, privacy, money and time, calendar, schema truth, reliability, performance, tests,
gates, CI, ops, mobile, UX, booking site, dependencies, plans vs code, pilot readiness, market gaps.
Output: a verified report, owner decisions, proposed milestone tasks and quick wins.
**Deadline: 12:00 on 2026-10-21 (Warsaw).** Nothing in the repository, the forge or staging is changed.

## Contents

| File | What |
| --- | --- |
| `PROMPT.md` | the orchestrator's instructions (§0–§10) and 34 agent briefs (§11) |
| `bin/scan.mjs` | node helper, no dependencies: split briefs, task TSVs, check, compact, merge, show, apply |
| `bin/env.sh` | paths for every Bash block; derives them from where the kit sits |

## Install

Unzip into the root of a beauty-crm clone so that the file lands at
`<clone>/.claude/scan-2026-10-21/PROMPT.md`. `.claude/*` is gitignored, so the kit and its output never
show up in `git status`. The scan makes two detached worktrees under `<clone>/.claude/worktrees/`.

## Prerequisites

- Claude Code with the Workflow tool, model **Opus 5.5**; enough weekly usage for 15–25 M tokens.
- **Permission mode bypass** (or one that never asks): one prompt during the night stops the run.
- git with access to `origin` (smaragdove-nebo/beauty-crm); node and pnpm at the repository's pins;
  ~15 GB free disk; Git Bash on Windows or Linux (macOS needs GNU `date`).
- `gh` authenticated for the repository — optional, lane D3 uses it read-only.
- The machine stays awake and Windows Update is paused until 12:00.

## Start

Open Claude Code in the clone root and send:

```
Read .claude/scan-2026-10-21/PROMPT.md fully and execute it as the orchestrator. Deadline 12:00 2026-10-21 Warsaw time. The owner allowed xhigh for every agent and more agents when the work needs them.
```

Fleet: ≤ 50 Opus 5.5 agents at `xhigh` (29 lanes, 1 merge, ≤ 18 verify packs, 2 synthesis), at most 5
at a time, ≈ 10 h wall. A start after 23:30 drops the lowest-priority lanes automatically (§4).

## Stop

- `touch .claude/scan-2026-10-21/STOP` — lanes write what they have and stop.
- `touch .claude/scan-2026-10-21/STOP-VERIFY` — verifiers stop; the rest is marked UNVERIFIED.

## Results

In `.claude/scan-2026-10-21/`: `REPORT.md`, `owner-decisions.md`, `tasks-proposed.md`, `quick-wins.md`,
`DIGEST.ru.md`, `final/findings.tsv`, and all of it in `scan-result-2026-10-21.zip` for the owner.
`STATE.md` records every phase and recovery step.
