---
description: Sync project .mcp.json with the bond plugin's MCP server template, prompting for any missing env vars
---

# /setup-mcp

Use the bond plugin's bundled `.mcp.json` (at `${CLAUDE_PLUGIN_ROOT}/.mcp.json`) as the canonical template. Merge any missing servers, args, or env keys into the project's `.mcp.json` (without clobbering values the user has already filled in), and prompt for any env vars that are still missing.

The template currently ships:

| Server | Type | Auth | Notes |
|--------|------|------|-------|
| `atlassian` | `sse` (remote) | OAuth (browser on first use) | Official Atlassian MCP server. No env vars. |
| `bitbucket` | `stdio` (`uvx`) | API token | Requires `uv` toolchain. |
| `clockify` | `stdio` (`npx`) | API key | Requires Node/`npx`. |

Run this after cloning, after a plugin update introduces new servers, or when rotating tokens.

## Steps

### 1. Locate the template

```sh
TEMPLATE="${CLAUDE_PLUGIN_ROOT}/.mcp.json"
```

If `$TEMPLATE` does not exist, abort:

> Plugin MCP template not found at `${CLAUDE_PLUGIN_ROOT}/.mcp.json`.

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

### 3. Load (or initialize) the project `.mcp.json`

Project file is `<repo-root>/.mcp.json` (resolve via `git rev-parse --show-toplevel`).

- If it does not exist: start from `{ "mcpServers": {} }`.
- If it exists: parse as JSON. If parsing fails, abort and ask the user to fix or delete it.

### 4. Detect superseded servers

The plugin previously shipped a `jira` server (`uvx mcp-atlassian`) that is now replaced by the remote `atlassian` SSE server. If the project file still has `mcpServers.jira` with `command: "uvx"` and `args` containing `"mcp-atlassian"`, ask the user (`AskUserQuestion`):

> The legacy `jira` server (`uvx mcp-atlassian`) is superseded by the official `atlassian` SSE server. Remove it?

- **Yes** — delete `mcpServers.jira` from the project file.
- **No** — leave it; both servers can coexist.

### 5. Diff against the template

For each server in `template.mcpServers`:

- **Server missing in project** → add it verbatim from the template.
- **Server exists in project** → reconcile per type:
  - **SSE/HTTP servers**: compare `type` and `url`. If they differ, ask whether to take the template's values. Default: keep the project's. There are no env vars to merge.
  - **stdio servers**: compare `command`, `args`, and the set of `env` keys.
    - If `command` or `args` differ, ask whether to keep theirs or take the template's. Default: keep theirs.
    - For `env`: any key present in the template but missing from the project entry is marked for addition. **Never overwrite existing values** — if the project already has a value (even an empty string), leave it alone.

Servers in the project that are **not** in the template (and not superseded — see step 4) are left untouched.

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

If the user skips a prompt, store the placeholder unresolved (e.g. `"${VAR_NAME}"`) so the next `/setup-mcp` run will pick it up again.

### 7. Write the merged config

Write the resulting JSON to `<repo-root>/.mcp.json` (pretty-printed, 2-space indent). Preserve any servers the project already had that aren't in the template (and weren't removed in step 4).

### 8. Verify and report

Print one of:

- **Already in sync** — `✓ .mcp.json already matches the template, nothing to do.`
- **Updated** — list each change, e.g.:
  ```
  ✓ Added server: atlassian (SSE, OAuth)
  ✓ Removed superseded server: jira
  ✓ Added env key bitbucket.BITBUCKET_TOKEN (prompted)
  ```
  Then remind the user:
  - **Restart Claude Code** to reload MCP servers.
  - On the first call to an `atlassian` tool, a browser tab will open for OAuth — sign in with the Atlassian account that has access to `bonliva.atlassian.net`.

If any placeholders remain unresolved, list them and tell the user to re-run `/setup-mcp`.

## Do NOT

- Do not commit `.mcp.json` — it contains secrets and is gitignored.
- Do not overwrite existing env values, even if they look wrong.
- Do not remove servers the project has but the template doesn't, except for the legacy `jira` superseded-server case in step 4 (and only with user confirmation).
