---
description: Fetch Jira tickets, create a typed branch, write an implementation plan, and implement it
---

# /implement

Full ticket-to-implementation workflow: fetch one or more Jira tickets, create a properly-named branch in an isolated worktree, analyse the codebase, write a concrete implementation plan, implement it, ship, open the PR, and tear the worktree down. By default it runs end-to-end without pausing; pass `--no-auto` to confirm the plan first or `--no-worktree` to work in the current tree.

## Arguments

`$ARGUMENTS` — one or more Jira ticket IDs, space-separated, plus optional flags.

Examples:
- `/implement ERP-135`
- `/implement ERP-135 ERP-136`
- `/implement ERP-135 --no-auto`
- `/implement ERP-135 --no-worktree`

### Flags

By **default** `/implement` runs in **worktree mode** and **auto mode**: it creates an isolated git worktree, skips the plan confirmation prompt, runs ship + open-pr after implementation, and removes the worktree when everything is done. The flags below opt out of those defaults.

- `--no-worktree` — switch branches in the current working tree instead of creating a new git worktree. Requires a clean working tree.
- `--no-auto` — pause for plan confirmation in step 6, and stop after implementation (steps 9 and 10 are skipped — no ship, no PR, and the worktree is left in place for the user).

Strip flags from `$ARGUMENTS` before parsing ticket IDs. If after stripping flags there are no remaining tokens, ask the user for ticket IDs before proceeding.

## Steps

### 1. Parse ticket IDs

Split `$ARGUMENTS` by whitespace. Each token must match `^[A-Z]+-\d+$`.  
If any token is invalid, report which ones fail and **abort**.

### 2. Fetch ticket details from Jira

Resolve the Atlassian `cloudId` once via `mcp__bond-atlassian__getAccessibleAtlassianResources` (use the resource matching `bonliva.atlassian.net`).

Then for each ticket ID call:
```
mcp__bond-atlassian__getJiraIssue({ cloudId: "<CLOUD_ID>", issueIdOrKey: "<TICKET_ID>" })
```

Extract from the response:
- `fields.summary`
- `fields.issuetype.name` — used for branch prefix logic
- `fields.status.name`
- `fields.priority.name`
- `fields.assignee.displayName`
- `fields.description` — Atlassian Document Format; render as plain text

If any ticket is not found or the tool returns an error, report which ticket failed and **abort**.

### 2b. Transition tickets to In Progress

Before creating the branch, move every parsed ticket to **In Progress** so Jira reflects that work has started.

For each ticket ID:

1. Use `mcp__bond-atlassian__getTransitionsForJiraIssue` with the `cloudId` from step 2 and `issueIdOrKey` to fetch available transitions.
2. Find the transition whose `name` contains "in progress" (case-insensitive). If none matches, fall back to a transition whose `name` contains "progress" or "start".
3. If found, call `mcp__bond-atlassian__transitionJiraIssue` with `cloudId`, `issueIdOrKey`, and that transition ID.
4. Report success per ticket. If the ticket is already In Progress (no matching transition available because it is the current status), skip silently.
5. If the transition call fails, surface the error but **do not abort** — continue with branch creation.

### 3. Determine branch name

**Prefix rule:**
- All tickets are type `Bug` → prefix `fix`
- Any ticket is type `Story`, `Task`, or other → prefix `feat`

**Name construction:**
- Single ticket: `<prefix>/ERP-135`
- Multiple tickets: `<prefix>/ERP-135_ERP-136` (underscore-separated, IDs in the order given)

### 4. Create the branch

#### Worktree mode (default)

Do **not** require a clean working tree — that's the whole point of a worktree.

1. Determine the repo name from `basename "$(git rev-parse --show-toplevel)"`.
2. Build a filesystem-safe slug from the branch name (replace `/` with `-`).
3. Worktree path: `../<repo>-<slug>` (sibling to the current repo directory). Remember both this path and the original repo directory — step 10 needs them.
4. Sync remote refs without changing the current branch:
   ```sh
   git fetch origin
   ```
5. Create the worktree off `origin/main`:
   ```sh
   git worktree add -b <branch-name> ../<repo>-<slug> origin/main
   ```
   If the path already exists or the branch already exists, surface the error and **abort**.
6. `cd` into the new worktree path for the rest of the workflow. All subsequent steps (codebase analysis, plan file, implementation) run inside the worktree.
7. Confirm: report the worktree path, branch name, and the short SHA of `origin/main` it was cut from.

#### In-place mode (`--no-worktree`)

Follow the same safe sequence as `/start-branch`:

1. Run `git status --porcelain`. If the working tree is dirty, tell the user to commit or stash first and **abort** — do not auto-stash.
2. Sync main:
   ```sh
   git fetch origin
   git checkout main
   git pull --rebase origin main
   ```
   If the pull fails, surface the error and **abort**.
