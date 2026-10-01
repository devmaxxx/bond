---
description: Sync Jira with your PRs — merged ⇒ QA (+ fixVersion), open ⇒ In Review — and optionally post a manual QA test plan on each ticket
---

# /bond-bonliva:jira-sync

> **Needs a Jira tracker.** Resolve the project profile
> (`${CLAUDE_PLUGIN_ROOT}/shared/project-profile.md`) first. Under
> `TRACKER=none`, say the repo has no tracker and stop.

End-of-day bookkeeping in one pass: find the PRs you merged, move their tickets
to **QA**, stamp the release **fixVersion**, move tickets whose PR is still open
(and not a draft) to **In Review**, and — with `--qa-plan` — leave QA a test plan
they can follow without reading code.

Every Jira write here is visible to QA and the team, so the whole batch is shown
as one table and confirmed **once** before anything is written.

## Usage

```
/bond-bonliva:jira-sync [--since <days|date>] [--fix-version <v>] [--qa-plan] [--dry-run] [--yes]
```

Examples:
- `/bond-bonliva:jira-sync` — today's merged PRs ⇒ QA.
- `/bond-bonliva:jira-sync --fix-version 1.38.0`
- `/bond-bonliva:jira-sync --since 3 --qa-plan`
- `/bond-bonliva:jira-sync --since 2026-09-28 --dry-run`

## Flags

- `--since <days|date>` — default `1`. An integer `N` means *since local
  midnight N−1 days ago* (`1` = today, `2` = yesterday and today); a
  `YYYY-MM-DD` date means since that day's local midnight.
- `--fix-version <v>` — set this fixVersion on every ticket moved to QA. Without
  it, derive it per PR from a `release/x.y.z` base branch; any other base ⇒ no
  fixVersion (never guess one from `dev`/`main`).
- `--qa-plan` — post a manual QA test plan comment on each ticket moved to QA
  (Step 6).
- `--dry-run` — print the plan table and stop. Nothing is written.
- `--yes` — skip the single batch confirmation.

## Steps

### 1. Setup

1. Resolve the profile → `HOST`, `WORKSPACE`/`OWNER`, `REPO_SLUG`, `TRACKER`.
2. Run the **Setup** of `${CLAUDE_PLUGIN_ROOT}/shared/jira.md` → `cloudId` and
   your `account_id`. Bitbucket uses the same Atlassian `account_id`, so it also
   identifies your PRs there.
3. Turn `--since` into an ISO timestamp `SINCE` (local midnight, with offset).

### 2. Collect your PRs

Scope is the repo in front of you. Collect two sets:

**Merged since `SINCE`:**
- GitHub:
  ```sh
  gh pr list --author @me --state merged --search "merged:>=<YYYY-MM-DD>" --limit 100 \
    --json number,title,headRefName,baseRefName,mergedAt,url,body
  ```
  with `<YYYY-MM-DD>` the day **before** `SINCE`'s date: GitHub's `merged:`
  qualifier compares UTC dates, so a local-midnight window east of UTC would
  miss early-morning merges. Then drop any whose `mergedAt` < `SINCE`.
- Bitbucket: `mcp__bond-bitbucket__get_pull_requests({ workspace, repo_slug,
  state: "MERGED", page_size: 50, max_pages: 2 })`, keep
  `author.account_id == account_id` and `updated_on >= SINCE` (a merged PR's
  last update is its merge, close enough for a day window).

**Open and not draft** — same calls with `--state open` / `state: "OPEN"`,
filtered to yours, dropping `isDraft` / `draft: true`. A draft is not ready for
review, so its ticket stays where it is — keep the dropped drafts' keys for
Step 3.

Nothing in either set ⇒ say so (with the window searched) and stop.

### 3. Map PRs to tickets

1. Extract keys from the **title first, then the source branch**, matching the
   configured project keys (see `shared/pr-template.md` in bond).
   Strip branch suffixes (`CRMDEV-6335-2` → `CRMDEV-6335`).
2. A PR with no key goes to a **Skipped** list — never guess a ticket from the
   PR's wording.
3. Group by ticket. Target status:
   - every PR for it merged ⇒ **QA**, unless one of your PRs for the same key is
     still open as a draft — then leave it where it is, the work is not all in;
   - any PR still open (non-draft) ⇒ **In Review** — the work is not all in yet.
