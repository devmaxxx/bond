---
description: Generate a day/week/month time-log plan markdown by gathering commits, PRs, Teams calls/meetings (via Chrome MCP), and recurring entries across all Bonliva repos
---

# /log-plan

Generate a time-log plan file (e.g. `2026-04-15-day-log.md`, `2026-W15-week-log.md`, `april-2026-time-log.md`) by aggregating commits, merged PRs, calls, and meetings across all Bonliva repos.

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

### 0. Clarify span + period (ask first)

Before resolving anything, **confirm the span and period with `AskUserQuestion`** unless `$ARGUMENTS` already fully specifies both. Ask only what's missing:

- **Span** — `day` / `week` / `month` (if not given).
- **Month** — span `month`, no month given: ask the **month number** (`1`–`12`) and year (default current year).
- **ISO week** — span `week`, no week given: ask the **ISO week number** (and ISO year).
- **Date / weekday** — span `day`, no date given: ask the **date** (`YYYY-MM-DD`) or **weekday**.

Echo back the resolved span + concrete date range (e.g. "month 6 → June 2026, `2026-06-01` … `2026-06-30`") before continuing. **Skip the question only when `$ARGUMENTS` is unambiguous** (e.g. `/log-plan month 2026-06`, `/log-plan day 2026-06-15`).

### 1. Resolve span + date range

Parse `$ARGUMENTS` to derive `SPAN` (`day`/`week`/`month`) and a date range:

- **day**: `START` = the date, `END` = `START + 1 day` (exclusive upper bound for `--until`).
- **week**: `START` = Monday 00:00 of the ISO week, `END` = following Monday (exclusive).
- **month**: `START` = `${YEAR}-${MONTH:02d}-01`, `END` = first day of the following month.

Compute working days: Mon–Fri inside the range, minus Polish public holidays. For each Polish public holiday that lands on a weekday in the range, ask the user (multi-select, in step 6) whether they **worked that day** — days they worked count as normal 8h working days; days they didn't are excluded from the working-day count. Also confirm any PTO. (For `day`, working-day count is 0 or 1.)

### 2. Conventions

These conventions are baked into this command — no external file is required:

- **Recurring tickets** — `CRMDEV-1393` standup (0.25h), `CRMDEV-1367` PR review (0.5h), `CRMDEV-1366` calls/meetings (per item)
- **Workday template** — **9:00–18:00 with a 1h lunch (13:00–14:00, unlogged) = 8h logged**; 9:00–9:15 standup (CRMDEV-1393), 17:30–18:00 PR review (CRMDEV-1367)
- **Weekend / compensatory days have no standup and no PR review.** A day worked on a **Saturday or Sunday** (e.g. a day worked in place of a taken-off weekday) omits both the CRMDEV-1393 standup and the CRMDEV-1367 PR review rows — the team ceremonies don't run. The day still totals **8h logged**: reallocate the freed `0.75h` (0.25h standup + 0.5h PR review) onto that day's actual tickets. Drop the standup/PR-review rows from such days **and** exclude them from the per-day count in the **Totals** buckets (`Standup (N × 0.25)`, `PR review (N × 0.5)` use only the weekday count). Note `no standup/PR review` in the day header. If a weekend day did run a ceremony, confirm with the user before keeping it.
- **Ticket titles** — the `Note` for every ticket row is the **full Jira issue title** (`summary`), fetched live via the Jira MCP — **never** a placeholder like `feature` / `fix` / `chore`, and never a hand-shortened paraphrase. Recurring overhead rows keep their `Call:` / `Meeting:` / `PR review` / `Daily standup` text. See step 4b.
- **Repos** — see step 3

Resolve the repo root via `git rev-parse --show-toplevel` — used for the output location (step 8).

### 3. Gather commits across all repos

**Resolve the projects to track (per-user config — never hardcode paths in this command).** In priority order:

1. **Config file** — `$HOME/.bond/projects.json`, a JSON object with a `projects` array of absolute repo paths (`{ "projects": ["/abs/path", ...] }`). This is the per-user list of projects to track, written by `/bond:setup-plugin` and editable by hand; to add or drop a project, edit this file.
2. **Auto-discovery fallback** — if that file is absent, glob `bonliva-*` git repos in the parent of the current repo root: `ls -d "$(dirname "$(git rev-parse --show-toplevel)")"/bonliva-*/.git | sed 's,/.git,,'`.

If neither yields anything, tell the user to run `/bond:setup-plugin` (which configures the projects to track) and abort.

Run in parallel for each resolved repo that exists on disk:

