# bond

Bonliva dev workflow commands and MCP integrations for Claude Code.

## Commands

| Command           | Purpose                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `/help`           | List all bond plugin commands with their descriptions                                         |
| `/chrome-debug`   | Set up/open a debuggable Chrome (LaunchAgent) + install the chrome-devtools MCP pointed at it |
| `/fix-qa`         | Read QA failure feedback from a Jira ticket and re-run implementation to fix it               |
| `/implement`      | Fetch a Jira ticket, create a typed branch, plan, and code                                    |
| `/log-plan`       | Generate a day/week/month time-log plan                                                       |
| `/open-pr`        | Open the Bitbucket PR creation page for the current branch                                    |
| `/request-review` | Post a Teams card inviting reviewers to review a PR                                           |
| `/set-reviewers`  | Set or change the default reviewers added to PRs                                              |
| `/setup-plugin`   | Set up the bond plugin: install MCP servers and configure env vars                            |
| `/teams-post`     | Post a message to a Teams channel via a Workflow webhook                                      |
| `/track-pr`       | Watch a PR pipeline and push a desktop notification on finish                                 |

## MCP Servers

This plugin ships an MCP server template in `.mcp.json`. Run `/setup-plugin` to
install those servers into your **user-scope** (global) config, where they apply
to every project. To avoid colliding with any servers you already run, each is
installed under a `bond-` prefixed name and exposed as `mcp__bond-<name>__*`:

- **bond-atlassian** — official Atlassian remote MCP server (`https://mcp.atlassian.com/v1/sse`, OAuth, no env vars). Opens a browser on first use.
- **bond-bitbucket** — `bitbucket-mcp-py` (PRs, repositories, pipelines)
- **bond-clockify** — `mcp_clockify` (time entries, projects, tasks, workspaces)
- **bond-teams** — `@floriscornel/teams-mcp` (Microsoft Teams chats, channels, messages). No env vars; auth is a one-time CLI step (see below).
- **bond-outline** — `outline-mcp-server` (Outline docs, collections, search)

`/setup-plugin` prompts for any missing credentials and writes them via the
`claude mcp` CLI. You can also export them in your environment beforehand so the
command picks them up without prompting:

```bash
export BITBUCKET_USERNAME="you@bonliva.dev"
export BITBUCKET_TOKEN="…"
export CLOCKIFY_API_KEY="…"
export OUTLINE_API_KEY="…"
export OUTLINE_API_URL="https://docs.bonliva.dev/api"
```

`BITBUCKET_WORKSPACE` defaults to `https://bitbucket.org` — override if needed.
`OUTLINE_API_URL` has no default — `/setup-plugin` prompts for it. Use
`https://docs.bonliva.dev/api` for the Bonliva instance, or
`https://app.getoutline.com/api` for Outline cloud.

`bond-teams` has no env vars. After `/setup-plugin`, authenticate it once with a
Microsoft Graph OAuth flow:

```bash
npx -y @floriscornel/teams-mcp@latest authenticate
```

## Teams channel webhook

`bond-teams` needs a Microsoft Graph token, which a tenant Conditional Access
policy can block (e.g. device-compliance requirements). For **one-way posting to
a Teams channel**, the `/teams-post` command sidesteps Graph entirely: it POSTs
to a Power Automate Workflow webhook, whose URL is a bearer secret with no OAuth.

This posts to a **channel only** — not to 1:1 or group chats.

Create the webhook once, in the Teams client:

1. Open the target **channel** → **⋯** → **Workflows**.
2. Choose the template **"Post to a channel when a webhook request is
   received."**
3. Finish the wizard and copy the generated **HTTP POST URL**.

Then make the URL available as `BOND_TEAMS_WEBHOOK_URL` (treat it as a secret).
Either let `/setup-plugin` prompt for it and store it in `~/.claude/settings.json`
(`env` block), or export it yourself:

```bash
export BOND_TEAMS_WEBHOOK_URL="https://…"
```

Now `/teams-post <message>` delivers a card to that channel. The underlying
`scripts/teams-post.sh` is also usable standalone (CI, hooks):

```bash
BOND_TEAMS_WEBHOOK_URL="https://…" scripts/teams-post.sh --title "Deploy" "Build #42 passed"
```

## Chrome debug (for the chrome-devtools MCP)

`/chrome-debug` lets Claude drive a **real, logged-in browser** instead of the
chrome-devtools MCP's throwaway one. It installs a per-user macOS LaunchAgent that
keeps a debuggable Chrome alive, and installs/points the MCP at it.

```bash
/chrome-debug            # setup: LaunchAgent + start + install bond-chrome-devtools MCP
/chrome-debug open https://localhost:8000   # ensure running, open a URL, focus
/chrome-debug status     # plist state, port reachability, Chrome version
/chrome-debug stop       # unload the agent
```

Why a dedicated profile: Chrome 136+ refuses `--remote-debugging-port` on the
default profile, so the agent runs Chrome with a separate `--user-data-dir`
(`~/.chrome-debug`). Your everyday Chrome is untouched and runs alongside it. The
SSO session persists in that profile, so you only sign in once.

It installs a user-scope MCP server `bond-chrome-devtools` that runs
`npx chrome-devtools-mcp@latest --browserUrl=http://127.0.0.1:9222`, attaching to
the debug Chrome rather than launching its own. After setup, reconnect it
(`/mcp` → `bond-chrome-devtools` → Reconnect) or restart Claude Code.

The underlying `scripts/chrome-debug.sh` is usable standalone (CI, hooks):

```bash
scripts/chrome-debug.sh setup
BOND_CHROME_DEBUG_PORT=9333 scripts/chrome-debug.sh open about:blank
```

Config via env: `BOND_CHROME_DEBUG_PORT` (default `9222`),
`BOND_CHROME_DEBUG_PROFILE` (default `~/.chrome-debug`), `BOND_CHROME_BIN`,
`BOND_CHROME_DEBUG_KEEPALIVE` (`1` = relaunch on quit), `BOND_CHROME_MCP_NAME`
(default `bond-chrome-devtools`). macOS only.

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
├── shared/
│   └── implement-flow.md   # shared procedures used by /implement and /fix-qa
├── data/
│   ├── bb-members.json     # Bitbucket workspace member list (reviewer candidates)
│   ├── teams-users.json    # Teams users → email (mention ids for /request-review)
│   └── pr-review-card.json # Adaptive Card template for /request-review
├── scripts/
│   ├── teams-post.sh       # POST a card to a Teams channel webhook
│   └── chrome-debug.sh     # manage a debuggable Chrome LaunchAgent + its MCP
├── hooks/
│   ├── hooks.json
│   └── format-file.sh
├── .mcp.json               # MCP server template (installed via /setup-plugin)
├── LICENSE
└── README.md
```

## License

MIT — see [LICENSE](./LICENSE).
