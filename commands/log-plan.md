---
description: Generate a day/week/month time-log plan markdown by gathering commits, PRs, and recurring entries across all Bonliva repos
---

# /log-plan

Generate a time-log plan file (e.g. `2026-04-15-day-log.md`, `2026-W15-week-log.md`, `april-2026-time-log.md`) by aggregating commits, merged PRs, calls, and meetings across all Bonliva repos. Follows the conventions documented in `docs/time-logs/log.md`.

## Arguments

`$ARGUMENTS` — `<span> [period]`, where `<span>` is one of `day` | `week` | `month`. The `period` token is span-specific.

| Span    | Period token examples                                  | Default if omitted              |
| ------- | ------------------------------------------------------ | ------------------------------- |
| `day`   | `2026-04-15`, `15` (current month), `yesterday`, `today` | **Yesterday**                   |
| `week`  | `2026-W15`, `W15` (current ISO year), `last`, `this`   | **Last** completed ISO week     |
| `month` | `april-2026`, `2026-04`, `04`, `april`                 | **Previous** completed month    |

If `$ARGUMENTS` is empty, default to `month` (previous completed month) — matches the prior `/month-plan` behaviour.

Examples:

- `/log-plan` — previous month (back-compat default)
- `/log-plan day` — yesterday
- `/log-plan day 2026-04-15` — that date
- `/log-plan week` — last completed ISO week
- `/log-plan week 2026-W15` — that ISO week
- `/log-plan month april-2026` — that month
- `/log-plan month 03` — March of the current year

## Output

Writes the plan to `<repo-root>/docs/time-logs/` for the `<project>` repo, where `<project>` = `package.json#name` at `git rev-parse --show-toplevel` (e.g. `bonliva-erp`). Filename depends on span:

| Span    | Filename pattern              | Example                       |
| ------- | ----------------------------- | ----------------------------- |
| `day`   | `<YYYY-MM-DD>-day-log.md`     | `2026-04-15-day-log.md`       |
| `week`  | `<YYYY>-W<WW>-week-log.md`    | `2026-W15-week-log.md`        |
| `month` | `<month-name>-<YYYY>-time-log.md` | `april-2026-time-log.md`  |

If the file already exists, ask the user whether to overwrite or merge.

## Steps

### 1. Resolve span + date range

Parse `$ARGUMENTS` to derive `SPAN` (`day`/`week`/`month`) and a date range:

- **day**: `START` = the date, `END` = `START + 1 day` (exclusive upper bound for `--until`).
- **week**: `START` = Monday 00:00 of the ISO week, `END` = following Monday (exclusive).
- **month**: `START` = `${YEAR}-${MONTH:02d}-01`, `END` = first day of the following month.

Compute working days: Mon–Fri inside the range, minus Swedish bank holidays. Ask the user to confirm holidays/PTO if any fall in the range. (For `day`, working-day count is 0 or 1.)

### 2. Read conventions from `docs/time-logs/log.md`

Resolve the repo root via `git rev-parse --show-toplevel`, then read `<repo-root>/docs/time-logs/log.md` to load:

- Recurring tickets (`CRMDEV-1393` standup, `CRMDEV-1367` PR review, `CRMDEV-1366` calls)
- Workday template (9:00–9:15 standup, 4:30–5:00 PR review, 8h target)
- Repo list

If `docs/time-logs/log.md` is missing, abort and tell the user to create it.

### 3. Gather commits across all repos

For each repo path listed in `docs/time-logs/log.md` section 1, run in parallel:

```sh
git -C <repo-path> log \
  --author="$(git -C <repo-path> config user.email)" \
  --since="${START}" --until="${END}" \
  --pretty=format:"%h|%ad|%s" --date=short
```

