---
description: Fetch Jira tickets, create a typed branch, write an implementation plan, and implement it
---

# /implement

Full ticket-to-implementation workflow: fetch one or more Jira tickets, create a properly-named branch in an isolated worktree, analyse the codebase, write a concrete implementation plan, implement it, ship, open the PR, and tear the worktree down. By default it runs end-to-end without pausing; pass `--no-auto` to confirm the plan first or `--no-worktree` to work in the current tree.

Everything except the three decisions unique to this command — parsing multiple ticket IDs, the branch-prefix rule, and writing a fresh plan — is delegated to the shared procedures in `${CLAUDE_PLUGIN_ROOT}/shared/implement-flow.md` (the same flow `/bond:fix-qa` uses). Read that file; the steps below name the procedures to run and the inputs to set.

## Arguments

`$ARGUMENTS` — one or more Jira ticket IDs, space-separated, plus optional flags.

Examples:
- `/implement ERP-135`
- `/implement ERP-135 ERP-136`
- `/implement ERP-135 --no-auto`
- `/implement ERP-135 --no-worktree`

### Flags

By **default** `/implement` runs in **worktree mode** and **auto mode**: it creates an isolated git worktree, skips the plan confirmation prompt, runs ship + open-pr after implementation, and removes the worktree when everything is done.

- `--no-worktree` — switch branches in the current working tree instead of a worktree (requires a clean tree).
- `--no-auto` — confirm the plan before implementing, and stop after implementation (the shared Ship + PR and Teardown procedures are skipped; the worktree is left in place).

Strip flags from `$ARGUMENTS` before parsing ticket IDs. If no tokens remain, ask the user for ticket IDs.

## Steps

### 1. Parse ticket IDs

Split `$ARGUMENTS` by whitespace. Each token must match `^[A-Z]+-\d+$`. If any token is invalid, report which ones fail and **abort**.

### 2. Resolve tickets and move them to In Progress

Run the shared **Resolve Jira ticket(s)** procedure with `TICKET_IDS` = the parsed IDs and `WITH_COMMENTS=false`, then the **Transition to In Progress** procedure with the same IDs.

### 3. Determine the branch name

- Prefix: all tickets type `Bug` → `fix`; any `Story`/`Task`/other → `feat`.
- Single ticket → `<prefix>/ERP-135`; multiple → `<prefix>/ERP-135_ERP-136` (underscore-separated, in the order given).

### 4. Set up the branch

Run the shared **Set up the branch** procedure with `BRANCH_NAME` from step 3, `BRANCH_SOURCE=new`, and `WORKTREE_SUFFIX=` (empty).

### 5. Analyse, plan, and implement

Run these shared procedures in order:

1. **Analyse the codebase** — `FOCUS` = the ticket descriptions and acceptance criteria.
2. **Implementation plan** — `PLAN_FILE=docs/plans/<TICKET_IDS>.md`, `PLAN_MODE=write`, `CONFIRM_PROMPT` = *"Does this plan look correct? Reply with changes, or say **yes** to start implementing."*
3. **Implement** then **Test** — `SCOPE` = the whole plan.
4. **Report completion**, then **Ship + PR** with `PR_HANDLING=create`, then **Teardown**.

Shared inputs for the tail: `MODE` = `no-auto` if `--no-auto` was passed else `auto`; `WORKTREE` = the path + original repo dir recorded in step 4, or `none` under `--no-worktree`.

## Do NOT

- Do not skip the codebase analysis — surface relevant context before writing the plan.
- The shared flow's own **Do NOT** list (commit/push/ship/PR/teardown rules) applies — do not restate or diverge from it here.
