---
description: Fetch Jira tickets, create a typed branch, write an implementation plan, and implement it
---

# /implement

Full ticket-to-implementation workflow: fetch one or more Jira tickets, create a properly-named branch, analyse the codebase, write a concrete implementation plan, confirm with the user, then implement.

## Arguments

`$ARGUMENTS` — one or more Jira ticket IDs, space-separated, plus optional flags.

Examples:
- `/implement ERP-135`
- `/implement ERP-135 ERP-136`
- `/implement ERP-135 --worktree`
- `/implement ERP-135 --auto`
- `/implement ERP-135 --worktree --auto`

### Flags

- `--worktree` — create the branch in a new git worktree at `../<repo>-<branch-slug>` instead of switching branches in the current working tree. Useful when you want to keep the current branch checked out.
- `--auto` — skip the plan confirmation prompt in step 6, and automatically run `/bond:open-pr` after implementation completes.

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

### 3. Determine branch name

**Prefix rule:**
- All tickets are type `Bug` → prefix `fix`
- Any ticket is type `Story`, `Task`, or other → prefix `feat`

**Name construction:**
- Single ticket: `<prefix>/ERP-135`
- Multiple tickets: `<prefix>/ERP-135_ERP-136` (underscore-separated, IDs in the order given)

### 4. Create the branch

#### Default mode (no `--worktree`)

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

#### Worktree mode (`--worktree`)

Do **not** require a clean working tree — that's the whole point of a worktree.

1. Determine the repo name from `basename "$(git rev-parse --show-toplevel)"`.
2. Build a filesystem-safe slug from the branch name (replace `/` with `-`).
3. Worktree path: `../<repo>-<slug>` (sibling to the current repo directory).
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

If `--auto` was passed: skip the confirmation prompt and proceed directly to step 7. Note in the printed output that auto-confirm is enabled.

Otherwise, ask:

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
- Worktree path (only if `--worktree` was used)
- Tickets implemented: `<ID>: <summary>` for each
- Plan saved to `docs/plans/<TICKET_IDS>.md`
- Files changed: brief list
- Next step: run `/bonliva-dev:ship` to validate, commit, and push (skipped automatically if `--auto` is set — see step 9)

### 9. Auto open PR (`--auto` only)

If `--auto` was passed, after step 8:

1. Run `/bonliva-dev:ship` to validate, commit, and push the branch.
2. Then invoke `/bond:open-pr` to create the Bitbucket PR.

If either step fails, surface the error and stop — do not retry blindly.

## Do NOT

- Do not push the branch — always ask the user first, **unless** `--auto` was passed (in which case step 9 handles ship + open-pr).
- Do not start implementing before the user confirms the plan, **unless** `--auto` was passed.
- Do not skip the codebase analysis step — surface relevant context before writing the plan.
- Do not commit anything yourself, **unless** `--auto` was passed and you're delegating to `/bonliva-dev:ship`.
