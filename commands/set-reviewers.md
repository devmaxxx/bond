---
description: Set or change the default reviewers added to PRs by /open-pr
---

# /set-reviewers

Manage the **default PR reviewers** that `/bond:open-pr` adds to every pull request it creates.

Reviewers are stored once, in the user's home directory, and reused across all repos. If no reviewers are configured, `/open-pr` falls back to the repository's Bitbucket **effective default reviewers**.

## Storage

- **Config file:** `$HOME/.bond/pr-reviewers.json`
- **Format:**
  ```json
  {
    "reviewers": [
      { "uuid": "{c82293ff-0d4a-47ba-bb96-ef08d7f59bb1}", "display_name": "Daniel Khoroshko" }
    ]
  }
  ```
- **Candidate list:** `${CLAUDE_PLUGIN_ROOT}/data/bb-members.json` — a snapshot of the `bonliva` Bitbucket workspace members. Each entry under `.values[].user` has `display_name`, `nickname`, and `uuid`.

## Arguments

`$ARGUMENTS`:

- _(none)_ — interactive: show the current config, list workspace members, and prompt for a selection.
- `show` — print the currently configured default reviewers and exit.
- `clear` — delete the config file so `/open-pr` falls back to Bitbucket effective default reviewers.
- one or more names — set reviewers directly without prompting, e.g. `/set-reviewers Daniel Henrik`. Each name is matched (case-insensitive substring) against member `display_name` and `nickname`.

## Steps

### 1. Handle `show`

If `$ARGUMENTS` is `show`:

- If `$HOME/.bond/pr-reviewers.json` exists, print each reviewer as `- <display_name> <uuid>`.
- If it does not exist, print: `No default reviewers configured — /open-pr uses the repo's Bitbucket effective default reviewers.`

Then stop.

### 2. Handle `clear`

If `$ARGUMENTS` is `clear`:

```sh
rm -f "$HOME/.bond/pr-reviewers.json"
```

Confirm: `✓ Cleared default reviewers — /open-pr will use Bitbucket effective default reviewers.` Then stop.

### 3. Load the candidate member list

Read `${CLAUDE_PLUGIN_ROOT}/data/bb-members.json` and parse `.values`. For each entry build a candidate `{ display_name, nickname, uuid }` from `.user`.

If the file is missing, abort:

> Member list not found at `${CLAUDE_PLUGIN_ROOT}/data/bb-members.json`.

### 4. Resolve the selection

**If `$ARGUMENTS` contains names** — match each name (case-insensitive substring) against `display_name` and `nickname`:

- No match → report the unmatched name and **abort**.
- More than one match → report the ambiguous name and the candidates, and **abort**.

**If `$ARGUMENTS` is empty** — print the current config (if any), then a numbered list of all members:

```
 1. Daniel Khoroshko
 2. Henrik Rundquist
 ...
```

Ask the user:

> Which members should be the default PR reviewers? Reply with the numbers or names, comma-separated (or `none` to clear).

If the user replies `none`, behave like `clear` (step 2). Wait for the reply and resolve it against the list.

### 5. Write the config

Create the directory and write the file:

```sh
mkdir -p "$HOME/.bond"
```

Write `$HOME/.bond/pr-reviewers.json` with the resolved reviewers as `{ "reviewers": [ { "uuid", "display_name" }, ... ] }`. Do not include the current user (`max.synenko`) unless explicitly selected.

### 6. Confirm

Print the saved list:

```
✓ Default PR reviewers saved to ~/.bond/pr-reviewers.json:
  - Daniel Khoroshko
  - Henrik Rundquist
```

These are now added by `/bond:open-pr` to every PR it creates.
