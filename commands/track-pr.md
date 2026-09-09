---
description: Watch a PR's CI (Bitbucket Pipelines or GitHub Actions), push a desktop notification when it finishes, and (on success) trigger the review request where the project has one
---

# /bond:track-pr

Polls the CI attached to a pull request's latest commit and sends a desktop push
notification when it transitions out of running (success, failure, stopped, or
error). Self-paced — the command schedules its own wake-ups via the `loop` skill,
so you can fire it once and walk away. The host comes from the project profile,
so it watches Bitbucket Pipelines and GitHub Actions alike.

## Input

`$ARGUMENTS` — a PR number (e.g. `444`) or a full PR URL on either host
(`https://bitbucket.org/<ws>/<repo>/pull-requests/<id>`,
`https://github.com/<owner>/<repo>/pull/<id>`). If empty, ask the user which PR
before doing anything else.

Optional flag:

- `--no-review` — do **not** trigger the review request when the pipeline passes
  (step 6). By default, a passing pipeline chains into `/bond:request-review`.

## Steps

### 1. Resolve the PR coordinates

Run the **Resolve PR coordinates** procedure in
`${CLAUDE_PLUGIN_ROOT}/shared/project-profile.md`. A bare number takes its host
and workspace from the project profile rather than assuming Bonliva.

### 2. Fetch PR details

Run the **PR details and CI status** procedure in the same file. Extract:

- `title`
- the PR state — if it is merged or closed/declined, stop and tell the user there
  is nothing to track.
- the head commit SHA, which identifies the CI run.
- source and destination branch — only for the final report.

### 3. Look up the CI status

The same procedure normalises both hosts to **running** / **passed** / **failed**;
treat "no run found yet" as `pending`. Capture the run's URL for the
notification — the commit status `url` on Bitbucket, the check's `link` on
GitHub.

### 4. Decide what to do next

- **`running` or `pending`** — schedule another check.
  1. Briefly tell the user: `Pipeline still running for PR #<id> (<short-sha>) — checking again in 60s.`
  2. Invoke the `loop` skill with a **fixed 60-second** delay (`ScheduleWakeup`
     with `delaySeconds: 60`). Pass the same `/bond:track-pr <ARGS>` invocation
     back so the next firing repeats this command.
  3. Stop — the next firing will resume from step 1.
- **`passed` or `failed`** — go to step 5.

### 5. Notify on completion

Send a desktop notification via the `PushNotification` tool with a short, scannable
message. Examples:

- Success: `✅ PR #<id> checks passed — <title>` with the PR URL as the link.
- Failure: `❌ PR #<id> checks failed — <title>` with the run URL as the link
  (the user wants to jump straight to logs).

If `PushNotification` is unavailable in the current session, fall back to printing
the message inline and surface the limitation.

### 6. Trigger the review request on success (default)

Skipped entirely when the project profile resolves no `TEAMS_CHANNEL` — outside
Bonliva there is no channel to invite anyone in. Say it was skipped rather than
posting a personal repo's PR into a work channel.

If the final state is **`passed`** and the user did **not** pass `--no-review`:

1. Invoke the `/bond:request-review <PR>` command for the same PR — reuse the
   resolved coordinates (or pass the original `$ARGUMENTS`).
2. That command resolves pending reviewers, builds the Teams card, and **asks for
   confirmation before posting** — so this chain never sends an invite silently.
3. If a request-review prerequisite is missing (e.g. `BOND_TEAMS_WEBHOOK_URL` is
   not set), surface it and continue — the pipeline notification has already gone
   out.

On **`failed`**, skip this step — a red pipeline is not ready for review. If
`--no-review` was passed, skip regardless of outcome (mention it was skipped).

### 7. Report and stop the loop

After the notification:

1. Print a single-line summary to the user: status emoji, PR #, title, branch,
   final pipeline URL.
2. **Do not** call `loop` / `ScheduleWakeup` again — the work is done. Returning
   without scheduling a wake-up terminates the self-paced loop.

## Do NOT

- Do not vary the poll interval — always 60 seconds. Simple and predictable.
- Do not send more than one notification per run — only the final state is worth
  a ping.
- Do not start tracking a PR that is merged or closed — there is no live run to
  watch.
- Do not branch on a host-specific status string outside the shared procedure —
  that is how the Bitbucket assumption got baked in the first time.
