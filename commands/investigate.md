---
description: Investigate a production/staging failure end to end (Temporal run, API error, broken page) and write up the result as a doc for the team or QA
---

# /bond:investigate

Something failed in a deployed environment and nobody knows why: a Temporal
workflow ended with a useless message, a page shows a generic error, an activity
returned `HTTP 4xx`, a job stopped producing output. This command runs the
investigation to a **root cause backed by evidence** and produces a written
investigation doc that a colleague — including QA, who cannot read the code —
can act on.

It never guesses in the write-up: every claim in the doc is either something the
command verified, or is explicitly labelled as an open question with the next
step that would close it.

## Arguments

`$ARGUMENTS` — anything that identifies the failure, in any mix:

- a URL to the failing entity (CRM/ERP page, admin page)
- a Temporal workflow/run URL
- a Jira issue key
- a raw error string, screenshot, or "the kit failed for booking X"

If nothing usable is given, ask for the environment and one identifier before
doing anything else.

### Flags

- `--no-write` — read-only mode: never run a probe that mutates state, not even
  after confirmation. Use when investigating production.
- `--jira` — after the doc is written, file a Bug with `/bond:bug` (or
  `mcp__bond-atlassian__createJiraIssue`) linking the doc's findings.
- `--artifact` — publish the doc as an Artifact and hand back the link (default
  when the doc is meant for someone else, e.g. QA).

## Rules

1. **Read-only first.** Every probe that mutates state — POSTing the endpoint
   that failed, retrying the workflow from the UI, re-running a job — needs
   explicit user confirmation naming what it will write. Never mutate production
   without it, and honour `--no-write` absolutely.
2. **Never enter credentials, never forge tokens.** Use credentials that already
   exist in the environment (`.env`, an authenticated browser session, `az`
   login). If a step needs a credential you don't have, stop and say which one.
3. **Never print secrets.** Read `.env` values inside a script; don't echo
   connection strings, tokens, or the contents of container-app env vars.
4. **Evidence beats plausibility.** A theory that "explains" the symptom is not a
   finding until a probe, a log line, or a database row confirms it. Reaching
   three failed hypotheses means the model of the system is wrong — re-derive it
   from the code rather than trying a fourth.

## Steps

### 1. Pin the coordinates

Write down, and keep in the final doc: environment (dev/staging/production),
entity ids, the exact UTC timestamp of the failure, the exact error text, and
the user-visible symptom. Take a screenshot of the failing page if there is one.

### 2. Read the symptom at the source

- **Temporal** — open the run's `/history` page and read it with
  `mcp__claude-in-chrome__get_page_text` (the UI's own `/api/v1/...` JSON
  endpoints reject a hand-made fetch; the rendered page carries every event's
  input and result). Note the failing activity, its **input**, its **result**,
  and how long it ran — the duration tells you how far into the activity the
  failure happened.
- **Find a comparable success.** Filter the workflow list by type
  (`?query=WorkflowType%3D"<type>"`) and read a run that completed cleanly.
  Diffing a good run against the bad one usually names the variable.
- **App UI** — what does the operator actually see? That text is what the ticket
  will be filed under.

### 3. Map the error string to the code

Find every branch that can produce that exact status/message: the activity, the
service it calls, the controller that answers, and the error-mapping middleware
on both sides. `mcp__gitnexus__query` locates the flow faster than grepping;
`grep -rn` is the authority on who calls what (the graph misses barrel
re-exports).

Enumerate the branches explicitly — "a 404 here can only come from A, B, or the
exception filter C" — because the investigation is now the job of eliminating
them, not of imagining new ones.

### 4. Collect ground truth

Pick the cheapest source that eliminates a branch:

- **Database** — the repo's `.env` usually points at the environment's Mongo
  (`CRM_MONGO_CONN` / `CRM_MONGO_DB`). Run a **read-only** node script from the
  repo root (so `node_modules` resolves) that loads `.env` itself and prints
  only the fields you need.
- **Live read-only endpoints** — `curl` the service's own GET routes and
  `/swagger/v1/swagger.json`. Internal APIs are often reachable without auth
  from outside; the swagger tells you whether the deployed build matches the
  code you are reading.
- **Deploy timeline** — `az containerapp revision list -n <app> -g <rg>` gives
  image tag and revision creation time. Correlate "worked at T1, failed at T2"
  with the revision that came between, and with `git log` on the deployed
  branch. A failure that starts at a deploy and one that starts with a data
  change need different fixes.
- **Logs** — Grafana/Loki via `GRAFANA_API_TOKEN`, Sentry via
  `SENTRY_AUTH_TOKEN`, Azure Log Analytics
  (`az monitor log-analytics query -w <workspace-id>`). Say so in the doc when a
  log source turned out to be unavailable — a missing token is a finding too.

### 5. Discriminate with controlled probes

Design each probe so its two possible outcomes eliminate different branches, and
prefer the variant that writes nothing. A control probe (the same call with a
deliberately invalid id) is the cheapest way to learn what each failure mode
*looks like* before interpreting the real one.

When only a mutating probe can settle it, ask first — state the endpoint, the
payload, and what it will create or change if it succeeds.

### 6. Write the doc

Structure, in this order:

1. **TL;DR** — one paragraph: what failed, what the root cause is, what it means
   for the user. QA reads this and nothing else.
2. **Symptom** — what the operator sees, with the screenshot and the exact
   strings (both languages if the UI is localised).
3. **Reproduction** — the shortest command or click-path that shows the failure,
   with its actual output. Mark it read-only or state what it writes.
4. **Timeline** — UTC timestamps: last known good, deploys in between, failure.
5. **Evidence** — a table of probe → result → what it rules out.
6. **Root cause** — the chain, each hop with `file:line`.
7. **Contributing code issues** — separate from the root cause: error handling
   that hid it, a message that told the operator nothing, a missing retry.
8. **Open questions** — what is *not* proven, and the exact next step for each.
9. **Suggested fixes** — one bullet per change, smallest first, with the
   file it lands in.

Keep it in the environment's language for the operator-facing strings and in
English for the technical text. Save it under a path the repo's docs sync
excludes (in Bonliva repos: `docs/plans/`), or in the scratchpad if it should
not land in the repo at all.

### 7. Hand it over

Publish as an Artifact (`--artifact` or when the audience is someone else) and
give the user the link plus the local path. With `--jira`, file the Bug and put
the doc link in the description.

## Anti-patterns

- Reporting "probably X" as the cause. Either prove it or file it under open
  questions.
- Fixing code mid-investigation. This command investigates; `/bond:implement`
  or `/bond:fix-qa` does the fix, using the doc as its input.
- Re-running the failing action "to see what happens" before checking what it
  writes.
- Dumping raw logs into the doc. Quote the two lines that matter.
