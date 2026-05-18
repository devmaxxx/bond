---
description: Install the bond plugin's MCP servers into the user-scope (global) MCP config under bond-prefixed names, prompting for any missing env vars
---

# /setup-mcp

Use the bond plugin's bundled `.mcp.json` (at `${CLAUDE_PLUGIN_ROOT}/.mcp.json`) as the canonical template. Install its servers into the **user scope** (global) MCP config so they are available to this user across **all** projects — not just the current repo.

To avoid colliding with any servers the user already runs, every bond server is installed under a **`bond-` prefixed name**. The template ships server keys `atlassian`, `bitbucket`, `clockify`; they are installed as:

| Template key | Installed as (user scope) | Type | Auth | Notes |
|--------------|---------------------------|------|------|-------|
| `atlassian` | `bond-atlassian` | `sse` (remote) | OAuth (browser on first use) | Official Atlassian MCP server. No env vars. |
| `bitbucket` | `bond-bitbucket` | `stdio` (`uvx`) | API token | Requires `uv` toolchain. |
| `clockify` | `bond-clockify` | `stdio` (`npx`) | API key | Requires Node/`npx`. |

This command **only ever manages `bond-` prefixed servers**. It never reads values from, modifies, or removes any other user-scope server — including a user's own unprefixed `atlassian` / `bitbucket` / `clockify`.

User-scope servers live in the top-level `mcpServers` of `~/.claude.json`. Manage them with the `claude mcp` CLI (`--scope user`) rather than editing `~/.claude.json` by hand — that file also holds session state and is easy to corrupt.

Run this after installing the plugin, after a plugin update introduces new servers, or when rotating tokens.

## Steps

### 1. Locate the template

```sh
TEMPLATE="${CLAUDE_PLUGIN_ROOT}/.mcp.json"
```

If `$TEMPLATE` does not exist, abort:

> Plugin MCP template not found at `${CLAUDE_PLUGIN_ROOT}/.mcp.json`.

Parse it as JSON to get `mcpServers`. For each template key `<name>`, the target user-scope server name is `bond-<name>`.

### 2. Tooling checks

For each server in the template, check the runtime it needs:

- **`type: "sse"` or `"http"`** (e.g. `atlassian`) — no local tool needed. Note to user: a browser will open for OAuth on first use.
- **`command: "uvx"`** (e.g. `bitbucket`) — verify `uvx` is on PATH:
  ```sh
  command -v uvx
  ```
  If missing, install `uv` and ask the user to restart their shell:
  ```sh
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```
  > uvx not found — installing uv. **Restart your terminal, then re-run `/setup-mcp`.**

  If install fails, point at https://docs.astral.sh/uv/getting-started/installation/ and abort.
