# bond

Dev workflow commands and MCP integrations for Claude Code. Built inside Bonliva,
but every command resolves a per-repo profile, so they work outside it too.

## Commands

| Command           | Purpose                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `/help`           | List all bond plugin commands with their descriptions                                         |
| `/chrome-debug`   | Fallback browser path: set up/open a debuggable Chrome (LaunchAgent) + install the chrome-devtools MCP pointed at it, when claude-in-chrome can't be used |
| `/disk-analyze`   | Analyze disk usage: runaway logs, deleted-but-open files, caches; clean the safe ones          |
| `/fix-pr`         | Diagnose why a PR's CI failed (Bitbucket or GitHub), fix the root causes, and push             |
| `/fix-qa`         | Re-run implementation against QA feedback — from a Jira ticket, or given as free text          |
| `/implement`      | Fetch (or create) a Jira ticket — or take a free-text task where there is no tracker — then branch, plan, and code |
| `/investigate`    | Investigate a deployed failure to a proven root cause and write the investigation doc         |
| `/jira`           | Create, edit, assign, comment on, or transition a Jira issue (assigned to you by default)     |
| `/log-plan`       | Generate a day/week/month time-log plan                                                       |
| `/open-pr`        | Open a draft PR for the current branch (GitHub or Bitbucket, resolved per repo)               |
| `/projects`       | Manage the projects tracked by `/log-plan` (add, remove, discover, clear)                     |
| `/publish-timelog`| Publish a time-log md to Jira + Clockify (one entry/day) and reconcile the totals              |
| `/request-review` | Post a Teams card inviting reviewers to review a PR                                           |
| `/set-reviewers`  | Set or change the default reviewers added to PRs                                              |
| `/setup-plugin`   | Set up the bond plugin: install MCP servers and configure env vars                            |
| `/start`          | Check out a fresh typed branch — creating the Jira issue first where there is a tracker        |
| `/teams-post`     | Post a message to a Teams channel via a Workflow webhook                                      |
| `/track-pr`       | Watch a PR's CI (Bitbucket or GitHub) and push a desktop notification on finish                |

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

## Browser access

Anything in this plugin that needs a browser — reading a Jira attachment,
pulling Teams calls in `/log-plan`, opening a failing page in `/investigate` —
uses **`claude-in-chrome`** whenever it is available. It drives the user's real
Chrome through the browser extension, so the SSO sessions are already there and
no profile, LaunchAgent or debug port has to be stood up first. Load the tools
with `ToolSearch` (`select:mcp__claude-in-chrome__tabs_context_mcp,…`) before
using them.

Fall back to `/chrome-debug` and the CDP-based `chrome-devtools` MCP only when
`claude-in-chrome` cannot do the job:

- the extension is not installed, or has not been granted the site
- the task needs raw CDP — a performance trace, a heap snapshot, a Lighthouse
  audit, `evaluate_script` against a target
- it has to run unattended: CI, a hook, headless

If neither is available, skip the step and say so rather than asking the user to
sign in — never enter credentials on their behalf.

## Chrome debug (fallback, for the chrome-devtools MCP)

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

## Standing rules

`SessionStart` prints `shared/standing-rules.md` into every session — the rules
that used to live in a personal `~/.claude/CLAUDE.md`, so the plugin carries
them instead of the machine. A plugin has no declarative way to ship always-on
instructions (skills and agents load on demand, and there is no auto-loaded
plugin `CLAUDE.md`), so a hook is the mechanism.

Set `BOND_USER_NAME` to the name replies should open with; it falls back to
`git config user.name`, and the greeting rule is dropped when neither resolves.
The name is never committed — this repo is public.

## Project profile

Commands are not Bonliva-only. `shared/project-profile.md` resolves, per repo,
the PR host, the base branch, whether there is a Jira tracker at all, and who
the reviewers are. A repo can state its own answers in `.bond/project.json`;
otherwise they are inferred from the `origin` remote. Outside Bonliva the
tracker resolves to `none`, and `/implement` takes a free-text task, cuts a
`<type>/<description>` branch and opens a PR with no `## Jira` section.

Every command reads that profile rather than assuming a host or a tracker:

- **Host-flexible** — `/open-pr`, `/fix-pr`, `/track-pr` work against Bitbucket
  Pipelines and GitHub Actions alike; the profile's *Resolve PR coordinates* and
  *PR details and CI status* procedures normalise both to one vocabulary, so no
  command branches on a host-specific status string.
- **Tracker-flexible** — `/implement`, `/start` and `/fix-qa` take free text
  where there is no Jira; `/fix-qa` applies it to the branch already checked out.
