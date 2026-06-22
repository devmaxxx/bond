---
description: Create, edit, assign, comment on, or transition a Jira issue — assigned to you by default
---

# /bond:jira

One command for working with Jira issues directly from the terminal: create a new
issue, edit fields on an existing one, (re)assign it, add a comment, or move it
through its workflow. It reads the intent from natural-language `$ARGUMENTS`,
picks the operation, fills the obvious fields, and acts — without a wall of
prompts.

**Assignee defaults to you.** Any issue this command creates, and any `assign`
that does not name someone else, is assigned to the current Atlassian user. Pass
an explicit person (`assign to Daniel`, `--assignee "Daniel Berg"`) to override,
or `--unassigned` to leave it unassigned.

This command runs **autonomously** (see the autonomy note in
`${CLAUDE_PLUGIN_ROOT}/shared/implement-flow.md`): when a field is ambiguous but
has a sensible default, choose it and report what you chose — do not stop to ask.
Only a genuine blocker (no project resolvable for a create, issue not found, tool
error) pauses or aborts.

## Arguments

`$ARGUMENTS` — a free-text request, optionally leading with an operation verb and
an issue key. There is no rigid grammar; infer the operation from the wording.

Examples:

- `/bond:jira create a Bug in ERP: login page 500s on submit`
- `/bond:jira create Task "Wire up the export endpoint" --project CRMDEV`
- `/bond:jira ERP-142 assign to me`
- `/bond:jira ERP-142 assign to Daniel Berg`
- `/bond:jira ERP-142 set priority High, add label regression`
- `/bond:jira comment on ERP-142: deployed to staging, ready for QA`
- `/bond:jira move ERP-142 to In Review`

### Flags (optional, override inferred values)

- `--project <KEY>` — project key for a create when not given in the text.
- `--type <Type>` — issue type for a create (`Task`, `Bug`, `Story`, …).
- `--assignee "<name>"` — assign to this person instead of you.
- `--unassigned` — leave the issue unassigned (create or assign).

## Setup (run once per invocation)

1. Resolve the Atlassian `cloudId` via
   `mcp__bond-atlassian__getAccessibleAtlassianResources` — the resource matching
   `bonliva.atlassian.net`.
2. Resolve **your** account: `mcp__bond-atlassian__atlassianUserInfo` → keep
   `account_id` (and display name). This is the default assignee.

## Step 1 — Determine the operation

Read `$ARGUMENTS` and classify into exactly one of:

- **create** — wording like *create / new / open / file a `<type>`*, or no issue
  key is present and a summary is being described.
- **assign** — *assign / reassign / give to*, or a bare key plus `--assignee` /
  `--unassigned`.
- **comment** — *comment / note / say*, usually `comment on <KEY>: <text>`.
- **transition** — *move / transition / mark / set status / move to `<status>`*.
- **worklog** — *log / log time / worklog / book `<time>`* against a key.
- **get** — *show / read / get / fetch / open `<KEY>`* (read-only field fetch).
- **edit** — any other field change on an existing key (*set priority*, *add
  label*, *change summary*, *update description*, *set due date*, …).

If a single message clearly asks for two things (e.g. *create … and assign to
Daniel*), do both: run **create**, then apply the rest to the new key.

Extract the issue **key** (`^[A-Z]+-\d+$`) when the operation targets an existing
issue. If an existing-issue operation has no key, that is a blocker — ask for the
key and stop.

## Step 2 — Execute

### create

1. **Project:** from `--project`, else the `ERP-`-style prefix in the text, else
   an explicit project name. If still unknown, call
   `mcp__bond-atlassian__getVisibleJiraProjects({ cloudId, action: "create" })`;
   if exactly one is returned, use it, otherwise list the candidates and ask
   which (a real blocker — no safe default).
2. **Type:** from `--type` or the verb (*a bug* → `Bug`); default `Task`.
3. **Summary:** the quoted string, or the descriptive clause after the type.
4. **Description:** any remaining detail, as Markdown (`contentFormat:
   "markdown"`). Omit if there is none.
5. **Assignee:** your `account_id` from setup, unless `--assignee` (look it up,
   see *Resolving a person* below) or `--unassigned`.
6. Call `mcp__bond-atlassian__createJiraIssue({ cloudId, projectKey,
   issueTypeName, summary, description?, assignee_account_id?, contentFormat:
   "markdown" })`. Put priority / labels / components from the text into
   `additional_fields` (e.g. `{ "priority": { "name": "High" }, "labels":
   ["regression"] }`).
7. Report the new key and its browse URL
   (`https://bonliva.atlassian.net/browse/<KEY>`).

### assign

1. Target = your `account_id`, unless a person is named (or `--assignee`) → see
   *Resolving a person*; or `--unassigned` → set assignee to `null`.