```sh
git -C <repo-path> log \
  --author="$(git -C <repo-path> config user.email)" \
  --since="${START}" --until="${END}" \
  --pretty=format:"%h|%ad|%s" --date=short
```

Derive the display name from `<repo-path>/package.json#name`. If a path does not exist on disk, skip it and note the omission in the final summary.

Parse each commit:

- Extract ticket key from message (`[A-Z]+-\d+`) or branch hint (`feature/X`, `fix/X`)
- Note follow-up branches (`-2`, `-3` suffix) — log to base ticket

### 4. Gather merged PRs (Bitbucket MCP)

For each repo, call `mcp__bond-bitbucket__get_pull_requests` filtered by author + the resolved date range. Build the **Merged tickets** table: PR#, ticket key, merged date, branch.

If the Bitbucket MCP isn't configured, skip and note in the output.

### 4b. Resolve ticket titles (Jira MCP)

Collect the **full set of ticket keys** seen across commits (step 3) and merged PRs (step 4), normalised (strip `-2`/`-3` branch suffixes; `^[A-Z][A-Z0-9_]+-\d+$`). Fetch every title in **one batched** `searchJiraIssuesUsingJql` call per project (`key in (ERP-…, CRMDEV-…)`, `fields: ["summary","issuetype"]`) — get the `cloudId` from `getAccessibleAtlassianResources` (or pass the site host directly).

- Build a `key → { title, type }` map and use the **`summary` verbatim** as the `Note` for that ticket's rows in every daily table (step 7) and as the title in the **Ticket titles** reference section.
- A key that returns nothing (not in Jira, e.g. an internal async-api branch) keeps a best-effort note from the branch/commit and is marked `(not tracked in Jira)`.
- Recurring overhead keys (`CRMDEV-1393` / `CRMDEV-1367` / `CRMDEV-1366`) are **not** looked up — they use their fixed labels.

If the Jira MCP isn't available, fall back to the branch/commit text for the note and flag that titles are unresolved.

### 5. Gather Teams calls & calendar meetings (Chrome DevTools MCP)

Pull calls and meetings automatically from the user's signed-in Microsoft Teams web app via the Chrome DevTools MCP, so the user only has to confirm/supplement in step 6 rather than recall everything from memory.

**Connect to the right browser.** More than one `chrome-devtools` MCP server may be configured. Use the namespace whose `list_pages` returns the user's real signed-in tabs (their dev app, Jira, etc.) — that server is attached to the local Chrome launched with `--remote-debugging-port=9222` (profile `~/.chrome-debug`). If a namespace's `list_pages` returns nothing, or only an `about:blank` that immediately closes, it spawned its own empty browser — switch to the other namespace. Do **not** launch a fresh browser; only the signed-in profile has the Teams session. (You can confirm the debug instance and its tabs with `curl -s http://127.0.0.1:9222/json`.)

**Calls history:**

1. `navigate_page` an existing tab to `https://teams.cloud.microsoft/` (the profile is already signed in). `wait_for` `Chat` / `Calendar`.
2. Click the **Calls (⌃ ⇧ 5)** app-bar button; `wait_for` `History`.
3. `take_snapshot` — save to a file via `filePath` under the repo root (the snapshot routinely exceeds the inline token limit), then `grep`. Each call row exposes an accessible name like:
   `"... <Contact Name>, Incoming, Call duration of 12 minutes 12 seconds, Call time/date is Tuesday ..."`
4. Parse per row: **contact**, **direction** (`Incoming` / `Outgoing` / `Missed incoming`), **duration** (`X minutes Y seconds`, `1 hour 5 minutes`), **date**. Resolve relative dates (`Tuesday`, `Yesterday`) against today.
5. Drop **Missed** and **0m 0s** rows (no time spent); keep the rest.

**Calendar meetings:**

1. Click the **Calendar (⌃ ⇧ 4)** app-bar button. The calendar renders inside an **Outlook iframe** (`outlook.office.com/.../calendar`), so events appear under that frame in the snapshot.
2. Ensure the visible range covers `[START, END)` — switch to Month or Week view and page to the right month(s) if needed.
3. `take_snapshot` (to a file, then `grep`). Each event is a button named like:
   `"Product demo, 9:15 AM to 10:30 AM, Friday, May 8, 2026, By <Organizer Name>, Tentative, Recurring event"`
4. Parse per event: **title**, **start→end** (compute duration), **date**, **organizer**, **status**.
5. **Skip**: titles starting with `Canceled:`, status `Free`, and any event already allocated elsewhere — **Dev Stand-up / Standup** (covered by CRMDEV-1393) and **PR review** (CRMDEV-1367). Do not double-count those. Keep real working meetings: product demos, catch-ups, design/architecture syncs, customer meetings, etc.