3. Create and switch to the new branch:
   ```sh
   git checkout -b <branch-name>
   ```
4. Confirm: report the branch name and the short SHA of main it was cut from.

### 5. Analyse the codebase

For each ticket, read the description and acceptance criteria, then explore the relevant code:

- Search for files, components, and services related to the ticket's domain (use file names, symbols, and route paths mentioned in the ticket)
- Identify which files need to change and why
- Locate related backend API endpoints and DTOs if the ticket touches data
- Find existing tests that cover the affected area

### 6. Write the implementation plan

Create `docs/plans/<TICKET_IDS>.md` (e.g. `docs/plans/ERP-135.md` or `docs/plans/ERP-135_ERP-136.md`).  
Create the `docs/plans/` directory if it does not exist.

The plan file must contain:

```
# <branch-name>

## Tickets
For each ticket:
- **<ID>: <summary>** (`<type>` · `<status>` · `<priority>`)
  - Description: <full plain-text body of the ticket description>
  - Acceptance criteria: <extracted from description>
  - Open questions: <any ambiguities or decisions flagged in the ticket>

## Files to change
- `<path/to/file>` — <one-line reason>

## Implementation steps
1. <Concrete step>
2. ...

## Tests
For each new or changed behaviour, list the specific test case to write:
- `<test file path>` — `<describe block> > <it block>` — <what it asserts>
```

After writing the file, print the full plan to the user.

Unless `--no-auto` was passed (auto mode is the default): skip the confirmation prompt and proceed directly to step 7. Note in the printed output that auto-confirm is enabled.

If `--no-auto` was passed, ask:

> "Does this plan look correct? Reply with changes or corrections, or say **yes** to start implementing."

**Wait for explicit confirmation before proceeding.** If the user requests changes, update the plan file and ask again.

### 7. Implement the plan

Execute the implementation steps from the plan in order. After each logical group of changes briefly say what was done and which files were modified.

- Do **not** commit — leave staging and committing to the user or `/bonliva-dev:ship`.
- If you encounter something that blocks a step (missing type, unexpected API shape, etc.), pause and ask the user rather than guessing.

### 7b. Generate tests

After all implementation steps are done, write the tests listed in the plan's **Tests** section:

- Co-locate tests with the code they test (e.g. `*.spec.ts` next to the service/controller, `*.test.tsx` next to the component).
- Follow existing test patterns in the same module — do not introduce a new testing style.
- Cover the golden path and at least one edge/error case for each new behaviour.
- Do not write tests for code that was not changed.

### 8. Report completion

Tell the user:
- Branch created (`<branch-name>` from `main@<sha>`)
- Worktree path (unless `--no-worktree` was used)
- Tickets implemented: `<ID>: <summary>` for each
- Plan saved to `docs/plans/<TICKET_IDS>.md`
- Files changed: brief list
- Next step: with auto mode (default), steps 9 and 10 run automatically. If `--no-auto` was passed, tell the user to run `/bonliva-dev:ship` to validate, commit, and push.

### 9. Ship and open PR (default; skipped with `--no-auto`)

Skip this step entirely if `--no-auto` was passed. Otherwise, after step 8:

1. Run `/bonliva-dev:ship` to validate, commit, and push the branch.
2. Then invoke `/bond:open-pr` to create the Bitbucket PR.

If either step fails, surface the error and stop — do not retry blindly, and do **not** proceed to step 10 (leave the worktree in place so the user can fix and resume).

### 10. Close the worktree (default; skipped with `--no-worktree` or `--no-auto`)

Only runs when a worktree was created (default) **and** step 9 completed successfully. Skip it if `--no-worktree` was passed (there is no worktree) or `--no-auto` was passed (the user is still working in the worktree).

The branch is committed, pushed, and the PR is open, so the worktree is no longer needed:

1. `cd` back to the original repo directory recorded in step 4.
2. Remove the worktree:
   ```sh
   git worktree remove <worktree-path>
   ```
   If `git worktree remove` reports the worktree is dirty or has untracked files, do **not** force-remove — surface the warning and leave the worktree for the user to inspect.
3. Confirm: report that the worktree at `<worktree-path>` was removed. The branch still exists locally and on `origin`.

## Do NOT

- Do not push the branch yourself in `--no-auto` mode — tell the user to run `/bonliva-dev:ship`. In the default (auto) mode, step 9 handles ship + open-pr.
- Do not start implementing before the user confirms the plan when `--no-auto` was passed.
- Do not skip the codebase analysis step — surface relevant context before writing the plan.
- Do not commit anything yourself in `--no-auto` mode. In auto mode, committing is delegated to `/bonliva-dev:ship`.
- Do not force-remove a dirty worktree in step 10 — surface the warning instead.