4. fixVersion (QA tickets only): `--fix-version`, else `x.y.z` from a
   `release/x.y.z` base. Two merged PRs into different release branches ⇒ list
   both versions and flag it in the table instead of picking one.

### 4. Read each ticket and build the plan

`mcp__bond-atlassian__getJiraIssue` → `status`, `assignee`, `fixVersions`,
`summary`. Per ticket:

- **Transition** — only forward along the chain in `shared/jira.md`
  (`Todo → In Progress → In Review → QA`). Already at or past the target
  (`QA`, `Done`, `Closed`, a release status) ⇒ no transition; never move a
  ticket backward.
- **fixVersion** — append to the existing `fixVersions`; already present ⇒ no-op.
  Never remove a version someone else set.
- **Assignee** — never changed. A ticket held by someone else is still synced,
  but its row is marked `held by <name>` so you see whose board it lands on.
- **QA comment** (`--qa-plan`) — the drafted comment from Step 6, or `—`.

Print the plan:

| Ticket | Summary | PR(s) | Status | fixVersion | QA comment | Note |
|---|---|---|---|---|---|---|
| ERP-142 | Export endpoint | #318 merged | In Review → QA | + 1.38.0 | test plan | |
| ERP-150 | Rename cache | #321 open | In Progress → In Review | — | — | held by Daniel |

Then the **Skipped** list (PRs without a key, tickets not found).

`--dry-run` ⇒ stop here. Otherwise ask **once** with `AskUserQuestion` — apply
all / pick tickets / abort — unless `--yes`.

### 5. Apply

For each confirmed ticket, continuing past individual failures:

1. **Transition** with the **transition** procedure in
   `${CLAUDE_PLUGIN_ROOT}/shared/jira.md` (walk the chain one hop at a time).
2. **fixVersion** — `mcp__bond-atlassian__editJiraIssue({ cloudId, issueIdOrKey,
   fields: { fixVersions: [...existing, { name: "<v>" }] } })`. Jira rejects a
   version that does not exist in the project: report it and move on — creating
   a release version is a release manager's call, not this command's.
3. **QA comment** — `addCommentToJiraIssue` with `contentFormat: "markdown"`.

### 6. QA test plan (`--qa-plan`)

QA cannot run or read code. The comment must be something a non-developer can
follow in the browser.

**Sources:** the PR's `## Test plan` section, the PR summary, and the diff
(`gh pr diff <id>`, or the Bitbucket MCP's PR diff) — the diff tells you which
screens, fields and messages actually changed.

**Skip duplicates:** read the ticket's comments first; a `QA test plan` comment
that already names this PR ⇒ don't post another.

**If the change is visible in the UI:**

```markdown
**QA test plan** — PR <link>

**Where:** <environment> → <page / menu path>
**Before you start:** <account role, data that must exist>

1. <one action per step, in UI words: "Open…", "Click Save", "Type 0 in Quantity">
2. …

**Expected:** <what appears, in the words on screen>
**Also check:** <edge cases: empty value, wrong value, another role>
```

No code, commands, API calls, database queries or file names — name buttons,
fields and messages exactly as they read on screen.

**If it is not observable in the UI** (refactor, background job, internal API,
performance):

```markdown
**QA test plan** — PR <link>

Not testable via UI — verified by <the tests or CI checks that cover it>.
<one line on what a user could notice if it broke, if anything>
```

**Out-of-scope findings:** while reading the diff, collect real issues outside
the PR's scope (a bug next door, a missing validation). List them after the
batch as proposed follow-up tickets — summary + one-line why — and **ask before
creating any**. Create the accepted ones through the **create** path of
`shared/jira.md`, linked from a comment on the source ticket.

### 7. Report

One line per ticket — the transition path taken, fixVersion set, comment
posted — then failures, skipped PRs, and any follow-up tickets created.

## Do NOT

- Do not write to Jira before the batch is shown and confirmed (or `--yes`).
- Do not reassign a ticket — not to you, not away from whoever holds it.
- Do not move a ticket backward, or past QA.
- Do not move a ticket to In Review for a draft PR.
- Do not invent a fixVersion from a non-release branch, and do not create
  versions in Jira.
- Do not put code, commands or file paths in a UI test plan.
- Do not create follow-up tickets without asking.
