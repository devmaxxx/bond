---
description: Fetch (or create) a Jira ticket, create a typed branch, write an implementation plan, and implement it
---

# /implement

Full ticket-to-implementation workflow: fetch one or more Jira tickets (or **create one** when you have none yet), create a properly-named branch in an isolated worktree, analyse the codebase, write a concrete implementation plan, implement it, ship, open the PR, and tear the worktree down. By default it runs end-to-end without pausing; pass `--no-auto` to confirm the plan first or `--no-worktree` to work in the current tree.

Everything except the four decisions unique to this command — creating a ticket when none is given, parsing multiple ticket IDs, the branch-prefix rule, and writing a fresh plan — is delegated to the shared procedures in `${CLAUDE_PLUGIN_ROOT}/shared/implement-flow.md` (the same flow `/bond:fix-qa` uses). Read that file; the steps below name the procedures to run and the inputs to set.

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

### Flags

By **default** `/implement` runs in **worktree mode** and **auto mode**: it creates an isolated git worktree, skips the plan confirmation prompt, runs ship + open-pr after implementation, and removes the worktree when everything is done.

- `--no-worktree` — switch branches in the current working tree instead of a worktree (requires a clean tree).
- `--no-auto` — confirm the plan before implementing, and stop after implementation (the shared Ship + PR and Teardown procedures are skipped; the worktree is left in place).
- `--base <branch>` — cut the new branch off `origin/<branch>` and target the PR at it. When omitted, the base defaults **per repo** (`bonliva-erp` → `main`, `bonliva-crm` → `dev`, async-api → `master`; else `dev`) per the shared **Default base branch** procedure. Use the flag to override, e.g. `--base develop`.

Flags that only apply when **creating** a ticket (no key given — see step 1):
- `--task` — create the new issue as a **Task** (this is the default type).
- `--bug` — create the new issue as a **Bug**.
- `--project <KEY>` — project for the new issue when it can't be inferred.

Strip all flags from `$ARGUMENTS` before parsing the remaining tokens.

## Steps

### 1. Parse ticket IDs — or create a ticket

After stripping flags, look at the remaining tokens:

- **All tokens match `^[A-Z]+-\d+$`** → existing-ticket path. These are `TICKET_IDS`. (If some tokens look like keys and others don't, report the invalid ones and **abort** — don't half-create.)
- **No tokens match a key** (free-text remains) → **create** path:
  1. Treat the remaining text as the new issue **summary**. Type = `Bug` if `--bug`, else `Task` (default, or `--task`). Project = `--project <KEY>`, else inferred per the **create** procedure in `${CLAUDE_PLUGIN_ROOT}/commands/jira.md`.
  2. Run that **create** procedure (assignee defaults to you). Capture the new key.
  3. Report the created issue (key + browse URL). Set `TICKET_IDS` = the single new key and continue.
- **No tokens at all** → ask the user for a ticket ID or a summary to create, and stop.

### 2. Resolve tickets and move them to In Progress

Run the shared **Resolve Jira ticket(s)** procedure with `TICKET_IDS` = the IDs from step 1 and `WITH_COMMENTS=false`, then the **Transition to In Progress** procedure with the same IDs. (A freshly created ticket starts at `Todo`; the chain-walk moves it to In Progress.)

### 3. Determine the branch name

- Prefix: all tickets type `Bug` → `fix`; any `Story`/`Task`/other → `feat`.
- Single ticket → `<prefix>/ERP-135`; multiple → `<prefix>/ERP-135_ERP-136` (underscore-separated, in the order given).

### 4. Set up the branch

Run the shared **Set up the branch** procedure with `BRANCH_NAME` from step 3, `BRANCH_SOURCE=new`, `BASE_BRANCH` = the `--base` value if given else resolved via the shared **Default base branch** procedure, and `WORKTREE_SUFFIX=` (empty).

### 5. Analyse, plan, and implement

Run these shared procedures in order:

1. **Analyse the codebase** — `FOCUS` = the ticket descriptions and acceptance criteria.
2. **Implementation plan** — `PLAN_FILE=docs/plans/<TICKET_IDS>.md`, `PLAN_MODE=write`, `CONFIRM_PROMPT` = *"Does this plan look correct? Reply with changes, or say **yes** to start implementing."*
3. **Implement** then **Test** — `SCOPE` = the whole plan.
4. **Report completion**, then **Ship + PR** with `PR_HANDLING=create`, then **Teardown**.

Shared inputs for the tail: `MODE` = `no-auto` if `--no-auto` was passed else `auto`; `BASE_BRANCH` = the same value resolved in step 4; `WORKTREE` = the path + original repo dir recorded in step 4, or `none` under `--no-worktree`.

## Do NOT

- Do not skip the codebase analysis — surface relevant context before writing the plan.
- The shared flow's own **Do NOT** list (commit/push/ship/PR/teardown rules) applies — do not restate or diverge from it here.
