---
description: Fetch Jira tickets, create a typed branch, write an implementation plan, and implement it
---

# /implement

Full ticket-to-implementation workflow: fetch one or more Jira tickets, create a properly-named branch, analyse the codebase, write a concrete implementation plan, confirm with the user, then implement.

## Arguments

`$ARGUMENTS` — one or more Jira ticket IDs, space-separated.

Examples:
- `/implement ERP-135`
- `/implement ERP-135 ERP-136`

If `$ARGUMENTS` is missing or empty, ask the user for ticket IDs before proceeding.

## Steps

### 1. Parse ticket IDs

Split `$ARGUMENTS` by whitespace. Each token must match `^[A-Z]+-\d+$`.  
If any token is invalid, report which ones fail and **abort**.

### 2. Fetch ticket details from Jira

For each ticket ID call the Jira MCP tool:
```
mcp__jira__jira_get_issue({ issue_key: "<TICKET_ID>" })
```

Extract from the response:
- `summary`
- `issuetype.name` — used for branch prefix logic
- `status.name`
- `priority.name`
- `assignee.displayName`
- `description` — plain text or Atlassian Document Format; render as plain text

If any ticket is not found or the tool returns an error, report which ticket failed and **abort**.

### 3. Determine branch name

**Prefix rule:**
- All tickets are type `Bug` → prefix `fix`
- Any ticket is type `Story`, `Task`, or other → prefix `feat`

**Name construction:**
- Single ticket: `<prefix>/ERP-135`
- Multiple tickets: `<prefix>/ERP-135_ERP-136` (underscore-separated, IDs in the order given)

### 4. Create the branch

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

After writing the file, print the full plan to the user and ask:

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
- Tickets implemented: `<ID>: <summary>` for each
- Plan saved to `docs/plans/<TICKET_IDS>.md`
- Files changed: brief list
- Next step: run `/bonliva-dev:ship` to validate, commit, and push

## Do NOT

- Do not push the branch — always ask the user first.
- Do not start implementing before the user confirms the plan.
- Do not skip the codebase analysis step — surface relevant context before writing the plan.
- Do not commit anything.