**Filter & map.** Keep only calls/meetings whose date falls within `[START, END)`. Each becomes a candidate **CRMDEV-1366** entry using the rounding rules in step 6 (round **up** to nearest 30 min, min 30 min). Carry the contact/title through as the comment, prefixed **`Call:`** for calls and **`Meeting:`** for meetings (e.g. `Call: Daniel`, `Meeting: Product demo`).

If the Chrome MCP isn't available, the browser isn't signed in, or Teams won't load, skip this step and note it — step 6 still gathers the same info by asking the user.

### 6. Ask user for inputs the tools can't provide

Use `AskUserQuestion` for:

- **Calls & meetings log** — present the list already pulled from Teams in step 5 (date, person/topic, raw duration, rounded), each under **CRMDEV-1366**, for the user to confirm or edit. Then always ask: "Any **additional calls or meetings** (personal phone calls, in-person/ad-hoc meetings, demos, design syncs, customer meetings) not captured from Teams or in the merged PRs / commits?" Some don't surface in Teams or code and must be added here. **Examples that go under CRMDEV-1366:**
  - Phone/Teams calls (rounded up to nearest 30 min)
  - **Product demos** (e.g. Apr 8 — 1.0h product demo)
  - Customer / sales meetings
  - Design syncs, architecture reviews, ad-hoc 1:1s
  - Onboarding sessions, knowledge transfers
- **One-offs** — non-Jira commits (e.g. iframe fix) and ad-hoc code work without a ticket — assign to an existing ticket or skip
- **Polish public holidays / PTO** — for each Polish public holiday on a weekday in the range, **multi-select which of those days the user actually worked** (worked → counts as a normal 8h working day; not worked → excluded from the working-day count). Then confirm any additional PTO.

If the user has already prepared a notes file (e.g. `log-plan-inputs.md`), accept that path instead.

#### Calls / meetings capture format

For each call or meeting, gather:

| Field        | Example                                                                            |
| ------------ | ---------------------------------------------------------------------------------- |
| Date         | `2026-05-13`                                                                       |
| Person/topic | `<colleague>` / `Product demo` / `Design sync`                                     |
| Raw length   | `50m23s` / `1h` / `outgoing` (no duration available)                               |
| Rounded      | `0.5h` (round **up** to nearest 30 min; minimum 30 min)                            |
| Comment      | `Call: <colleague>` / `Meeting: Product demo` / `Meeting: Design sync — onboarding flow` |

Each call/meeting becomes a **separate worklog** under CRMDEV-1366 so audits are traceable. Product demos, customer meetings, and ad-hoc syncs all use the same ticket and the same per-entry comment style — only the comment text differs. Comments are prefixed **`Call:`** (phone/Teams calls) or **`Meeting:`** (demos, syncs, catch-ups) so the daily log reads consistently.

### 7. Build the markdown file

Render the canonical structure (the latest `may-2026-time-log.md` shows the full month template):

1. **Header** — `# <Span label> — Time Log (max.synenko / msynEfisco)` (e.g. `# 2026-05-15 — Day Log`, `# 2026-W19 — Week Log`, `# May 2026 — Time Log`), followed by a summary blockquote: `> Period: **<label>** · Working days: **<N>** (<holidays excluded>) · Logged: **<H>h**`
2. **Working day** — convention block. A table of recurring entries: CRMDEV-1393 standup `0.25h` @ 9:00–9:15, CRMDEV-1367 PR review `0.5h` @ 17:30–18:00, CRMDEV-1366 calls/meetings `per item`, and `_Lunch_` `1h` @ 13:00–14:00 (unlogged). State the day shape: **each working day runs 9:00–18:00 with a 1h lunch (13:00–14:00) = 8h logged**, and that calls/meetings are overhead prefixed `Call:` / `Meeting:`. If any tickets were capped (see below), add a `> Note:` line listing them.
3. **Calls & meetings (CRMDEV-1366)** — aggregate table (Date, Topic, Hours) ending in a **Total** line; Topic carries the `Call:` / `Meeting:` prefix
4. **One-off** — table (only if there are non-ticket items)
5. **Merged tickets** — table with PR + ticket + merged date + branch
6. **Ticket titles** — reference table(s) of every non-overhead ticket key worked in the span, grouped by project, with columns **Ticket | Type | Title** (full Jira `summary` from step 4b). Close with a one-line note mapping the overhead keys (CRMDEV-1393 standup · CRMDEV-1367 PR review · CRMDEV-1366 calls/meetings).
7. **Daily log** — depends on span:
   - `day` — single day table; **must total exactly 8h logged**
   - `week` — week section (Mon–Fri), one table per day; **each working day must total exactly 8h logged**
   - `month` — week-by-week sections (`### Week 19 (May 4–8)`), one table per day; **each working day must total exactly 8h logged**

   Each day starts with a one-line header naming the tickets worked + any cap notes, e.g. `**2026-05-04 (Mon)** — ERP-152, ERP-249 (capped 1h); fill ERP-137/180.` Then a table with columns **Ticket | Hours | Note**, where Note is the **full Jira ticket title** (`summary` from step 4b — never `feature` / `fix` / a paraphrase; calls/meetings/standup prefixed `Call:` / `Meeting:`). A capped row appends `(capped 1h)`, a continued row appends `(cont)`. Insert a `_Lunch_ | — | 13:00–14:00` row at the midday boundary.
