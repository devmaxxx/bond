---
description: Create or update .mcp.json by substituting env vars into .mcp.json.template
---

# /setup-mcp

Write (or overwrite) the project `.mcp.json` by substituting `${VAR}` placeholders in `.mcp.json.template` with environment variables. Prompts for any that are missing. Run this after cloning or when rotating tokens.

## Steps

### 1. Check template exists

Verify `.mcp.json.template` exists in the project root. If not, abort with:
> `.mcp.json.template` not found in project root.

### 2. Check uvx is installed

The `jira` and `bitbucket` MCP servers run via `uvx` (part of the `uv` toolchain). Check if it's available:

```sh
command -v uvx
```

If not found, install `uv` and tell the user to restart their terminal before continuing:

```sh
curl -LsSf https://astral.sh/uv/install.sh | sh
```

> uvx not found — installing uv. **Restart your terminal, then re-run `/setup-mcp`.**

If the install command fails (e.g. no curl), tell the user to install manually from https://docs.astral.sh/uv/getting-started/installation/ and abort.

### 4. Find all placeholders

Extract every `${VAR_NAME}` from the template:

```sh
grep -o '\${[^}]*}' .mcp.json.template | sed 's/[${}]//g' | sort -u
```

### 5. Check which are missing

For each variable name found in step 2, check if it is set and non-empty in the current environment. Collect the ones that are missing.

### 6. Prompt for missing variables

For each missing variable, use `AskUserQuestion` to ask the user to provide the value. One question per variable — label it with the variable name and a short description of what it's for:

| Variable | Description |
|----------|-------------|
| `JIRA_USERNAME` | Jira account email |
| `JIRA_API_TOKEN` | Jira API token (generate at id.atlassian.com) |
| `BITBUCKET_USERNAME` | Bitbucket account email (e.g. `max.synenko@bonliva.dev`) |
| `BITBUCKET_TOKEN` | Bitbucket API token — get it at https://id.atlassian.com/manage-profile/security/api-tokens. ⚠️ Use a **scoped** token, not a global one. When creating the token, select specific scopes (e.g. Repositories: Read, Pull requests: Read/Write). Global tokens without explicit scopes do not work with this MCP server. |
| `BONLIVA_MCP_TOKEN` | Bearer JWT for the bonliva-erp MCP server |

For any variable not in the table above, ask generically: "Value for `${VAR_NAME}`".

### 7. Substitute and write

Run `envsubst` with all variables set — combining environment variables with any values collected in step 4:

```sh
VAR1=value1 VAR2=value2 envsubst < .mcp.json.template > .mcp.json
```

### 8. Verify and report

Check for any remaining unresolved placeholders:

```sh
grep -o '\${[^}]*}' .mcp.json | sort -u
```

- If none remain: print `✓ .mcp.json written` and remind the user to restart Claude Code to reload the MCP servers.
- If any remain: list them as still-missing and tell the user to re-run `/setup-mcp`.

## Do NOT

- Do not commit `.mcp.json` — it contains secrets and is gitignored.