- **`command: "npx"`** (e.g. `clockify`) — verify `npx` is on PATH; if missing, tell the user to install Node.js (https://nodejs.org) and abort.

### 3. Read the current user-scope config

List the servers already installed in the user scope:

```sh
claude mcp list --scope user
```

For any `bond-` prefixed server you intend to touch, inspect its current definition (including resolved env keys) with:

```sh
claude mcp get bond-<name>
```

This is the source of truth for what already exists. Do **not** edit `~/.claude.json` directly, and do **not** inspect or rely on any non-`bond-` server.

### 4. Detect superseded servers

The plugin previously shipped a `jira` server (`uvx mcp-atlassian`) that is now replaced by the remote `atlassian` SSE server. If the user scope has a **`bond-jira`** server (or a legacy unprefixed `bond`-installed `jira` server) whose command is `uvx` with `args` containing `mcp-atlassian`, ask the user (`AskUserQuestion`):

> The legacy `bond-jira` server (`uvx mcp-atlassian`) is superseded by `bond-atlassian` (official SSE). Remove it from your user-scope config?

- **Yes** — `claude mcp remove bond-jira --scope user`.
- **No** — leave it.

Never assume an unprefixed `jira` server belongs to bond — leave it alone.

### 5. Diff against the template

For each template key `<name>`, compare `template.mcpServers.<name>` against the user-scope server `bond-<name>`:

- **`bond-<name>` missing from the user scope** → mark it for install (the template definition, renamed to `bond-<name>`).
- **`bond-<name>` already in the user scope** → reconcile per type:
  - **SSE/HTTP servers**: compare `type` and `url`. If they differ, ask whether to take the template's values. Default: keep the user's existing config. There are no env vars to merge.
  - **stdio servers**: compare `command`, `args`, and the set of `env` keys.
    - If `command` or `args` differ, ask whether to keep theirs or take the template's. Default: keep theirs.
    - For `env`: any key present in the template but missing from the existing server is marked for addition. **Never overwrite existing values** — if the server already has a value (even an empty string) for a key, leave it alone.

Any other user-scope server — `bond-` prefixed but not in the template, or any non-`bond-` server — is left completely untouched.

### 6. Resolve env values for additions

Only applies to stdio servers. For each env key being added, prefer in order:

1. Process environment (`$VAR_NAME` set and non-empty)
2. The template's literal default (e.g. `${BITBUCKET_WORKSPACE:-https://bitbucket.org}` → `https://bitbucket.org` when unset)
3. Prompt the user via `AskUserQuestion`, one question per missing key, using this label table:

| Variable | Description |
|----------|-------------|
| `BITBUCKET_USERNAME` | Bitbucket account email (e.g. `max.synenko@bonliva.dev`) |
| `BITBUCKET_TOKEN` | Bitbucket API token — get it at https://id.atlassian.com/manage-profile/security/api-tokens. ⚠️ Use a **scoped** token, not a global one. When creating the token, select specific scopes (e.g. Repositories: Read, Pull requests: Read/Write). Global tokens without explicit scopes do not work with this MCP server. |
| `CLOCKIFY_API_KEY` | Clockify API key — generate at https://app.clockify.me/user/settings (under "API") |
| `BONLIVA_MCP_TOKEN` | Bearer JWT for the bonliva-erp MCP server |

For variables not in the table, ask generically: "Value for `${VAR_NAME}`".

If the user skips a prompt, **do not install** that stdio server this run (an unresolved placeholder in the user scope would break the server for every project). Note it and tell the user to re-run `/setup-mcp` once they have the value. SSE servers and servers whose env is fully resolved still get installed.

### 7. Install / update servers in the user scope

For each server to install or update, write it with `claude mcp add-json` at user scope under its `bond-` prefixed name. Build the full per-server JSON object (the value from `template.mcpServers.<name>`, with env values resolved from step 6) and run:

```sh
claude mcp add-json bond-<name> '<json>' --scope user
```

`add-json` overwrites an existing server of the same name, so when updating an existing `bond-<name>` pass the **merged** object — template definition plus every existing env value preserved from step 5 — not the bare template.

For a server that needs no changes at all, skip it (don't re-add).

### 8. Verify and report

Run `claude mcp list --scope user` to confirm, then print one of:

- **Already in sync** — `✓ bond-* user-scope MCP servers already match the template, nothing to do.`
- **Updated** — list each change, e.g.:
  ```
  ✓ Installed server (user scope): bond-atlassian (SSE, OAuth)
  ✓ Removed superseded server: bond-jira
  ✓ Installed server (user scope): bond-bitbucket (env prompted)
  ```
  Then remind the user:
  - **Restart Claude Code** to reload MCP servers.
  - These servers now apply to **every project** you open, exposed as `mcp__bond-<name>__*` tools.
  - On the first call to a `bond-atlassian` tool, a browser tab will open for OAuth — sign in with the Atlassian account that has access to `bonliva.atlassian.net`.

If any stdio server was skipped for missing env (step 6), list it and tell the user to re-run `/setup-mcp`.

## Do NOT

- Do not edit `~/.claude.json` directly — always go through the `claude mcp` CLI. That file holds session state and is easy to corrupt.
- Do not write a project `.mcp.json` — this command installs to the user scope only.
- Do not touch any server that is not `bond-` prefixed, or any `bond-` server not in the template. The command manages only the bond template servers.
- Do not overwrite existing env values, even if they look wrong.
- Do not install a stdio server with an unresolved `${VAR}` placeholder — skip it instead.
