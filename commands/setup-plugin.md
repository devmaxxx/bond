---
description: Set up the bond plugin — install its MCP servers into the user-scope (global) config and configure plugin env vars, prompting for anything missing
---

# /setup-plugin

Set up the bond plugin for this user. This does two things:

1. **Install the bond MCP servers** into the **user scope** (global) MCP config so they are available across **all** projects — not just the current repo.
2. **Configure plugin env vars** that bond commands need but that are not MCP server config — currently the `BOND_TEAMS_WEBHOOK_URL` used by `/bond:teams-post` and `/bond:request-review` (see step 6c).

Use the bond plugin's bundled `.mcp.json` (at `${CLAUDE_PLUGIN_ROOT}/.mcp.json`) as the canonical template for the MCP servers.

To avoid colliding with any servers the user already runs, every bond server is named with a **`bond-` prefix**. The template keys are already prefixed, so they install into the user scope verbatim:

| Server (template key = user-scope name) | Type | Auth | Notes |
|-----------------------------------------|------|------|-------|
| `bond-atlassian` | `sse` (remote) | OAuth (browser on first use) | Official Atlassian MCP server. No env vars. |
| `bond-bitbucket` | `stdio` (`uvx`) | API token | Requires `uv` toolchain. |
| `bond-clockify` | `stdio` (`npx`) | API key | Requires Node/`npx`. |
| `bond-teams` | `stdio` (`npx`) | Microsoft Graph OAuth | Requires Node/`npx`. No env vars — auth is a separate one-time CLI step. |
| `bond-outline` | `stdio` (`npx`) | API key | Requires Node/`npx`. |

This command **only ever manages `bond-` prefixed servers**. It never reads values from, modifies, or removes any other user-scope server — including a user's own unprefixed `atlassian` / `bitbucket` / `clockify`. Because the template keys are themselves `bond-` prefixed, each server installs under the exact key from the template with no renaming.

User-scope servers live in the top-level `mcpServers` of `~/.claude.json`. Manage them with the `claude mcp` CLI (`--scope user`) rather than editing `~/.claude.json` by hand — that file also holds session state and is easy to corrupt.

Run this after installing the plugin, after a plugin update introduces new servers, or when rotating tokens.

## Arguments

`$ARGUMENTS` — optional reset flags. With no arguments the command runs in its normal additive mode (never overwrites existing env values).

- `--reset` — **reset all variables.** Re-prompt for every env var of every bond stdio server in the template, plus `BOND_TEAMS_WEBHOOK_URL`, and overwrite the existing values, even if they are already set. Use this to rotate all tokens at once.
- `--reset <VAR_NAME> [<VAR_NAME> ...]` — **reset specific variables.** Re-prompt only for the named env vars (e.g. `--reset BITBUCKET_TOKEN` or `--reset BOND_TEAMS_WEBHOOK_URL`) and overwrite just those, leaving every other existing value untouched.

`--reset` with no variable names means "all"; `--reset` followed by one or more `[A-Z_]+` tokens means just those. A named variable must be either an env key of a bond template server or `BOND_TEAMS_WEBHOOK_URL`; otherwise report it and **abort** before changing anything.

Reset mode never touches `command`, `args`, server names, or non-`bond-` servers — it only re-resolves the targeted env values.

## Steps

### 1. Locate the template

```sh
TEMPLATE="${CLAUDE_PLUGIN_ROOT}/.mcp.json"
```

If `$TEMPLATE` does not exist, abort:

> Plugin MCP template not found at `${CLAUDE_PLUGIN_ROOT}/.mcp.json`.

Parse it as JSON to get `mcpServers`. Every key is already `bond-` prefixed; that key is the user-scope server name. If any key is somehow not `bond-` prefixed, abort and report it — this command installs `bond-` servers only.

### 2. Tooling checks

For each server in the template, check the runtime it needs:

- **`type: "sse"` or `"http"`** (e.g. `bond-atlassian`) — no local tool needed. Note to user: a browser will open for OAuth on first use.
- **`command: "uvx"`** (e.g. `bond-bitbucket`) — verify `uvx` is on PATH:
  ```sh
  command -v uvx
  ```
  If missing, install `uv` and ask the user to restart their shell:
  ```sh
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```
  > uvx not found — installing uv. **Restart your terminal, then re-run `/setup-plugin`.**

  If install fails, point at https://docs.astral.sh/uv/getting-started/installation/ and abort.
