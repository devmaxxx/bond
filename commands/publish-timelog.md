---
description: Publish an existing time-log markdown into the Jira timesheet and Clockify (one entry per day), then reconcile the totals across both dashboards
---

# /bond:publish-timelog

Take an **already-written** time-log markdown (the output of `/bond:log-plan`) and post it to **Jira** (one worklog per ticket row) and **Clockify** (**one time entry per day**, every row folded into the description), then **compare the two dashboards' total time** and report any mismatch.

This command does **not** generate or rebalance a plan — it only publishes an existing one. Use `/bond:log-plan` to produce/rebalance the markdown first.

## Arguments

`$ARGUMENTS` — optional path to the time-log markdown. If omitted, use the **newest** file in `<repo-root>/docs/time-logs/` (by filename sort, e.g. the latest `*-time-log.md` / `*-week-log.md` / `*-day-log.md`). Echo the resolved path before doing anything.

## Conventions (baked in)

- **Workday** — 9:00–18:00 with a 1h unlogged lunch **floating around midday** (not a fixed 13:00–14:00 slot — see Step 2) = **8h logged**; standup 9:00–9:15 (CRMDEV-1393), PR review 17:30–18:00 (CRMDEV-1367), calls/meetings under CRMDEV-1366.
- **Weekend / compensatory days** carry **no** standup and **no** PR review (the markdown already reflects this) — just publish the rows as written.
- **Jira `started` offset format is `+0200` with NO colon** — Jira's worklog API rejects `+02:00` with `Invalid date format`. Always emit `yyyy-MM-dd'T'HH:mm:ss.SSS+0200` (local Stockholm wall-clock, no UTC conversion). This is the single most common failure.

## Steps

### 1. Resolve + parse the markdown

Resolve the file (arg or newest in `docs/time-logs/`). Parse the **`## Daily log`** section through the next `##` heading. For each `**YYYY-MM-DD (Day)**` block, read its table and collect every data row as `(ticket, hours, note)`:

- Skip the header row and any `_Lunch_` row.
- `ticket` is the first cell; normalise it (`^[A-Z][A-Z0-9_]+-\d+$`, strip `-2`/`-3` branch suffixes).
- `hours` is the numeric hours (e.g. `2.5`); `note` is the third cell verbatim (this is the full Jira title or the `Call:`/`Meeting:`/`Daily standup`/`PR review` label).