- **Guarded, not faked** — `/jira`, `/request-review`, `/publish-timelog` and
  `/log-plan` genuinely need Jira, a Teams channel or Clockify. They say which
  prerequisite is missing and stop, rather than pretending to work.

`/projects` discovery is no longer hardwired to `bonliva-*`: set
`BOND_PROJECT_GLOB`, or `projectGlob` in `~/.bond/projects.json`.

## Hooks

- `SessionStart` runs `hooks/standing-rules.mjs`: the standing rules above. Registered with no matcher, so it fires on every start reason — startup, resume, clear, compact and fork alike. That is deliberate: rules that do not survive a compaction quietly stop applying halfway through a long session, and a matcher that failed to parse would drop them silently.
- `PostToolUse` runs prettier on any file edited via `Edit`, `Write`, or `MultiEdit` (no-op when prettier is not available in the project), then `hooks/check-doc.mjs` scans a just-written `*.md|mdx|txt` for AI signatures and reports the lines back.
- `PreToolUse` on `Bash` runs `hooks/check-commit.mjs`: a `git commit` / `gh pr …` whose message carries an AI signature (`Co-Authored-By` naming a tool, `Claude-Session:`, "generated with") or a non-Conventional-Commits subject is blocked with the reasons. Patterns live in `hooks/ai-breadcrumbs.mjs`; see the `authorship-conventions` skill.
- `PreToolUse` on `Bash` and the Bitbucket `create_pull_request` / `create_draft_pull_request` MCP calls runs `hooks/check-pr.mjs`: a PR whose title or body misses the shared Summary / Test plan shape, is not opened as a draft, or carries an AI signature is blocked with the reasons. See the `pr-template` skill and `shared/pr-template.md`. The rule lives in `hooks/pr-template.mjs`: it recognises the PR command only where the shell would run one — not inside a heredoc body, a quoted string or a comment — and treats only the configured Jira project keys as ticket ids, so `UTF-8` and `SHA-256` are prose.

## Tests

The hook rules are unit-tested with the Node test runner — no dependencies, no
install step. Both matchers, the ticket-key rule and the standing-rules
rendering are covered, and `check-commit.mjs` is driven end to end over stdin:

```sh
node --test 'tests/**/*.test.mjs'
```

## Skills

- **readable-code-structure** — splits long functions into small named ones and replaces awkward/clever control flow (search loops, N+1 in loops, nested ternaries, flag params) with plain expressions. Triggers on clean-up/refactor/"make this readable" requests and during review. Also carries the two mechanical rules that share its trigger exactly: brace every control body (one-liners and guard clauses included), and collapse repeated passes over one collection. Bundled under `skills/readable-code-structure/`.
- **comment-hygiene** — comments the *why*, deletes comments that restate the code, strips ticket IDs, and handles tool directives / TODOs / dead code / license headers. Triggers on writing or reviewing comments and on clean-up/"remove comments" requests. Bundled under `skills/comment-hygiene/`.
- **testing-behavior** — writes tests that pin the caller's contract, not the current implementation; refuses change-detector tests and tautologies, and stops to ask before enshrining suspicious behaviour. Triggers when adding, editing, or reviewing tests. Bundled under `skills/testing-behavior/`.
- **vertical-horizontal-review** — enforces a two-pass code review: vertical (trace one feature through every layer) + horizontal (sweep every sibling of the kinds the change touches for drift). Project-agnostic. Triggers on "review this change/diff/branch/PR". Bundled under `skills/vertical-horizontal-review/`.
- **pr-template** — enforces the one shared PR title + description format (Summary / Jira / Test plan) and the default reviewer list on every pull request, sourced from `shared/pr-template.md`. Triggers on "open/create/draft a PR" and manual `create_pull_request` calls. Bundled under `skills/pr-template/`.
- **woodpecker-cli** — drives a Woodpecker CI server from the terminal: auth (`WOODPECKER_SERVER` / `WOODPECKER_TOKEN`), the command map, step-scoped log reading for failed pipelines, and `lint` / `exec` for `.woodpecker.yaml`. Triggers on "woodpecker", "pipeline logs", "why did the pipeline fail". Bundled under `skills/woodpecker-cli/`.
- **authorship-conventions** — naming and attribution for every git artefact: Conventional Branch `<type>/<description>`, Conventional Commits subject, prose _why_ body, one human owner, zero AI signatures (no `Co-Authored-By` naming a tool, no `Claude-Session:`, no "generated with") in commits, PR bodies/comments or docs — plus the rename trap: renaming a branch after its PR is open closes the PR. Bonliva repos keep the `<prefix>/<KEY>` branch shape bond imposes; everywhere else the spec wins. Backed by the `check-commit` / `check-doc` hooks. Triggers on `checkout -b`, "commit", "amend", "open a PR", "write the ADR/plan/README". Also decides which of the two `gh` accounts pushes — the active one is machine-global, so another session may have moved it since. Bundled under `skills/authorship-conventions/`.
- **routing-model-and-effort** — picks a (model, effort) pair per task phase: opus/high by default, fable for planning only on the hard predicates, opus for every build unless a model is named, and a fresh `bond:effort-<tier>` subagent whenever the pair differs from the session. Triggers when a task will change files or needs a plan, and when a model or effort comes up. Bundled under `skills/routing-model-and-effort/`.
- **routing-code-review** — routes the `/code-review` level off the diff: `high` by default, `medium`/`low` when the diff is small, single-module, tested and risk-free, a question for `max`, and `ultra` only recommended (the user launches and pays for it); `--fix` for our own diff, `--comment`/`--post` on the user's word. Triggers when a review is about to be launched. Bundled under `skills/routing-code-review/`.
- **finishing-with-code-review** — a task that changed code ends with the routed review, the findings applied, the tests re-run and the fixes committed, then the recap; a docs-only diff is the one skip. Triggers before a recap, before a PR, and on "ship it". Bundled under `skills/finishing-with-code-review/`.

