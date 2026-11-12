---
description: Fetch (or create) a Jira ticket — or take a free-text task in a repo with no tracker — then create a typed branch, write an implementation plan, and implement it
---

# /implement

**Ask first.** Before the first write, one `AskUserQuestion` with every decision `$ARGUMENTS` leaves open — none when they settle it all (standing rule *Commands ask first*).

Full ticket-to-implementation workflow: fetch one or more Jira tickets (or **create one** when you have none yet), create a properly-named branch in an isolated worktree, analyse the codebase, write a concrete implementation plan, implement it, ship, open the PR, and tear the worktree down. By default it runs end-to-end without pausing; pass `--no-auto` to confirm the plan first or `--no-worktree` to work in the current tree.

Everything except the four decisions unique to this command — creating a ticket when none is given, parsing multiple ticket IDs, the branch-prefix rule, and writing a fresh plan — is delegated to the shared procedures in `${CLAUDE_PLUGIN_ROOT}/shared/implement-flow.md`. Read that file; the steps below name the procedures to run and the inputs to set.

## Arguments

`$ARGUMENTS` — **either** one or more existing Jira ticket IDs (space-separated), **or** a free-text summary of work that has no ticket yet — plus optional flags.

Examples:
- `/implement ERP-135`
- `/implement ERP-135 ERP-136`
- `/implement ERP-135 --no-auto`
- `/implement ERP-135 --no-worktree`
- `/implement add a CSV export to the reports page` — creates a Task, then implements it
- `/implement login page 500s on submit --bug` — creates a Bug, then implements it
- `/implement "wire up export endpoint" --task --project CRMDEV`
- `/implement --spec docs/specs/csv-export.md` — implements a written spec (under `TRACKER=jira` it creates a Task named after the spec)
- `/implement ERP-135 --spec docs/specs/csv-export.md` — the ticket plus a spec that refines it
- `/implement --spec docs/specs/auth.md --review-plan` — stops at the plan for approve / edit / stop, then runs on to the PR
- `/implement --spec docs/specs/auth.md --checkpoints` — pauses after every phase
- `/implement --resume` — continues the stopped run of the current branch from its next phase
- `/implement --resume feat/auth --from "Tests first"` — runs that phase again, then the ones after it

### Flags

By **default** `/implement` runs in **worktree mode** and **auto mode**: it creates an isolated git worktree, skips the plan confirmation prompt, runs ship + open-pr after implementation, then hands the new PR to a background `bond:pr-audit` agent — a fresh context that runs the code and security review pair once, fixes what it finds and removes the worktree when it is done.

