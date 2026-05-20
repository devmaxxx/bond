---
description: Watch a Bitbucket PR pipeline and push a desktop notification when it finishes
---

# /bond:track-pr

Polls the Bitbucket pipeline attached to a pull request's latest commit and sends
a desktop push notification when it transitions out of running (success, failure,
stopped, or error). Self-paced — the command schedules its own wake-ups via the
`loop` skill, so you can fire it once and walk away.

## Input

`$ARGUMENTS` — a PR number (e.g. `444`) or a full Bitbucket PR URL
(`https://bitbucket.org/<ws>/<repo>/pull-requests/<id>`). If empty, ask the user
which PR before doing anything else.

## Steps

### 1. Resolve the PR coordinates

- **Full URL** — parse `workspace`, `repo_slug`, and `pull_request_id` from it.
- **Bare number** — `workspace` is `bonliva`; derive `repo_slug` from
  `git remote get-url origin` of the current repo; `pull_request_id` is the number.

### 2. Fetch PR details

Call `mcp__bond-bitbucket__get_pull_request` with the resolved coordinates.
Extract:

- `title`
- `state` — if `MERGED` or `DECLINED`, stop and tell the user there is nothing
  to track.
- `source.commit.hash` — the latest commit SHA on the source branch (used to
  identify the pipeline run).
- `source_branch`, `destination_branch` — only for the final report.

### 3. Look up the pipeline status

Use `mcp__bond-bitbucket__get_commit_statuses` with `workspace`, `repo_slug`,
and the commit hash from step 2.

From the returned statuses, pick the most recent Bitbucket Pipelines status
(`type == "build"` and `key`/`name` starts with `Pipeline`). If none exists,
fall back to `mcp__bond-bitbucket__list_pipeline_runs` filtered by the source
branch and take the newest run whose `target.commit.hash` matches.

Map the result to a normalised state:

| Status from API                 | Normalised |
|---------------------------------|------------|
| `INPROGRESS` / `PENDING` / `BUILDING` | `running` |
| `SUCCESSFUL` / `COMPLETED` (with successful result) | `success` |
| `FAILED` / `STOPPED` / `ERROR` / `COMPLETED` (with failed result) | `failed` |
| no pipeline found yet           | `pending` |

Capture the pipeline URL (`url` on the commit status, or built from the run UUID)
for the notification.

### 4. Decide what to do next

- **`running` or `pending`** — schedule another check.
  1. Briefly tell the user: `Pipeline still running for PR #<id> (<short-sha>) — checking again in 60s.`
  2. Invoke the `loop` skill with a **fixed 60-second** delay (`ScheduleWakeup`
     with `delaySeconds: 60`). Pass the same `/bond:track-pr <ARGS>` invocation
     back so the next firing repeats this command.
  3. Stop — the next firing will resume from step 1.
- **`success` or `failed`** — go to step 5.

### 5. Notify on completion

Send a desktop notification via the `PushNotification` tool with a short, scannable
message. Examples:

- Success: `✅ PR #<id> pipeline passed — <title>` with the PR URL as the link.
- Failure: `❌ PR #<id> pipeline failed — <title>` with the pipeline URL as the
  link (the user wants to jump straight to logs).

If `PushNotification` is unavailable in the current session, fall back to printing
the message inline and surface the limitation.

### 6. Report and stop the loop

After the notification:

1. Print a single-line summary to the user: status emoji, PR #, title, branch,
   final pipeline URL.
2. **Do not** call `loop` / `ScheduleWakeup` again — the work is done. Returning
   without scheduling a wake-up terminates the self-paced loop.

## Do NOT

- Do not vary the poll interval — always 60 seconds. Simple and predictable.
- Do not send more than one notification per run — only the final state is worth
  a ping.
- Do not start tracking a PR that is `MERGED` or `DECLINED` — there is no live
  pipeline to watch.