## Agents

- **effort-low / effort-medium / effort-high / effort-xhigh / effort-max** — one agent per reasoning effort level, `model: opus` by default; the caller passes `model` at call time. Used by the routing-model-and-effort skill because effort is only settable through an agent definition. Bundled under `agents/`.

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
│   ├── readable-code-structure/  # small named functions, plain control flow, braces, one pass
│   ├── comment-hygiene/    # comment the why, delete the what
│   ├── testing-behavior/   # test the contract, not the implementation
│   ├── vertical-horizontal-review/  # two-pass review: depth + sibling sweep
│   ├── pr-template/         # one shared PR title + description + reviewers
│   ├── woodpecker-cli/      # Woodpecker CI CLI: auth, commands, lint/exec
│   └── authorship-conventions/  # branch/commit/PR/doc naming, attribution, gh account
│   ├── routing-model-and-effort/  # (model, effort) pair per task phase
│   ├── routing-code-review/  # /code-review level, target and flags per diff
│   ├── finishing-with-code-review/  # every code task ends with the review
├── agents/
│   ├── DocsExplorer.md     # look up official docs before using a third-party API
│   └── effort-{low,medium,high,xhigh,max}.md  # one agent per effort level
├── shared/
│   ├── implement-flow.md   # shared procedures used by /implement and /fix-qa
│   ├── project-profile.md  # per-repo host, base, tracker, reviewers
│   ├── standing-rules.md   # always-on rules, printed by the SessionStart hook
│   └── pr-template.md      # single source of truth for PR title + description
├── data/
│   ├── bb-members.json     # Bitbucket workspace member list (reviewer candidates)
│   ├── teams-users.json    # Teams users → email (mention ids for /request-review)
│   └── pr-review-card.json # Adaptive Card template for /request-review
├── scripts/
│   ├── teams-post.sh       # POST a card to a Teams channel webhook
│   └── chrome-debug.sh     # fallback: debuggable Chrome LaunchAgent + its MCP
├── hooks/
│   ├── hooks.json
│   ├── format-file.sh      # PostToolUse: prettier on the edited file
│   ├── shell.mjs           # is this command really *running* X?
│   ├── standing-rules.mjs  # SessionStart: print the always-on rules
│   ├── render-rules.mjs    # what the session actually reads
│   ├── ai-breadcrumbs.mjs  # shared AI-signature patterns
│   ├── check-commit.mjs    # PreToolUse: block git commit / gh pr with a signature
│   ├── pr-template.mjs     # the PR rule: command matcher, ticket keys, sections
│   ├── check-pr.mjs        # PreToolUse: block a PR that breaks the shared template
│   └── check-doc.mjs       # PostToolUse: flag a written md/txt with a signature
├── tests/
│   ├── pr-template.test.mjs  # node --test 'tests/**/*.test.mjs'
│   ├── render-rules.test.mjs
│   └── shell.test.mjs
├── .mcp.json               # MCP server template (installed via /setup-plugin)
├── LICENSE
└── README.md
```

## License

MIT — see [LICENSE](./LICENSE).