The repo list comes from `docs/time-logs/log.md` — do not hardcode paths here. For each entry, derive the project name from `<repo-path>/package.json#name` (so display names like `bonliva-erp`, `bonliva-consultant-portal`, `bonliva-crm-nx` come from each repo's manifest, not this command). If a path in `docs/time-logs/log.md` does not exist on disk, skip it and note the omission in the final summary.

Parse each commit:

- Extract ticket key from message (`[A-Z]+-\d+`) or branch hint (`feature/X`, `fix/X`)
- Note follow-up branches (`-2`, `-3` suffix) — log to base ticket

### 4. Gather merged PRs (Bitbucket MCP)

For each repo, call `mcp__bitbucket__get_pull_requests` filtered by author + the resolved date range. Build the **Merged tickets** table: PR#, ticket key, merged date, branch.

If the Bitbucket MCP isn't configured, skip and note in the output.

### 5. Ask user for inputs the tools can't provide

Use `AskUserQuestion` for:

- **Calls & meetings log** — list each call/meeting (date, person/topic, raw duration); rounded to nearest 30 min under **CRMDEV-1366**. Always ask: "Any **additional calls or meetings** (Teams, phone, ad-hoc, demos, design syncs, customer meetings) not in the merged PRs / commits?" The user often has these that don't show up in code/PRs — they're easy to forget and must be captured here. **Examples that go under CRMDEV-1366:**
  - Phone/Teams calls (rounded up to nearest 30 min)
  - **Product demos** (e.g. Apr 8 — 1.0h product demo)
  - Customer / sales meetings
  - Design syncs, architecture reviews, ad-hoc 1:1s
  - Onboarding sessions, knowledge transfers
- **One-offs** — non-Jira commits (e.g. iframe fix) and ad-hoc code work without a ticket — assign to an existing ticket or skip
- **Holidays / PTO** — confirm working-day count

If the user has already prepared a notes file (e.g. `log-plan-inputs.md`), accept that path instead.

#### Calls / meetings capture format

For each call or meeting, gather:

| Field        | Example                                                                            |
| ------------ | ---------------------------------------------------------------------------------- |
| Date         | `2026-04-13`                                                                       |
| Person/topic | `Daniel` / `Product demo` / `Design sync`                                          |
| Raw length   | `50m23s` / `1h` / `outgoing` (no duration available)                               |
| Rounded      | `1h` (round **up** to nearest 30 min; minimum 30 min)                              |
| Comment      | `Call Daniel (50m23s, rounded)` / `Product demo` / `Design sync — onboarding flow` |

Each call/meeting becomes a **separate worklog** under CRMDEV-1366 so audits are traceable. Product demos, customer meetings, and ad-hoc syncs all use the same ticket and the same per-entry comment style — only the comment text differs.

### 6. Build the markdown file

Render the canonical structure (the prior `april-2026-time-log.md` shows the full month template):

1. **Header** — `# <Span label> — Time Log (max.synenko / msynEfisco)` (e.g. `# 2026-04-15 — Day Log`, `# 2026-W15 — Week Log`, `# April 2026 — Time Log`)
2. **Recurring daily entries** — convention block + ticket list
3. **Logged calls** — table under CRMDEV-1366
4. **One-off** — table
5. **Merged tickets** — table with PR + ticket + branch
6. **Calendar log** — depends on span:
   - `day` — single day table; **must total exactly 8h**
   - `week` — one table for the ISO week (Mon–Fri rows); **each working day must total exactly 8h**
   - `month` — week-by-week tables; **each working day must total exactly 8h**
7. **Totals** — bucket summary

For each working day, allocate:

- 0.25h CRMDEV-1393 standup (9:00–9:15)
- 0.5h CRMDEV-1367 PR review (4:30–5:00)
- Sum of calls (CRMDEV-1366) for that day, if any
- **Remainder** distributed to the day's tickets (inferred from commits/PRs merged that day, or the active feature branch)

If a day has no clear ticket attribution, flag it with `⚠ NEEDS REVIEW` and ask the user.

### 7. Write file and prettier

Write to `<repo-root>/docs/time-logs/<filename>` (see Output table) and run:

```sh
pnpm exec prettier --write --ignore-unknown <file>
```

### 8. Offer to post worklogs

After the markdown is written, ask the user (`AskUserQuestion`):

> "Plan written. Post worklogs to Jira now?" — Yes / No / Calls only

- **Yes** — post every row in the calendar log (skip rows without a Jira ticket, flag them).
- **No** — stop here.
- **Calls only** — post just the CRMDEV-1366 call entries (handy when ticket work is already logged but additional calls were added later).

For each worklog: call `mcp__jira__jira_add_worklog` with `issue_key`, `time_spent`, `started` (ISO UTC, see CEST→UTC table in `docs/time-logs/log.md`), and `comment`. Strip `-2`/`-3` branch suffixes — log to the base ticket with `comment: "Follow-up (branch X-2)"`.

Report each post inline: `✓ CRMDEV-1366 30m on 2026-04-15 — Call Daniel`. Continue past failures.

### 9. Summary

Print:

- File path
- Span + resolved date range
- Total working days, total hours
- Count of calls, one-offs, merged PRs
- Worklogs posted (count + first/last id), or "(plan only, not posted)"
- Any `NEEDS REVIEW` rows

## Notes

- This command does **not** post to Jira automatically — it writes a markdown plan, then offers to post.
- Strip `-2`/`-3` suffixes from branch names when matching to ticket keys (`feature/CRMDEV-6335-2` → `CRMDEV-6335`).
- Each day must total exactly 8h after recurring entries; if remainders don't fit cleanly, ask the user how to split.
- For CET months (Nov–Mar), adjust the CEST/UTC conversion table accordingly.