8. **Totals** — bucket summary: standup (N × 0.25), PR review (N × 0.5), calls/meetings, ticket work, **Total logged**, and a separate `_Lunch (N × 1h, not logged)_` line. Here **N for standup and PR review is the count of weekday working days only** (weekend/compensatory days have neither) — so this N can be lower than the total working-day count; lunch counts every worked day. Close with the working-day count and the list of capped tickets.

For each working day, allocate (everything inside 9:00–18:00 minus the 13:00–14:00 lunch = 8h logged):

- 0.25h CRMDEV-1393 standup (9:00–9:15) — Note `Meeting: Daily standup` — **weekday only; omit on Sat/Sun**
- 0.5h CRMDEV-1367 PR review (17:30–18:00) — Note `PR review` — **weekday only; omit on Sat/Sun**
- On a **weekend / compensatory day**, both rows above are omitted; reallocate the freed **0.75h** across that day's tickets so it still totals 8h.
- Sum of calls/meetings (CRMDEV-1366) for that day, if any — each a **separate row**, Note prefixed `Call:` / `Meeting:`
- **Remainder** distributed to the day's tickets (inferred from commits/PRs merged that day, or the active feature branch)

**Per-worklog 1h cap.** Some tickets are capped at **1h per worklog** (typically small admin / Claude-command / config tickets). When a ticket is capped, log at most 1h against it that day and **reallocate the freed hours to other tickets worked the same day** so the day still totals 8h. Mark every capped ticket in the day-header line with `(capped 1h)` and list them all in the totals section's cap note. If it isn't obvious which tickets to cap, ask the user.

If a day has no clear ticket attribution, flag it with `⚠ NEEDS REVIEW` and ask the user. Tickets that are inaccessible/locked in Jira keep their row with a `(ticket inaccessible in Jira)` note.

### 8. Write file and prettier

Write to `<repo-root>/docs/time-logs/<filename>` (see Output table) and run:

```sh
pnpm exec prettier --write --ignore-unknown <file>
```

Before rebalancing and posting (steps 9–10), verify:

- [ ] Each working day sums to **exactly 8h logged** (lunch excluded)
- [ ] Every ticket key exists in Jira — look up any unfamiliar/suspicious key first
- [ ] Every ticket `Note` is the **full Jira title** (step 4b) — no `feature` / `fix` / placeholder left behind
- [ ] Polish holidays / PTO excluded from the working-day count (except days the user confirmed they worked)
- [ ] One-offs accounted for in totals
- [ ] No commit left dangling without a ticket key

### 9. Rebalance pass

Before posting anything, give the user a chance to **rebalance ticket time**. Print the per-ticket hour totals for the span (and, for `day`, the single-day breakdown), then ask (`AskUserQuestion`, free-text notes enabled):

> "Rebalance any ticket time before posting? (move hours between tickets, cap/uncap a ticket, merge follow-ups, drop a row)"

Apply whatever the user asks, then **re-verify** each working day still totals exactly 8h logged (lunch excluded) and update the markdown file + totals section accordingly. **Every working day must always total exactly 8h after each rebalance** — if a change leaves a day above or below 8h, do not accept it as-is: redistribute the difference across that day's other tickets (or ask the user where it should go) so the day lands back on 8h before moving on. **After every change, re-print the updated per-ticket totals and ask the rebalance question again** — keep looping until the user explicitly says the balances are fine (or declines on the first prompt). Only then continue to step 10 (and never with a day that isn't exactly 8h).

### 10. Confirm, then post to Clockify + Jira

Once balances are confirmed, ask (`AskUserQuestion`):

