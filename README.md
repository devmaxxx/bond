# bond

Bonliva dev workflow commands and MCP integrations for Claude Code.

## Commands

| Command         | Purpose                                                    |
| --------------- | ---------------------------------------------------------- |
| `/implement`    | Fetch a Jira ticket, create a typed branch, plan, and code |
| `/jira-status`  | Transition Jira tickets to a given status                  |
| `/log-plan`     | Generate a day/week/month time-log plan                    |
| `/open-pr`      | Open the Bitbucket PR creation page for the current branch |
| `/setup-mcp`    | Bootstrap project `.mcp.json` from the template            |

## MCP Servers

This plugin ships preconfigured MCP servers in `.mcp.json`:

- **jira** — `mcp-atlassian` (read/write Jira issues, sprints, comments)
- **bitbucket** — `bitbucket-mcp-py` (PRs, repositories, pipelines)

Set the following environment variables before launching Claude Code so the servers can authenticate:

```bash
export JIRA_USERNAME="you@bonliva.dev"
export JIRA_API_TOKEN="…"
export BITBUCKET_USERNAME="you@bonliva.dev"
export BITBUCKET_TOKEN="…"
```

`JIRA_URL` defaults to `https://bonliva.atlassian.net` and `BITBUCKET_WORKSPACE` to `https://bitbucket.org` — override if needed.

## Hooks

`PostToolUse` runs prettier on any file edited via `Edit`, `Write`, or `MultiEdit` (no-op when prettier is not available in the project).

## Installation

### From a marketplace (recommended)

```bash
# In Claude Code
/plugin marketplace add devmaxxx/bond
/plugin install bond@bond
```

### Local dev

Add this directory as a local marketplace:

```bash
/plugin marketplace add /Users/max/Documents/projects/bond
/plugin install bond@bond
```

## Layout

```
bond/
├── .claude-plugin/
│   ├── plugin.json         # plugin manifest
│   └── marketplace.json    # marketplace entry (single-plugin repo)
├── commands/               # slash commands
├── hooks/
│   ├── hooks.json
│   └── format-file.sh
├── .mcp.json               # MCP server declarations
├── LICENSE
└── README.md
```

## License

MIT — see [LICENSE](./LICENSE).