- `--no-worktree` — switch branches in the current working tree instead of a worktree (requires a clean tree).
- `--no-auto` — confirm the plan before implementing, and stop after implementation (the shared Ship + PR and Teardown procedures are skipped; the worktree is left in place).
- `--review-plan` — stop once the plan is written and reviewed: **Approve**, **Edit** (say what to change, or edit `PLAN_FILE` yourself and reply `approved`) or **Stop**. After approval the run goes on as in auto mode — build, PR, audit. Differs from `--no-auto`, which also stops after implementation.
- `--checkpoints` — pause after every phase (see **Progress and checkpoints**) with **Continue**, **Stop** or a note to apply first. Implies `--review-plan`.
- `--resume [<branch>]` — continue a run that stopped (a checkpoint's Stop, a pause file, an interrupt) from the phase its progress file names, with the flags it started with. Skips steps 1–4; the plan file is re-read, so edits made while it was stopped count. `--from "<phase>"` (a name from the progress file, as the bond-cockpit ↻ button sends it) starts at that phase instead and marks it and every later phase `todo` first.
- `--spec <path>` — a Markdown spec in the repo (goal, requirements, acceptance criteria, Definition of Done). It is read whole as the source of the requirements, the plan links it, and its acceptance criteria drive **Tests first** and **Converge**. A path that does not exist aborts the run before anything is written.
- `--base <branch>` — cut the new branch off `origin/<branch>` and target the PR at it. When omitted, the base comes from the project profile (`${CLAUDE_PLUGIN_ROOT}/shared/project-profile.md`): the repo's `.bond/project.json`, the Bonliva slug table inside Bonliva, otherwise the remote's own default branch. Use the flag to override, e.g. `--base develop`.

Flags that only apply when **creating** a ticket (no key given — see step 1):
- `--task` — create the new issue as a **Task** (this is the default type).
- `--bug` — create the new issue as a **Bug**.
- `--project <KEY>` — project for the new issue when it can't be inferred.

Strip all flags from `$ARGUMENTS` before parsing the remaining tokens.

## Steps

### 1. Parse ticket IDs — or create a ticket

Resolve the **project profile** first
(`${CLAUDE_PLUGIN_ROOT}/shared/project-profile.md`). Under `TRACKER=none` there
is no Jira to read, create in, or transition: treat **all** of `$ARGUMENTS` as
the free-text description of the work (with `--spec` and no text left, the
spec's first heading is the description), set `TICKET_IDS` empty, run the shared
**Check for blockers** procedure on that text, skip the rest of step 2, and
continue at step 3. Report `--project` / `--task` / `--bug` as
ignored rather than silently dropping them.

The rest of this step is the `TRACKER=jira` path. After stripping flags, look at
the remaining tokens:

- **All tokens match `^[A-Z]+-\d+$`** → existing-ticket path. These are `TICKET_IDS`. (If some tokens look like keys and others don't, report the invalid ones and **abort** — don't half-create.)
- **No tokens match a key** (free-text remains) → **create** path:
  1. Treat the remaining text as the new issue **summary**. Type = `Bug` if `--bug`, else `Task` (default, or `--task`). Project = `--project <KEY>`, else inferred per the **create** procedure in `${CLAUDE_PLUGIN_ROOT}/commands/jira.md`.
  2. Run that **create** procedure (assignee defaults to you). Capture the new key.
  3. Report the created issue (key + browse URL). Set `TICKET_IDS` = the single new key and continue.
- **No tokens at all** → with `--spec`, take the create path with the spec's first heading as the summary and the spec path in the description; without it, ask the user for a ticket ID or a summary to create, and stop.

### 2. Resolve tickets, claim them, and move them to In Progress

Skipped under `TRACKER=none` — there is nothing to resolve or move.

Run the shared **Resolve Jira ticket(s)** procedure with `TICKET_IDS` = the IDs from step 1 (it reads the full issue and every comment), then **Check for blockers** — any blocker is asked before anything else happens, including the claim and the transition — then the **Claim unassigned ticket(s)** procedure (any ticket with no assignee becomes yours), then the **Transition to In Progress** procedure — all with the same IDs. (A freshly created ticket starts at `Todo`; the chain-walk moves it to In Progress.)

### 3. Determine the branch name

- Prefix: all tickets type `Bug` → `fix`; any `Story`/`Task`/other → `feat`.
- Single ticket → `<prefix>/ERP-135`; multiple → `<prefix>/ERP-135_ERP-136` (underscore-separated, in the order given).
- **`TRACKER=none`** — there is no key to name the branch after. Prefix from the work (`fix` for a bug, else `feat`), then three to five hyphenated lowercase words from the description: `feat/add-a-rename-cache`. That is the `bond:authorship-conventions` shape; the `<prefix>/<KEY>` shape exists only because Bonliva's Jira tooling looks a branch up by its key, and outside Bonliva nothing does.

### 4. Set up the branch

Run the shared **Set up the branch** procedure with `BRANCH_NAME` from step 3, `BRANCH_SOURCE=new`, `BASE_BRANCH` = the `--base` value if given else resolved via the shared **Default base branch** procedure, and `WORKTREE_SUFFIX=` (empty).

### 5. Analyse, plan, and implement

Run these shared procedures in order, reporting each phase through **Progress and checkpoints** (`PHASES` = Setup, Analyse, Plan, Plan review, Tests first, Build, Converge, Review, Ship + PR, Audit — a phase the mode skips is marked `skipped`; `CHECKPOINTS` = `all` under `--checkpoints`, `plan` under `--review-plan`, otherwise `none`):

1. **Analyse the codebase** — `FOCUS` = the ticket descriptions, acceptance criteria, and what the comments changed, plus the `--spec` file when given (`SPEC_FILE`).
2. **Implementation plan** — `PLAN_FILE=docs/plans/<TICKET_IDS>.md`, or `docs/plans/<branch-description>.md` under `TRACKER=none`; `PLAN_MODE=write`, `SPEC_FILE` = the `--spec` path or empty, `CONFIRM_PROMPT` = *"Does this plan look correct? Reply with changes, or say **yes** to start implementing."* The plan is checked by **Review the plan** before it is printed or confirmed.
3. **Tests first** — `SCOPE` = the whole plan. Skipped with two or more tickets: each track step in step 4 writes its own failing test first (`track-build.md`, `COMMON`), and red tests for the later tickets left uncommitted in the track's worktree would fail every earlier step's test slice.
4. **Implement** then **Test** — `SCOPE` = the whole plan — when the plan names three or more files, build through `superpowers:subagent-driven-development` (available when the superpowers plugin is installed; otherwise in-thread): the main thread keeps the plan and the verdicts, test output stays in the subagent. Build slice by slice, in the plan's order. With two or more tickets, each ticket is instead a step of one track in `${CLAUDE_PLUGIN_ROOT}/shared/track-build.md` — steps in order, one implementer per step — without that file's review and fix pass — the run's one review comes at the end.
5. **Converge** — every acceptance criterion mapped to the test that proves it.
6. **Review and fix** — skipped in auto mode, where the audit runs the code and security review pair once over the PR; under `--no-auto`, the pair runs here once over the work, then the tests re-run.
7. **Report completion**, then **Ship + PR** with `PR_HANDLING=create`, then **Hand off the audit**, then **Transition to In Review** (skipped under `TRACKER=none`, where there is no issue to transition), then **Teardown** (skipped once the audit was handed off — the agent removes the worktree).

Shared inputs for the tail: `MODE` = `no-auto` if `--no-auto` was passed else `auto` (`--review-plan` and `--checkpoints` keep `auto`; their stops come from `CHECKPOINTS`); `BASE_BRANCH` = the same value resolved in step 4; `WORKTREE` = the path + original repo dir recorded in step 4, or `none` under `--no-worktree`.

## Do NOT

- Do not skip the codebase analysis — surface relevant context before writing the plan.
- Do not let the code drift from `--spec` silently: when the build shows the spec is wrong, record it under the plan's `## Decisions` and in the completion report — the spec file is the user's, the run does not rewrite it.
- The shared flow's own **Do NOT** list (commit/push/ship/PR/teardown rules) applies — do not restate or diverge from it here.
