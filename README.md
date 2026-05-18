# bond

Bonliva dev workflow commands and MCP integrations for Claude Code.

## Commands

| Command         | Purpose                                                    |
| --------------- | ---------------------------------------------------------- |
| `/help`         | List all bond plugin commands with their descriptions      |
| `/implement`    | Fetch a Jira ticket, create a typed branch, plan, and code |
| `/log-plan`     | Generate a day/week/month time-log plan                    |
| `/open-pr`      | Open the Bitbucket PR creation page for the current branch |
| `/setup-mcp`    | Install the bond MCP servers (`bond-*`) into the user scope |

## MCP Servers

This plugin ships an MCP server template in `.mcp.json`. Run `/setup-mcp` to
install those servers into your **user-scope** (global) config, where they apply
to every project. To avoid colliding with any servers you already run, each is
installed under a `bond-` prefixed name and exposed as `mcp__bond-<name>__*`:

- **bond-atlassian** — official Atlassian remote MCP server (`https://mcp.atlassian.com/v1/sse`, OAuth, no env vars). Opens a browser on first use.
- **bond-bitbucket** — `bitbucket-mcp-py` (PRs, repositories, pipelines)
- **bond-clockify** — `mcp_clockify` (time entries, projects, tasks, workspaces)

`/setup-mcp` prompts for any missing credentials and writes them via the
`claude mcp` CLI. You can also export them in your environment beforehand so the
command picks them up without prompting:

```bash
export BITBUCKET_USERNAME="you@bonliva.dev"
export BITBUCKET_TOKEN="…"
export CLOCKIFY_API_KEY="…"
```

`BITBUCKET_WORKSPACE` defaults to `https://bitbucket.org` — override if needed.

## Hooks

`PostToolUse` runs prettier on any file edited via `Edit`, `Write`, or `MultiEdit` (no-op when prettier is not available in the project).

## Installation

### From a marketplace (recommended)

```bash
# In Claude Code
/plugin marketplace add devmaxxx/bond
/plugin install bond@devmaxxx
```

### Local dev

Add this directory as a local marketplace:

```bash
/plugin marketplace add /Users/max/Documents/projects/bond
/plugin install bond@devmaxxx
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
├── .mcp.json               # MCP server template (installed via /setup-mcp)
├── LICENSE
└── README.md
```

## License

MIT — see [LICENSE](./LICENSE).
