---
description: Fetch (or create) a Jira ticket — or take a free-text task in a repo with no tracker — then create a typed branch, write an implementation plan, and implement it
---

# /implement

**Ask first.** Before the first write, one `AskUserQuestion` with every decision `$ARGUMENTS` leaves open — none when they settle it all, and none in a spec-only run (standing rule *Commands ask first*). When free text with no `--spec` leaves the design itself open — criteria would have to be invented, or two or more designs fit — that upfront round runs through `superpowers:brainstorming` instead, and its approved design becomes the run's spec (`${CLAUDE_PLUGIN_ROOT}/shared/superpowers.md`).

Full ticket-to-implementation workflow: fetch one or more Jira tickets (or **create one** when you have none yet), create a properly-named branch in an isolated worktree, analyse the codebase, write a concrete implementation plan, implement it, ship, open the PR, and tear the worktree down. By default it runs end-to-end without pausing; pass `--no-auto` to confirm the plan first or `--no-worktree` to work in the current tree.

Everything except the four decisions unique to this command — creating a ticket when none is given, parsing multiple ticket IDs, the branch-prefix rule, and writing a fresh plan — is delegated to the shared procedures in `${CLAUDE_PLUGIN_ROOT}/shared/implement-flow.md`. Read that file; the steps below name the procedures to run and the inputs to set.

## Arguments

`$ARGUMENTS` — **either** one or more existing Jira ticket IDs (space-separated), **or** a free-text summary of work that has no ticket yet — plus optional flags.

Examples:
- `/implement PROJ-135`
- `/implement PROJ-135 PROJ-136`
- `/implement PROJ-135 --no-auto`
- `/implement PROJ-135 --no-worktree`
- `/implement add a CSV export to the reports page` — creates a Task, then implements it
- `/implement login page 500s on submit --bug` — creates a Bug, then implements it
- `/implement "wire up export endpoint" --task --project OPS`
- `/implement --spec docs/specs/csv-export.md` — spec-only: implements the spec and nothing else — no Jira, no browser, no upfront question
- `/implement PROJ-135 --spec docs/specs/csv-export.md` — the ticket plus a spec that refines it
- `/implement --spec docs/specs/auth.md --review-plan` — stops at the plan for approve / edit / stop, then runs on to the PR
- `/implement --spec docs/specs/auth.md --checkpoints` — pauses after every phase
- `/implement --resume` — continues the stopped run of the current branch from its next phase
- `/implement --resume feat/auth --from "Build"` — runs that phase again, then the ones after it
- `/implement --spec docs/specs/auth.md --subagents --thorough` — the slow, double-checked build: plan-review agent, one implementer and one reviewer per task

### Flags

By **default** `/implement` runs in **worktree mode** and **auto mode**: it creates an isolated git worktree, skips the plan confirmation prompt, runs ship + open-pr after implementation, then hands the new PR to a background `bond:pr-audit` agent — a fresh context that runs the code and security review pair once, fixes what it finds and removes the worktree when it is done.

