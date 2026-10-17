---
description: Audit an existing open-source library against the house stack and its alternatives — license, package, CI, README, examples — fix the drift in one PR
---

# /bond-oss:audit

**Ask first.** Before the first write, one `AskUserQuestion` with every decision `$ARGUMENTS` leaves open — none when they settle it all (standing rule *Commands ask first*).

Usage: `/bond-oss:audit [path] [--only license|package|ci|readme|examples] [--report]`

`path` defaults to the current repo. `--report` lists findings and changes
nothing. The questions this command can need: the **scope** (all sections, or
which), whether to **push and open the PR** (outward), and, for a finding that
changes the public API or bumps a major dependency, whether to include it.

## Steps

### 1. Read

`${CLAUDE_PLUGIN_ROOT}/shared/oss-profile.md`, then the repo: `package.json`,
build config, workflows, `LICENSE`, `CHANGELOG.md`, README, `examples/`.
`npm view <name> version time.modified` for what is published.

### 2. Check

Walk `oss-lib-stack` references/audit-checklist.md section by section; each
failed line becomes a finding `file:line — what — fix`. For "alternatives",
compare the 3–5 closest npm packages (downloads, size, API, last publish) and
name what to port. Examples and demo: `oss-demos`.

### 3. Fix

Branch `chore/audit-<yyyymmdd>` (or the type the biggest change implies). One
commit per section, Conventional Commits. Run the gates of `oss-lib-stack`
after each section; a gate that fails twice ⇒ stop and report.

### 4. Ship

`/bond:open-pr`, then hand CI to `bond:pr-watch` with the worktree. Merge only on
the user's explicit consent in this conversation or the ask-first answer.

### 5. Report

Findings fixed / skipped (with the reason), PR URL, CI state, and whether the
change needs a release to reach npm (README, types, runtime) — if so, suggest
`/bond-oss:release patch`.