- **`command: "npx"`** (e.g. `bond-clockify`) — verify `npx` is on PATH; if missing, tell the user to install Node.js (https://nodejs.org) and abort.

### 3. Read the current user-scope config

List the servers already installed in the user scope:

```sh
claude mcp list --scope user
```

For any `bond-` prefixed server you intend to touch, inspect its current definition (including resolved env keys) with:

```sh
claude mcp get <name>
```

where `<name>` is a `bond-` prefixed template key.

This is the source of truth for what already exists. Do **not** edit `~/.claude.json` directly, and do **not** inspect or rely on any non-`bond-` server.

### 4. Detect superseded servers

The plugin previously shipped a `jira` server (`uvx mcp-atlassian`) that is now replaced by the remote `atlassian` SSE server. If the user scope has a **`bond-jira`** server (or a legacy unprefixed `bond`-installed `jira` server) whose command is `uvx` with `args` containing `mcp-atlassian`, ask the user (`AskUserQuestion`):

> The legacy `bond-jira` server (`uvx mcp-atlassian`) is superseded by `bond-atlassian` (official SSE). Remove it from your user-scope config?

- **Yes** — `claude mcp remove bond-jira --scope user`.
- **No** — leave it.

Never assume an unprefixed `jira` server belongs to bond — leave it alone.

### 5. Diff against the template

For each template key `<name>` (already `bond-` prefixed), compare `template.mcpServers.<name>` against the user-scope server of the same name:

- **`<name>` missing from the user scope** → mark it for install (the template definition verbatim).
- **`<name>` already in the user scope** → reconcile per type:
  - **SSE/HTTP servers**: compare `type` and `url`. If they differ, ask whether to take the template's values. Default: keep the user's existing config. There are no env vars to merge.
  - **stdio servers**: compare `command`, `args`, and the set of `env` keys.
    - If `command` or `args` differ, ask whether to keep theirs or take the template's. Default: keep theirs.
    - For `env`: any key present in the template but missing from the existing server is marked for addition. **Never overwrite existing values** — if the server already has a value (even an empty string) for a key, leave it alone.

**Reset mode override:** if `--reset` was passed, also mark for re-resolution every existing env key that is in scope — all of them for bare `--reset`, or only the named ones for `--reset <VAR_NAME> ...`. These are added to the set from step 6 and will overwrite the current values. Keys outside the reset scope still follow the "never overwrite" rule above.

Any other user-scope server — `bond-` prefixed but not in the template, or any non-`bond-` server — is left completely untouched.

### 6. Resolve env values for additions

Only applies to stdio servers. For each env key being **added** (missing from the user scope), prefer in order:

1. Process environment (`$VAR_NAME` set and non-empty)
2. The template's literal default (e.g. `${BITBUCKET_WORKSPACE:-https://bitbucket.org}` → `https://bitbucket.org` when unset)
3. Prompt the user via `AskUserQuestion`, one question per missing key, using this label table:

For each env key being **reset** (in the `--reset` scope from step 5), always prompt the user via `AskUserQuestion` — do not silently pick up the process environment or template default. The prompt uses the same label table; mention the current value is being replaced.

| Variable | Description |
|----------|-------------|
| `BITBUCKET_USERNAME` | Bitbucket account email (e.g. `max.synenko@bonliva.dev`) |
| `BITBUCKET_TOKEN` | Bitbucket API token — get it at https://id.atlassian.com/manage-profile/security/api-tokens. ⚠️ Use a **scoped** token, not a global one. When creating the token, select specific scopes (e.g. Repositories: Read, Pull requests: Read/Write). Global tokens without explicit scopes do not work with this MCP server. |
| `CLOCKIFY_API_KEY` | Clockify API key — generate at https://app.clockify.me/user/settings (under "API") |
| `OUTLINE_API_KEY` | Outline API token — create one under Settings → API Tokens in your Outline instance |
| `OUTLINE_API_URL` | Outline REST API base URL — must end in `/api`. For Bonliva use `https://docs.bonliva.dev/api`; for Outline cloud use `https://app.getoutline.com/api`. Has no template default, so it is always prompted unless exported. |
| `BONLIVA_MCP_TOKEN` | Bearer JWT for the bonliva-erp MCP server |

For variables not in the table, ask generically: "Value for `${VAR_NAME}`".

If the user skips a prompt, **do not install** that stdio server this run (an unresolved placeholder in the user scope would break the server for every project). Note it and tell the user to re-run `/setup-plugin` once they have the value. SSE servers and servers whose env is fully resolved still get installed.

### 6b. Offer to set default PR reviewers

This applies whenever the `bond-bitbucket` server is being installed or is already present (skip it if `bond-bitbucket` is not part of the template or its env was skipped in step 6).

If `$HOME/.bond/pr-reviewers.json` already exists, skip — reviewers are already configured (mention it: "Default PR reviewers already set — change them with `/bond:set-reviewers`.").

Otherwise ask the user (`AskUserQuestion`):

> Set default PR reviewers for `/bond:open-pr` now? If you skip this, `/open-pr` uses each repo's Bitbucket effective default reviewers.

- **Yes** — run the `/bond:set-reviewers` flow inline: read the member list from `${CLAUDE_PLUGIN_ROOT}/data/bb-members.json`, present the numbered member list, prompt for a selection, and write `$HOME/.bond/pr-reviewers.json`.
- **Skip** — do nothing; `/open-pr` falls back to Bitbucket effective default reviewers. Note the user can set them later with `/bond:set-reviewers`.

This is always optional — skipping it never blocks installation of `bond-bitbucket` or any other server.

### 6c. Configure the Teams channel webhook

`BOND_TEAMS_WEBHOOK_URL` is the Power Automate Workflow webhook URL used by
`/bond:teams-post` and `/bond:request-review`. It is **not** an MCP server env var —
it is an environment variable read by `scripts/teams-post.sh` when bond commands
shell out to it, so it is stored in the user-scope Claude settings rather than the
MCP config.

Check whether it is already configured:

1. Process environment — `$BOND_TEAMS_WEBHOOK_URL` set and non-empty.
2. `~/.claude/settings.json` — an `env.BOND_TEAMS_WEBHOOK_URL` entry.

Decide:

- **Already set and not in the `--reset` scope** → skip; mention "Teams webhook already configured — change it with `/setup-plugin --reset BOND_TEAMS_WEBHOOK_URL`."
- **Missing, or in the `--reset` scope** → ask the user via `AskUserQuestion`:

  > Teams channel webhook URL for `/bond:teams-post` and `/bond:request-review`. Create a "Post to a channel when a webhook request is received" Workflow in Teams and paste its POST URL here. Treat it as a secret. Skip if you don't use the Teams commands.

If the user provides a value, write it to `~/.claude/settings.json` under the
top-level `env` object as `BOND_TEAMS_WEBHOOK_URL`:

- Read the existing `~/.claude/settings.json` (or start from `{}` if absent), add/replace
  `env.BOND_TEAMS_WEBHOOK_URL`, and write it back — **preserve every other key**. Create
  the `env` object if it does not exist.
- The value takes effect for Bash tool calls after the next Claude Code restart.

This is optional — skipping it never blocks the rest of setup. If skipped, note the
user can set it later with `/setup-plugin --reset BOND_TEAMS_WEBHOOK_URL` or by
exporting the variable in their shell profile.

### 7. Install / update servers in the user scope

For each server to install or update, write it with `claude mcp add-json` at user scope. The template key `<name>` is already `bond-` prefixed and is used as-is. Build the full per-server JSON object (the value from `template.mcpServers.<name>`, with env values resolved from step 6) and run:

```sh
claude mcp add-json <name> '<json>' --scope user
```

`add-json` overwrites an existing server of the same name, so when updating an existing server pass the **merged** object — template definition plus every existing env value preserved from step 5 — not the bare template. For env keys in the `--reset` scope, use the freshly prompted value from step 6 instead of the preserved one.

For a server that needs no changes at all, skip it (don't re-add). In reset mode, a server is "changed" if any of its env keys is in the reset scope.

### 8. Verify and report

Run `claude mcp list --scope user` to confirm, then print one of:

- **Already in sync** — `✓ bond-* user-scope MCP servers already match the template, nothing to do.`
- **Updated** — list each change, e.g.:
  ```
  ✓ Installed server (user scope): bond-atlassian (SSE, OAuth)
  ✓ Removed superseded server: bond-jira
  ✓ Installed server (user scope): bond-bitbucket (env prompted)
  ✓ Reset env values: BITBUCKET_TOKEN on bond-bitbucket
  ✓ Configured BOND_TEAMS_WEBHOOK_URL in ~/.claude/settings.json
  ```
  Then remind the user:
  - **Restart Claude Code** to reload MCP servers.
  - These servers now apply to **every project** you open, exposed as `mcp__bond-<name>__*` tools.
  - On the first call to a `bond-atlassian` tool, a browser tab will open for OAuth — sign in with the Atlassian account that has access to `bonliva.atlassian.net`.
  - If `bond-teams` was installed, authentication is a **separate one-time CLI step** (the server has no env vars). Tell the user to run, in their terminal:
    ```sh
    npx -y @floriscornel/teams-mcp@latest authenticate
    ```
    This opens a Microsoft Graph OAuth flow and caches a token in their home directory. `bond-teams` tools will fail until this completes.

If any stdio server was skipped for missing env (step 6), list it and tell the user to re-run `/setup-plugin`.

## Do NOT

- Do not edit `~/.claude.json` directly — always go through the `claude mcp` CLI. That file holds session state and is easy to corrupt.
- Do not write a project `.mcp.json` — this command installs to the user scope only.
- Do not touch any server that is not `bond-` prefixed, or any `bond-` server not in the template. The command manages only the bond template servers.
- Do not overwrite existing env values, even if they look wrong — **unless** `--reset` was passed, which deliberately re-prompts and overwrites the targeted keys.
- Do not install a stdio server with an unresolved `${VAR}` placeholder — skip it instead.
- Do not echo or log the `BOND_TEAMS_WEBHOOK_URL` value — it is a bearer secret. When writing `~/.claude/settings.json`, preserve all other keys.