- `--no-worktree` — switch branches in the current working tree instead of a worktree (requires a clean tree).
- `--no-auto` — confirm the plan before implementing, and stop after implementation (the shared Ship + PR and Teardown procedures are skipped; the worktree is left in place).
- `--review-plan` — stop once the plan is written and reviewed: **Approve**, **Edit** (say what to change, or edit `PLAN_FILE` yourself and reply `approved`) or **Stop**. After approval the run goes on as in auto mode — build, PR, audit. Differs from `--no-auto`, which also stops after implementation.
- `--checkpoints` — pause after every phase (see **Progress and checkpoints**) with **Continue**, **Stop** or a note to apply first. Implies `--review-plan`.
- `--resume [<branch>]` — continue a run that stopped (a checkpoint's Stop, a pause file, an interrupt) from the phase its progress file names, with the flags, tickets, base and PR it recorded. Skips steps 1–4; the plan file is re-read, so edits made while it was stopped count. `--from "<phase>"` (a name from the progress file, as the bond-cockpit ↻ button sends it) starts at that phase instead and marks it and every later phase `todo` first. Outside bypass mode, allow the progress folder once — `Edit(~/.local/state/bond-flow/**)` in `permissions.allow` — or every phase boundary asks.
- `--subagents` — build through `superpowers:subagent-driven-development`: a fresh implementer and a task reviewer per plan task, with per-task commits. Slower — several minutes per task — but every task gets an independent gate. Default: inline TDD in this context.
- `--thorough` — run the read-only plan-review agent (**Review the plan**) before the plan is printed. Default: off; the final review pair is the gate.
- `--spec <path>` — a Markdown spec in the repo (goal, requirements, acceptance criteria, Definition of Done). It is read whole as the source of the requirements, the plan links it, and its acceptance criteria drive the **Build** slices and the **Verify** map. A path that does not exist aborts the run before anything is written. With no ticket key beside it the run is **spec-only** (see **Spec-only runs**).
- `--base <branch>` — cut the new branch off `origin/<branch>` and target the PR at it. When omitted, the base comes from the project profile (`${CLAUDE_PLUGIN_ROOT}/shared/project-profile.md`): the repo's `.bond/project.json`, otherwise the remote's own default branch. Use the flag to override, e.g. `--base develop`.

Flags that only apply when **creating** a ticket (no key given — see step 1):
- `--task` — create the new issue as a **Task** (this is the default type).
- `--bug` — create the new issue as a **Bug**.
- `--project <KEY>` — project for the new issue when it can't be inferred.

Strip all flags from `$ARGUMENTS` before parsing the remaining tokens.

### Spec-only runs

`--spec` with no ticket key sets `SPEC_ONLY`. The spec, the repo and the files
it names are the whole input; the run reaches for nothing else:

- **No tracker.** `TRACKER=none` for this run whatever the project profile
  says: no ticket is created, read, claimed or transitioned. Leftover free text
  is a note on the spec, not a ticket summary.
- **No upfront question.** Flags left out take their defaults — worktree on,
  base from the profile, auto mode — and `superpowers:brainstorming` never
  runs: the spec already settled the design. **Check for blockers** reads the
  spec only; an open question in it is decided and logged under `## Decisions`,
  never asked, unless no option is viable.
- **No browser.** No Chrome, no Playwright MCP, no screenshots — the e2e suite
  the repo already has is the only browser that runs, inside **Verify**.
- **No web lookups by default.** A third-party API is confirmed from what is
  installed — the package's types and README under `node_modules/` (or the
  stack's equivalent) — and the spec's own decisions. `bond:docs-explorer`
  runs only when the installed code cannot settle the question.

## Steps

### 1. Parse ticket IDs — or create a ticket

Resolve the **project profile** first
(`${CLAUDE_PLUGIN_ROOT}/shared/project-profile.md`). Under `TRACKER=none` or `SPEC_ONLY` there
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
- **No tokens at all** → with `--spec`, the run is `SPEC_ONLY` (handled above); without it, ask the user for a ticket ID or a summary to create, and stop.

### 2. Resolve tickets, claim them, and move them to In Progress

Skipped under `TRACKER=none` — there is nothing to resolve or move.

Run the shared **Resolve Jira ticket(s)** procedure with `TICKET_IDS` = the IDs from step 1 (it reads the full issue and every comment), then **Check for blockers** — any blocker is asked before anything else happens, including the claim and the transition — then the **Claim unassigned ticket(s)** procedure (any ticket with no assignee becomes yours), then the **Transition to In Progress** procedure — all with the same IDs. (A freshly created ticket starts at `Todo`; the chain-walk moves it to In Progress.)

### 3. Determine the branch name

- Prefix: all tickets type `Bug` → `fix`; any `Story`/`Task`/other → `feat`.
- Single ticket → `<prefix>/PROJ-135`; multiple → `<prefix>/PROJ-135_PROJ-136` (underscore-separated, in the order given).
- **`TRACKER=none`** — there is no key to name the branch after. Prefix from the work (`fix` for a bug, else `feat`), then three to five hyphenated lowercase words from the description: `feat/add-a-rename-cache`. That is the `bond:authorship-conventions` shape; the `<prefix>/<KEY>` shape exists only because the Jira tooling looks a branch up by its key, so it applies under `TRACKER=jira` only.

### 4. Set up the branch

Run the shared **Set up the branch** procedure with `BRANCH_NAME` from step 3, `BRANCH_SOURCE=new`, `BASE_BRANCH` = the `--base` value if given else resolved via the shared **Default base branch** procedure, and `WORKTREE_SUFFIX=` (empty).

### 5. Plan, build, verify

Run these shared procedures in order, reporting each phase through **Progress and checkpoints** (`PHASES` = Setup, Plan, Build, Verify, Review, Ship + PR, Audit — a phase this run will not do is marked `skipped` from the start: Review in auto mode, Ship + PR and Audit under `--no-auto`; `CHECKPOINTS` = `all` under `--checkpoints`, `plan` under `--review-plan`, otherwise `none`; `BUILD` = `subagents` under `--subagents`, `track` with two or more tickets, otherwise `inline`; `THOROUGH` = yes under `--thorough`; `TICKET_IDS` and `BASE_BRANCH` as resolved above):

1. **Plan** phase — **Analyse the codebase** (`FOCUS` = the ticket descriptions, acceptance criteria, and what the comments changed, plus the `--spec` file when given as `SPEC_FILE`), then **Implementation plan** — `PLAN_FILE=docs/plans/<TICKET_IDS>.md`, or `docs/plans/<branch-description>.md` under `TRACKER=none`; `PLAN_MODE=write`, `SPEC_FILE` = the `--spec` path or empty, `CONFIRM_PROMPT` = *"Does this plan look correct? Reply with changes, or say **yes** to start implementing."* **Review the plan** runs only when `THOROUGH`.
2. **Build** phase — **Implement** with `SCOPE` = the whole plan and `BUILD` as set above. With `BUILD=track`, each ticket is a step of one track in `${CLAUDE_PLUGIN_ROOT}/shared/track-build.md` — steps in order, one implementer per step — without that file's review and fix pass — the run's one review comes at the end.
3. **Verify** phase — **Verify**: one fresh full run of the checks, then every acceptance criterion mapped to the test that proves it.
4. **Review and fix** — skipped in auto mode, where the audit runs the code and security review pair once over the PR; under `--no-auto`, the pair runs here once over the work, then the tests re-run.
5. **Report completion**, then **Ship + PR** with `PR_HANDLING=create` (`update` on a resume whose progress file names a PR), then **Hand off the audit**, then **Transition to In Review** (skipped under `TRACKER=none`, where there is no issue to transition), then **Teardown** (skipped once the audit was handed off — the agent removes the worktree).

Shared inputs for the tail: `MODE` = `no-auto` if `--no-auto` was passed else `auto` (`--review-plan` and `--checkpoints` keep `auto`; their stops come from `CHECKPOINTS`); `BASE_BRANCH` = the same value resolved in step 4; `WORKTREE` = the path + original repo dir recorded in step 4, or `none` under `--no-worktree`.

## Do NOT

- Do not skip the codebase analysis — surface relevant context before writing the plan.
- Do not let the code drift from `--spec` silently: when the build shows the spec is wrong, record it under the plan's `## Decisions` and in the completion report — the spec file is the user's, the run does not rewrite it.
- The shared flow's own **Do NOT** list (commit/push/ship/PR/teardown rules) applies — do not restate or diverge from it here.