2. `mcp__bond-atlassian__editJiraIssue({ cloudId, issueIdOrKey: KEY, fields: {
   assignee: { id: <account_id-or-null> } } })`.
3. Report who it was assigned to.

### comment

1. Body = the text after the colon / the comment clause.
2. `mcp__bond-atlassian__addCommentToJiraIssue({ cloudId, issueIdOrKey: KEY,
   commentBody, contentFormat: "markdown" })`.
3. Report that the comment was added.

### transition

The workflow is a **linear chain** — `Todo` → `In Progress` → `In Review` →
`QA` — and Jira only offers a transition to the *next* (or an adjacent) status,
not an arbitrary jump. To reach a target that is several steps ahead, **walk the
chain one hop at a time**, re-reading the available transitions after each move.

1. Read the issue's current status (`mcp__bond-atlassian__getJiraIssue` →
   `fields.status.name`). If it already equals the requested target, say so and
   stop.
2. Loop until the status equals the target (or a hop fails):
   1. `mcp__bond-atlassian__getTransitionsForJiraIssue({ cloudId, issueIdOrKey:
      KEY })`.
   2. **Direct hop first:** if a transition's `name`/target status matches the
      requested target (case-insensitive contains), take it — done.
   3. **Otherwise advance toward the target:** order the available transitions by
      the chain above and pick the one that moves *forward* one step toward the
      target (e.g. target `QA` from `Todo` → take `In Progress`, then `In
      Review`, then `QA`). Never step past the target or backward.
   4. `mcp__bond-atlassian__transitionJiraIssue({ cloudId, issueIdOrKey: KEY,
      transition })`, then re-read the status for the next iteration.
3. If at any hop no transition advances toward the target (chain dead-ends, or
   the target name doesn't match any reachable status), list the statuses
   actually reachable from here and ask — do not force an unrelated transition.
4. Report the path taken, e.g. `ERP-142: Todo → In Progress → In Review → QA`.

### worklog

Log time against an issue's timesheet.

1. Normalise the key: it must match `^[A-Z][A-Z0-9_]+-\d+$`. Strip branch-style
   suffixes (`feature/CRMDEV-6335-2` → `CRMDEV-6335`); note the stripped suffix
   in the comment when relevant.
2. `mcp__bond-atlassian__addWorklogToJiraIssue({ cloudId, issueIdOrKey: KEY,
   timeSpent, started, comment })`:
   - `timeSpent` — Jira format: `"15m"`, `"30m"`, `"1h"`, `"3h 15m"`, `"7h 15m"`.
   - `started` — local wall-clock timestamp **with its local offset**, e.g.
     `2026-05-13T09:00:00.000+02:00`. Do **not** convert to UTC.
   - `comment` — the short note for the entry.
3. Report the post, e.g. `✓ Jira CRMDEV-1366 30m on 2026-05-13 — Call: Daniel`.

### get

Read-only fetch of an issue's fields.

1. `mcp__bond-atlassian__getJiraIssue({ cloudId, issueIdOrKey: KEY })`.
2. Extract and report `fields.summary`, `fields.issuetype.name`,
   `fields.status.name`, `fields.priority.name`, `fields.assignee.displayName`,
   and `fields.description` rendered as plain text (ADF). Add `fields.labels`,
   `fields.duedate`, or `fields.comment.comments` when the request asks for them.
3. Callers that need richer data (attachments/images, full comment threads) pass
   the field list they want; return those fields rather than re-deriving them.

### edit

1. Build a `fields` object from the requested changes:
   - `summary` — string.
   - `description` — Markdown string with `contentFormat: "markdown"`.
   - `priority` — `{ name: "High" }`.
   - `labels` — full replacement array; to **add** a label, read current labels
     via `mcp__bond-atlassian__getJiraIssue` first and append.
   - `duedate` — `YYYY-MM-DD`.
   - assignee changes → use the **assign** path instead.
2. `mcp__bond-atlassian__editJiraIssue({ cloudId, issueIdOrKey: KEY, fields,
   contentFormat: "markdown" })`.
3. Report the fields that changed.

### Resolving a person

For `--assignee "<name>"` or *assign to <name>*: call
`mcp__bond-atlassian__lookupJiraAccountId({ cloudId, searchString: name })`. Use
the single match's `account_id`. If several match, pick the closest by display
name and report the choice; if none, surface that and stop (do not silently fall
back to yourself).

## Do NOT

- Do not ask which field to set when the text already says — infer and act.
- Do not assign to someone else by default — the default is always **you**; only
  a named person or `--assignee` changes that.
- Do not create a duplicate when the request targets an existing key — edit it.
- Do not jump-transition: walk the chain one hop at a time to the requested
  status, and never step past it or backward.
