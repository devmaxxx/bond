---
description: Manage the list of projects tracked by /log-plan (add, remove, discover, clear)
---

# /projects

Manage the **projects to track** — the per-user list of repos that `/bond:log-plan`
aggregates commits and PRs across.

The list lives once, in the user's home directory, and applies to every repo. When
it is missing, `/bond:log-plan` falls back to auto-discovery and then aborts.

## Storage

- **Config file:** `$HOME/.bond/projects.json`
- **Format:**
  ```json
  {
    "projects": [
      "/Users/max/Documents/projects/bonliva-erp",
      "/Users/max/Documents/projects/bonliva-crm-nx"
    ]
  }
  ```
- Paths are **absolute repo roots**, pretty-printed, order preserved.

## Arguments

`$ARGUMENTS`:

- _(none)_ — interactive: show the current list, discover candidates, and prompt for a selection (replaces the list).
- `show` — print the currently tracked projects and exit.
- `add <name-or-path>...` — append projects without prompting, e.g. `/projects add bonliva-vms`.
- `remove <name-or-path>...` — drop projects from the list, e.g. `/projects remove bonliva-async-api`.
- `clear` — delete the config file so `/log-plan` falls back to auto-discovery.

## Procedure: discover candidates

Used by the interactive mode and by `add` when resolving a bare name.

1. **Projects root** — the parent of the current repo root:
   ```sh
   dirname "$(git rev-parse --show-toplevel)"
   ```
   If not inside a git repo, ask the user for their projects directory.
2. **Glob `bonliva-*` git repos** under that root:
   ```sh
   ls -d "$PROJECTS_ROOT"/bonliva-*/.git 2>/dev/null | sed 's,/.git,,'
   ```
3. **Drop worktrees.** `/bond:implement` creates sibling worktree directories
   (`bonliva-crm-nx-feat-CRMDEV-7108`, `…-qa`, …) that are checkouts of a repo
   already in the list, not separate projects. A worktree has `.git` as a **file**,
   a real clone has it as a **directory** — keep only the latter:
   ```sh
   for d in "$PROJECTS_ROOT"/bonliva-*/; do [ -d "$d/.git" ] && echo "${d%/}"; done
   ```

## Steps

### 1. Handle `show`

If `$ARGUMENTS` is `show`:

- If `$HOME/.bond/projects.json` exists, print each entry as `- <display_name> — <path>`,
  where `<display_name>` is `<path>/package.json#name` (fall back to the directory
  basename). Mark any path missing on disk with `(missing)`.
- If it does not exist, print: `No projects configured — /log-plan falls back to auto-discovery.`

Then stop.

### 2. Handle `clear`

If `$ARGUMENTS` is `clear`:

```sh
rm -f "$HOME/.bond/projects.json"
```

Confirm: `✓ Cleared tracked projects — /log-plan will auto-discover.` Then stop.

### 3. Handle `add`

For each argument after `add`:

- **Absolute path** → use as-is.
- **Bare name** → resolve against the discovered candidates (**discover candidates**
  procedure), matching case-insensitive substring on the directory basename. No match
  → report the unmatched name and **abort**. More than one match → report the
  candidates and **abort**.

Then, per resolved path:

- Not a directory, or has no `.git` → report and **abort** (nothing is written).
- `.git` is a file → it is a worktree; report and **abort**, naming the main clone.
- Already in the list → skip it and say so.

Append the survivors to the existing list (create `{ "projects": [] }` if the file is
absent), write it (step 6), and stop.

### 4. Handle `remove`

For each argument after `remove`, match against the current list on absolute path or
on directory basename (case-insensitive substring). No match → report and **abort**.
Ambiguous → report the candidates and **abort**.

Drop the matches, write the remaining list (step 6), and stop. If the list ends up
empty, write `{ "projects": [] }` — do not delete the file; that is what `clear` is for.

### 5. Interactive (no arguments)

1. Print the current list, if any.
2. Run the **discover candidates** procedure.
3. Present the candidates via `AskUserQuestion` (multi-select), pre-selecting the ones
   already configured, and invite the user to add others (e.g. repos cloned elsewhere).
4. The reply **replaces** the list. If the user picks nothing, behave like `clear` (step 2).

### 6. Write the config

```sh
mkdir -p "$HOME/.bond"
```

Write `$HOME/.bond/projects.json` as `{ "projects": [ ... ] }`, pretty-printed with
2-space indent. Preserve the order of existing entries and append new ones at the end.

### 7. Confirm

Print the saved list:

```
✓ Tracked projects saved to ~/.bond/projects.json:
  - bonliva-erp
  - bonliva-crm-nx
  - bonliva-vms
```

These are the repos `/bond:log-plan` gathers commits and PRs from.