> "Balances confirmed. Post time entries now?" — **Both (Clockify + Jira)** / **Jira only** / **Clockify only** / **No**

If **No**, stop here (plan only). Otherwise lay out each day's rows contiguously from **9:00**, skipping the **13:00–14:00 lunch**, to derive a `start`/`end` for every entry (calls/meetings sit at their scheduled time when known; standup 9:00–9:15, PR review 17:30–18:00). Skip rows without a Jira ticket key and flag them.

**Clockify** (`create-clockify-time-entry`): resolve workspace + project/task once via `list-clockify-workspaces`, `get-clockify-user`, `list-clockify-projects`, `list-clockify-tasks`. Post one entry per row with the derived `start`/`end` (local offset, no UTC conversion) and a **short description** — ticket key + a few words, e.g. `ERP-152 Claude commands`, `Call: Daniel`, `Daily standup`.

**Jira timesheet**: post each row through the **worklog** procedure in `${CLAUDE_PLUGIN_ROOT}/commands/jira.md` (the single place issues are worked) — one worklog per row with `timeSpent` (Jira format: `"15m"`, `"30m"`, `"1h"`, `"3h 15m"`, `"7h 15m"`), `started` (local wall-clock timestamp with its local offset, e.g. `2026-05-13T09:00:00.000+02:00` — **not** UTC), and `comment` (the row's short note). That procedure normalises the key (`^[A-Z][A-Z0-9_]+-\d+$`) and strips `-2`/`-3` branch suffixes (`feature/CRMDEV-6335-2` → `CRMDEV-6335`) — for a stripped suffix, log to the base ticket with `comment: "Follow-up (branch X-2)"`.

Report each post inline, tagged by target: `✓ Jira CRMDEV-1366 30m on 2026-05-13 — Call: Daniel`, `✓ Clockify ERP-152 1h on 2026-05-04`. Continue past failures.

### 11. Summary

Print:

- File path
- Span + resolved date range
- Total working days, total hours
- Count of calls, one-offs, merged PRs
- Rebalance edits applied (if any)
- Clockify entries posted + Jira worklogs posted (counts), or "(plan only, not posted)"
- Any `NEEDS REVIEW` rows

## Notes

- This command does **not** post automatically — it writes a markdown plan, lets the user rebalance ticket time, then asks for confirmation before posting to **Clockify** (short descriptions) and the **Jira timesheet**.
- **Always clarify span + period first** (step 0) — ask the month number / ISO week / date+weekday for anything `$ARGUMENTS` left ambiguous, and echo back the resolved date range before doing work.
- **Ticket `Note` = full Jira title.** Resolve every ticket key's `summary` via the Jira MCP (step 4b) and use it verbatim in both the daily-log `Note` column and the **Ticket titles** reference section — never `feature` / `fix` / a paraphrase.
- Strip `-2`/`-3` suffixes from branch names when matching to ticket keys (`feature/CRMDEV-6335-2` → `CRMDEV-6335`).
- The workday is **9:00–18:00 with a 1h unlogged lunch (13:00–14:00) = 8h logged**. Lunch is shown as a `_Lunch_` row but never counts toward the 8h. Each day must total exactly 8h logged after recurring entries; if remainders don't fit cleanly, ask the user how to split.
- **Per-worklog 1h cap:** small admin / Claude-command / config tickets are capped at 1h per worklog; reallocate freed hours to other same-day tickets and list the capped tickets in the day header and totals cap note.
- Calls and meetings are overhead, logged under CRMDEV-1366 as separate rows with `Call:` / `Meeting:` prefixes (standup is `Meeting: Daily standup`).
- **Weekend / compensatory days carry no standup and no PR review** — drop both rows, reallocate the freed 0.75h to that day's tickets (still 8h), note `no standup/PR review` in the day header, and count only weekday days in the standup/PR-review totals buckets.
- Worklog `started` timestamps are posted in **local wall-clock time with the local offset** (no UTC conversion).
- Working days exclude **Polish** public holidays, except holidays the user confirms they worked (asked as a multi-select in step 6).
- **Jira MCP can only create worklogs — not update or delete them.** If a worklog is posted with the wrong time/date, fix it manually in the Jira UI; re-running won't overwrite it.
- Teams calls/meetings (step 5) are read from the **signed-in** Teams web app via the Chrome DevTools MCP attached to the local debug Chrome (`--remote-debugging-port=9222`). If that browser isn't running or signed in, the step is skipped gracefully and step 6 falls back to asking the user. Teams calendar events live inside an Outlook iframe, and durations/dates come from each event's accessibility label — not from any API.
