---
description: Transition one or more Jira tickets to a given status using the Jira MCP server
---

# /jira-status

Transition one or more Jira tickets to a chosen status. When no target status is given, shows the current status and lets the user pick from available transitions interactively.

## Arguments

`$ARGUMENTS` — space-separated ticket IDs and an optional status keyword in any order:

| Token | Meaning |
|---|---|
| `ERP-123`, `ERP-123 ERP-124` | One or more ticket IDs matching `[A-Z]+-\d+` |
| `in-review` / `review` | Target status: "In Review" (skip interactive picker) |
| `in-progress` / `progress` | Target status: "In Progress" (skip interactive picker) |

If no ticket IDs are given, extract them from the current branch name (`git rev-parse --abbrev-ref HEAD`).

If no status keyword is given, show current status and available transitions, then ask the user to pick.

Examples:
- `/jira-status` — show current status of branch ticket(s), pick target interactively
- `/jira-status ERP-123` — show current status of ERP-123, pick target interactively
- `/jira-status ERP-123 in-progress` — transition ERP-123 directly to In Progress
- `/jira-status ERP-123 ERP-124 in-review` — transition both directly to In Review

## Steps

### 1. Parse arguments

Scan `$ARGUMENTS` for:
- All tokens matching `[A-Z]+-\d+` → ticket ID list
- A token matching `in-review`, `review` → explicit target status = "In Review"
- A token matching `in-progress`, `progress` → explicit target status = "In Progress"

### 2. Resolve ticket IDs

If no ticket IDs were found in step 1, run:
```sh
git rev-parse --abbrev-ref HEAD
```
Extract all matches of `[A-Z]+-\d+` from the branch name.

If still no ticket IDs, abort with: "No ticket IDs found — pass them explicitly or check out a feature branch."

### 3. Fetch current status and available transitions

For each ticket ID, call `jira_get_issue` to get the current status name, and `jira_get_transitions` to get the list of available transitions (id + name pairs).

### 4. Determine target status

**If an explicit status keyword was given in step 1:** use it directly — skip to step 5.

**If no status keyword was given:** display the current state for each ticket and ask the user to pick:

- Print for each ticket: `ERP-123 is currently: In Progress`
- Use `AskUserQuestion` with one question per ticket (or a single shared question if all tickets are in the same current status). Options are the available transition names from step 3. Include the current status as context in the question label.
- Wait for the user's selection before proceeding.

### 5. Transition each ticket

For each ticket ID, using the chosen target status (either from the explicit argument or from the user's selection in step 4):

1. Find the transition whose `name` matches the target (case-insensitive). If no exact match, try:
   - "In Review" fallbacks: "Code Review", any name containing "review"
   - "In Progress" fallbacks: "Start Progress", "Start Work", any name containing "progress"
2. If a matching transition is found, call `jira_transition_issue` with the ticket ID and transition ID.
3. Report the result inline:
   - Success: `✓ ERP-123 → In Review`
   - Transition not found: `⚠ ERP-123 — no matching transition (available: <list of names>)`
   - API error: `✗ ERP-123 — <error message>`

Do not abort on a single ticket failure — continue with remaining tickets.

### 6. Summary

After all tickets are processed, print a one-line summary:
- All succeeded: `Done. X ticket(s) moved to <status>.`
- Partial: `Done. X succeeded, Y failed — see above.`
