# bond

Bonliva dev workflow commands and MCP integrations for Claude Code.

## Commands

| Command           | Purpose                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `/help`           | List all bond plugin commands with their descriptions                                         |
| `/chrome-debug`   | Set up/open a debuggable Chrome (LaunchAgent) + install the chrome-devtools MCP pointed at it |
| `/fix-qa`         | Read QA failure feedback from a Jira ticket and re-run implementation to fix it               |
| `/implement`      | Fetch (or create) a Jira ticket, create a typed branch, plan, and code                        |
| `/jira`           | Create, edit, assign, comment on, or transition a Jira issue (assigned to you by default)     |
| `/log-plan`       | Generate a day/week/month time-log plan                                                       |
| `/open-pr`        | Open the Bitbucket PR creation page for the current branch                                    |
| `/projects`       | Manage the projects tracked by `/log-plan` (add, remove, discover, clear)                     |
| `/request-review` | Post a Teams card inviting reviewers to review a PR                                           |
| `/set-reviewers`  | Set or change the default reviewers added to PRs                                              |
| `/setup-plugin`   | Set up the bond plugin: install MCP servers and configure env vars                            |
| `/start`          | Create a new Jira issue and check out a fresh typed branch to start work on it                |
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

- `PostToolUse` runs prettier on any file edited via `Edit`, `Write`, or `MultiEdit` (no-op when prettier is not available in the project), then `hooks/check-doc.mjs` scans a just-written `*.md|mdx|txt` for AI signatures and reports the lines back.
- `PreToolUse` on `Bash` runs `hooks/check-commit.mjs`: a `git commit` / `gh pr …` whose message carries an AI signature (`Co-Authored-By` naming a tool, `Claude-Session:`, "generated with") or a non-Conventional-Commits subject is blocked with the reasons. Patterns live in `hooks/ai-breadcrumbs.mjs`; see the `oleg-skills` skill.

## Skills

- **stop-slop** — removes predictable AI writing patterns from prose. Auto-triggers when drafting, editing, or reviewing text. Bundled under `skills/stop-slop/`.
- **single-pass-iteration** — collapses repeated iterations over the same collection (multiple `.reduce()`, `.filter().map()` chains, duplicate loops) into a single pass. Triggers on cleanup/optimize/refactor requests and during code review. Bundled under `skills/single-pass-iteration/`.
- **always-use-braces** — wraps every `if`/`else`/`for`/`while` body in curly braces, even one-liners and guard clauses. Triggers when writing or reviewing JS/TS control flow. Bundled under `skills/always-use-braces/`.
- **readable-code-structure** — splits long functions into small named ones and replaces awkward/clever control flow (search loops, N+1 in loops, nested ternaries, flag params) with plain expressions. Triggers on clean-up/refactor/"make this readable" requests and during review. Bundled under `skills/readable-code-structure/`.
- **comment-hygiene** — comments the *why*, deletes comments that restate the code, strips ticket IDs, and handles tool directives / TODOs / dead code / license headers. Triggers on writing or reviewing comments and on clean-up/"remove comments" requests. Bundled under `skills/comment-hygiene/`.
- **testing-behavior** — writes tests that pin the caller's contract, not the current implementation; refuses change-detector tests and tautologies, and stops to ask before enshrining suspicious behaviour. Triggers when adding, editing, or reviewing tests. Bundled under `skills/testing-behavior/`.
- **vertical-horizontal-review** — enforces a two-pass code review: vertical (trace one feature through every layer) + horizontal (sweep every sibling of the kinds the change touches for drift). Project-agnostic. Triggers on "review this change/diff/branch/PR". Bundled under `skills/vertical-horizontal-review/`.
- **pr-template** — enforces the one shared PR title + description format (Summary / Jira / Test plan) and the default reviewer list on every pull request, sourced from `shared/pr-template.md`. Triggers on "open/create/draft a PR" and manual `create_pull_request` calls. Bundled under `skills/pr-template/`.
- **woodpecker-cli** — drives a Woodpecker CI server from the terminal: auth (`WOODPECKER_SERVER` / `WOODPECKER_TOKEN`), the command map, step-scoped log reading for failed pipelines, and `lint` / `exec` for `.woodpecker.yaml`. Triggers on "woodpecker", "pipeline logs", "why did the pipeline fail". Bundled under `skills/woodpecker-cli/`.

- **oleg-skills** — commit, PR and document conventions: Conventional Commits subject, prose _why_ body, one human owner, zero AI signatures (no `Co-Authored-By` naming a tool, no `Claude-Session:`, no "generated with") in commits, PR bodies/comments or docs. Backed by the `check-commit` / `check-doc` hooks. Triggers on "commit", "amend", "open a PR", "write the ADR/plan/README". Bundled under `skills/oleg-skills/`.
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
├── skills/
│   ├── stop-slop/          # prose-cleanup skill bundled with the plugin
│   ├── single-pass-iteration/  # merge redundant array passes into one
│   ├── always-use-braces/  # brace every if/else/for/while body
│   ├── readable-code-structure/  # small named functions + plain control flow
│   ├── comment-hygiene/    # comment the why, delete the what
│   ├── testing-behavior/   # test the contract, not the implementation
│   ├── vertical-horizontal-review/  # two-pass review: depth + sibling sweep
│   ├── pr-template/         # one shared PR title + description + reviewers
│   ├── woodpecker-cli/      # Woodpecker CI CLI: auth, commands, lint/exec
│   └── oleg-skills/         # commit/PR/doc conventions, no AI signatures
├── shared/
│   ├── implement-flow.md   # shared procedures used by /implement and /fix-qa
│   └── pr-template.md      # single source of truth for PR title + description
├── data/
│   ├── bb-members.json     # Bitbucket workspace member list (reviewer candidates)
│   ├── teams-users.json    # Teams users → email (mention ids for /request-review)
│   └── pr-review-card.json # Adaptive Card template for /request-review
├── scripts/
│   ├── teams-post.sh       # POST a card to a Teams channel webhook
│   └── chrome-debug.sh     # manage a debuggable Chrome LaunchAgent + its MCP
├── hooks/
│   ├── hooks.json
│   ├── format-file.sh      # PostToolUse: prettier on the edited file
│   ├── ai-breadcrumbs.mjs  # shared AI-signature patterns
│   ├── check-commit.mjs    # PreToolUse: block git commit / gh pr with a signature
│   └── check-doc.mjs       # PostToolUse: flag a written md/txt with a signature
├── .mcp.json               # MCP server template (installed via /setup-plugin)
├── LICENSE
└── README.md
```

## License

MIT — see [LICENSE](./LICENSE).
