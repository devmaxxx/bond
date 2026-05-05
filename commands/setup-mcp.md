---
description: Sync project .mcp.json with the bond plugin's MCP server template, prompting for any missing env vars
---

# /setup-mcp

Use the bond plugin's bundled `.mcp.json` (at `${CLAUDE_PLUGIN_ROOT}/.mcp.json`) as the canonical template. Merge any missing servers, args, or env keys into the project's `.mcp.json` (without clobbering values the user has already filled in), and prompt for any env vars that are still missing.

Run this after cloning, after a plugin update introduces new servers, or when rotating tokens.

## Steps

### 1. Locate the template

The template is the plugin's own MCP config:

```sh
TEMPLATE="${CLAUDE_PLUGIN_ROOT}/.mcp.json"
```

If `$TEMPLATE` does not exist, abort with:

> Plugin MCP template not found at `${CLAUDE_PLUGIN_ROOT}/.mcp.json`.

### 2. Check `uvx` is installed

The `jira` and `bitbucket` servers run via `uvx` (part of the `uv` toolchain):

```sh
command -v uvx
```

If missing, install `uv` and tell the user to restart their shell:

```sh
curl -LsSf https://astral.sh/uv/install.sh | sh
```

> uvx not found — installing uv. **Restart your terminal, then re-run `/setup-mcp`.**

If install fails, point the user at https://docs.astral.sh/uv/getting-started/installation/ and abort.

### 3. Load (or initialize) the project `.mcp.json`

Project file is `<repo-root>/.mcp.json` (resolve via `git rev-parse --show-toplevel`).

- If the project file does not exist: start from an empty config `{ "mcpServers": {} }`.
- If it exists: parse it as JSON. If parsing fails, abort and ask the user to fix or delete it.

### 4. Diff against the template

For each server in `template.mcpServers`:

- **Server missing in project** → mark the whole server for addition.
- **Server exists** → compare `command`, `args`, and the set of `env` keys:
  - If `command` or `args` differ from the template, ask the user (`AskUserQuestion`) whether to keep their version or take the template's. Default: keep theirs.
  - For `env`: any key present in the template but missing from the project entry is marked for addition. **Never overwrite existing values** — if the project already has a value (even an empty string), leave it alone.

Servers in the project that are **not** in the template are left untouched.

### 5. Resolve env values for additions

For each env key being added, prefer in order:

1. Process environment (`$VAR_NAME` set and non-empty)
2. The template's literal default (e.g. `${JIRA_URL:-https://bonliva.atlassian.net}` → `https://bonliva.atlassian.net` when `JIRA_URL` is unset)
3. Prompt the user via `AskUserQuestion`, one question per missing key, using this label table:

| Variable | Description |
|----------|-------------|
| `JIRA_USERNAME` | Jira account email |
| `JIRA_API_TOKEN` | Jira API token (generate at id.atlassian.com) |
| `BITBUCKET_USERNAME` | Bitbucket account email (e.g. `max.synenko@bonliva.dev`) |
| `BITBUCKET_TOKEN` | Bitbucket API token — get it at https://id.atlassian.com/manage-profile/security/api-tokens. ⚠️ Use a **scoped** token, not a global one. When creating the token, select specific scopes (e.g. Repositories: Read, Pull requests: Read/Write). Global tokens without explicit scopes do not work with this MCP server. |
| `CLOCKIFY_API_KEY` | Clockify API key — generate at https://app.clockify.me/user/settings (under "API") |
| `BONLIVA_MCP_TOKEN` | Bearer JWT for the bonliva-erp MCP server |

For variables not in the table, ask generically: "Value for `${VAR_NAME}`".

If the user skips a prompt, store the placeholder unresolved (e.g. `"${VAR_NAME}"`) so the next `/setup-mcp` run will pick it up again.

### 6. Write the merged config

Write the resulting JSON to `<repo-root>/.mcp.json` (pretty-printed, 2-space indent). Preserve any keys/servers the project already had that aren't in the template.

### 7. Verify and report

Print one of:

- **Already in sync** — `✓ .mcp.json already matches the template, nothing to do.`
- **Updated** — list each addition, e.g.:
  ```
  ✓ Added server: clockify
  ✓ Added env key bitbucket.BITBUCKET_TOKEN (prompted)
  ✓ Added env key jira.JIRA_URL (default)
  ```
  Then remind the user: **Restart Claude Code to reload the MCP servers.**

If any placeholders remain unresolved, list them and tell the user to re-run `/setup-mcp`.

## Do NOT

- Do not commit `.mcp.json` — it contains secrets and is gitignored.
- Do not overwrite existing env values, even if they look wrong.
- Do not remove servers or keys the project has but the template doesn't.