Keep the rows **in table order** per day. Verify each day's hours sum to **exactly 8h** (lunch excluded) and that the per-day sums add up to the markdown's stated total; print a one-line per-day total table and **stop with an error** if any day ≠ 8h (the markdown is the source of truth — fix it via `/bond:log-plan`, don't silently adjust here).

### 2. Compute the timeline (for Jira `started` + the Clockify summary)

Lay each day's rows out contiguously from **09:00**. Walk the rows in order tracking a running clock: each row's `start` = clock, `end` = start + duration, clock = end. **Float the 1h lunch to right after whichever row is in progress when the clock passes 13:00** — the **first** row whose `end` is ≥ 13:00 gets lunch appended immediately after it (`clock += 1h`) before laying out the next row; every row before that point is untouched, and only one lunch is inserted per day.

Do **not** defer a row's `start` to 14:00 just because it would cross 13:00 — that creates a multi-hour dead gap on the calendar (e.g. a 3h45m row starting at 9:45 wrongly jumped to 14:00, leaving 9:45–14:00 empty instead of a 1h lunch at ~13:30). Let the row run through 13:00 uninterrupted, then insert lunch right after it ends.

This yields a `start`/`end` clock time per row — used for the Jira `started` stamp and for the human-readable breakdown in the Clockify description. (Standup sits at 09:00, PR review at 17:30 because they're first/last in the table.)

Build a `key → timeSpent` formatter: `0.25→"15m"`, `0.5→"30m"`, `1.0→"1h"`, `1.25→"1h 15m"`, `2.75→"2h 45m"`, `4.25→"4h 15m"`, etc. (Jira format, hours+minutes).

### 3. Confirm before posting

Jira worklogs **can** be corrected later via `addWorklogToJiraIssue` with `worklogId` set (it updates in place instead of creating a new one) — but only if you know the `worklogId`, which is why Step 7 writes a receipt file. Resolve the Clockify workspace + project once (`list-clockify-workspaces` → pick **Bonliva**; `list-clockify-projects` → pick the project, default **Bonliva**), then ask with `AskUserQuestion`:

- **Targets** — Both (Clockify + Jira) / Jira only / Clockify only / No (abort).
- **Clockify project** — if more than one plausible project, let the user pick (default Bonliva).

Print the counts first: `N Jira worklogs` (one per ticket row) and `D Clockify entries` (one per working day), plus the grand total hours.

### 4. Post to Jira (one worklog per row)

For **every** ticket row (including the overhead keys CRMDEV-1393 / CRMDEV-1367 / CRMDEV-1366), create a worklog via the procedure in `${CLAUDE_PLUGIN_ROOT}/commands/jira.md` (or the `addWorklogToJiraIssue` MCP tool directly):

- `issueIdOrKey` = the normalised key.
- `timeSpent` = Jira format from the row's hours.
- `started` = the row's start time as `yyyy-MM-dd'T'HH:mm:ss.000+0200` (**no colon in the offset** — see Conventions).
- `commentBody` = the row's note.

Skip a row only if it has no resolvable Jira key (e.g. an internal async-api branch not tracked in Jira) — list every skipped row in the summary. **Capture each response's `id` (worklogId) and `timeSpentSeconds`** — the id feeds the Step 7 receipt, the seconds feed the totals later. Continue past individual failures and report them.

### 5. Post to Clockify (ONE entry per day)

For each working day, create **a single** `create-clockify-time-entry`:

- `workspaceId` / `projectId` = the resolved Bonliva workspace + project.
- `start` = `YYYY-MM-DDT09:00:00` (local, no offset — Clockify converts).
- `end` = `start + (sum of that day's logged hours)` — i.e. **09:00 + 8h = 17:00** on a normal day. **Deliberately omit the lunch gap** so the single block's duration equals the 8h logged and the Clockify day-total matches Jira. (Do **not** run to 18:00 — that would book 9h.)
- `description` = a compact multi-line roll-up of **every** row that day, one line each, in timeline order:
  `HH:MM–HH:MM · <TICKET or label> · <Xh> · <note>`
  e.g. `09:00–09:15 · CRMDEV-1393 · 15m · Daily standup`. Lead with a `YYYY-MM-DD — Nh` header line. This is the one place all the per-ticket detail lives on the Clockify side, since there's a single entry.
- `billable` = true.

**Capture each entry's `id` and duration** (`end - start`) — the id feeds the Step 7 receipt, the duration feeds the totals later.

### 6. Reconcile the two dashboards

After posting, compute and print:

- **Jira total** = Σ `timeSpentSeconds` from step 4 responses (in hours).
- **Clockify total** = Σ entry durations from step 5 (in hours).
- A per-day comparison table: `Date | Jira h | Clockify h | match?`.
- The grand-total line and an explicit **`✅ totals match (Hh)`** or **`⚠ MISMATCH: Jira Xh vs Clockify Yh`**.

If they mismatch, surface the offending day(s) and the likely cause (a skipped Jira row, a day ≠ 8h, a Clockify block that ran to 18:00 instead of 17:00). Do not silently "fix" — report so the user can reconcile in the UIs.

### 7. Write the publish receipt

Write `<same dir as the source markdown>/<source filename without ext>.publish-log.json` — a flat array, one entry per posted row/day, so a future correction (wrong `started`, wrong hours, algorithm fix) can target the exact worklog/entry without re-fetching everything from the Jira API:

```json
[
  { "date": "2026-07-17", "ticket": "CRMDEV-7071", "hours": 4.5, "note": "...", "started": "2026-07-17T09:45:00.000+0200", "jiraWorklogId": "35348", "jiraIssueIdOrKey": "CRMDEV-7071" },
  { "date": "2026-07-17", "clockifyEntryId": "..." }
]
```

Include every Jira row (with `jiraWorklogId`) and every Clockify day (with `clockifyEntryId`, one row per day is enough — reuse the day's first Jira row entry or add a dedicated `{date, clockifyEntryId}` record per day). Skipped rows get `jiraWorklogId: null` plus the skip reason. This file is what makes corrections cheap: to fix a row later, look it up here and call `addWorklogToJiraIssue`/`update-clockify-time-entry` with the stored id instead of re-deriving it.

### 8. Summary

Print: resolved file path, targets posted, Jira worklog count (+ skipped rows), Clockify entry count, grand total per dashboard, the match/mismatch verdict, and the receipt file path (Step 7) — that's what to use for any future correction.

## Notes

- **One Clockify entry per day, everything in the description** — by design, so the Clockify report shows one 8h block/day while the full per-ticket breakdown stays readable in that block's description. Jira keeps the granular per-ticket worklogs.
- The Clockify daily block omits the lunch gap on purpose so its duration is the **8h logged**, making the two dashboards reconcile to the same grand total.
- **Jira offset must be `+0200` (no colon)**; **`started` is local wall-clock** (never UTC). Clockify `start`/`end` are local too (the server stores UTC, that's expected).
- Strip `-2`/`-3` branch suffixes when matching ticket keys (`feature/CRMDEV-6335-2` → `CRMDEV-6335`).
- Lunch **floats** to whichever row is in progress at 13:00 (Step 2) — never hardcode a 13:00–14:00 gap in the timeline, that produces dead multi-hour calendar gaps on days where a long row starts shortly before 13:00.
- This command is **publish-only and idempotent-unsafe** — re-running double-posts. Verify in the dashboards before re-running; there's no dedupe.
- **Always write the Step 7 receipt file**, even on partial failure — it's the only cheap way to correct already-posted entries later (no receipt means re-fetching every affected issue's worklog list via `getJiraIssue` to rebuild the id mapping by hand).
