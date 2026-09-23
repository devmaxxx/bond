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
| `/implement`      | Fetch (or create) a Jira ticket — or take a free-text task where there is no tracker — then branch, plan, and code |
| `/investigate`    | Investigate a deployed failure to a proven root cause and write the investigation doc         |
| `/jira`           | Create, edit, assign, comment on, or transition a Jira issue (assigned to you by default)     |
| `/open-pr`        | Open a PR for the current branch (GitHub or Bitbucket; draft in Bonliva repos)                |
| `/finish-pr`      | After implement/fix-qa: browser-test the PR, tick its test plan, mark ready, loop review → fix → CI |
| `/start`          | Check out a fresh typed branch — creating the Jira issue first where there is a tracker        |

## bond-bonliva (Bonliva-only companion)

`plugins/bond-bonliva/` is a second plugin in the same marketplace. It depends on
`bond` and carries everything that only makes sense inside Bonliva: the MCP
server template and its setup, time logging, Teams and Bitbucket reviewer
defaults. Enable it per Bonliva repo, not globally, so personal repos never load
its commands or MCP tool listings:

```json
// <bonliva repo>/.claude/settings.local.json
{ "enabledPlugins": { "bond-bonliva@devmaxxx": true } }
```

| Command                          | Purpose                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `/bond-bonliva:babysit-prs`      | Sweep every open PR you authored — review comments, red CI, stale branches   |
| `/bond-bonliva:fix-qa`           | Re-run implementation against QA feedback — from a Jira ticket, or free text  |
| `/bond-bonliva:log-plan`         | Generate a day/week/month time-log plan                                       |
| `/bond-bonliva:projects`         | Manage the projects tracked by `log-plan` (add, remove, discover, clear)      |
| `/bond-bonliva:publish-timelog`  | Publish a time-log md to Jira + Clockify (one entry/day) and reconcile totals  |
| `/bond-bonliva:request-review`   | Post a Teams card inviting reviewers to review a PR                           |
| `/bond-bonliva:set-reviewers`    | Set or change the default reviewers added to PRs                              |
| `/bond-bonliva:setup-plugin`     | Install the Bonliva MCP servers (local scope, per project) and env vars       |
| `/bond-bonliva:teams-post`       | Post a message to a Teams channel via a Workflow webhook                      |

Shared docs it reads (`project-profile.md`, `implement-flow.md`, `jira.md`) are
symlinks into `bond`, which the plugin cache resolves into real copies.

## MCP Servers

`bond-bonliva` ships an MCP server template in `plugins/bond-bonliva/.mcp.json`. Run `/bond-bonliva:setup-plugin` to
install those servers into the **local scope** of each Bonliva project, so they load only there. To avoid colliding with any servers you already run, each is
installed under a `bond-` prefixed name and exposed as `mcp__bond-<name>__*`:

- **bond-atlassian** — official Atlassian remote MCP server (`https://mcp.atlassian.com/v1/sse`, OAuth, no env vars). Opens a browser on first use.
- **bond-bitbucket** — `bitbucket-mcp-py` (PRs, repositories, pipelines)
- **bond-clockify** — `mcp_clockify` (time entries, projects, tasks, workspaces)
- **bond-teams** — `@floriscornel/teams-mcp` (Microsoft Teams chats, channels, messages). No env vars; auth is a one-time CLI step (see below).
- **bond-outline** — `outline-mcp-server` (Outline docs, collections, search)

`/bond-bonliva:setup-plugin` prompts for any missing credentials and writes them via the
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
`OUTLINE_API_URL` has no default — `/bond-bonliva:setup-plugin` prompts for it. Use
`https://docs.bonliva.dev/api` for the Bonliva instance, or
`https://app.getoutline.com/api` for Outline cloud.

`bond-teams` has no env vars. After `/bond-bonliva:setup-plugin`, authenticate it once with a
Microsoft Graph OAuth flow:

```bash
npx -y @floriscornel/teams-mcp@latest authenticate
```

## Teams channel webhook

`bond-teams` needs a Microsoft Graph token, which a tenant Conditional Access
policy can block (e.g. device-compliance requirements). For **one-way posting to
a Teams channel**, the `/bond-bonliva:teams-post` command sidesteps Graph entirely: it POSTs
to a Power Automate Workflow webhook, whose URL is a bearer secret with no OAuth.

This posts to a **channel only** — not to 1:1 or group chats.

Create the webhook once, in the Teams client:

1. Open the target **channel** → **⋯** → **Workflows**.
2. Choose the template **"Post to a channel when a webhook request is
   received."**
3. Finish the wizard and copy the generated **HTTP POST URL**.

Then make the URL available as `BOND_TEAMS_WEBHOOK_URL` (treat it as a secret).
Either let `/bond-bonliva:setup-plugin` prompt for it and store it in `~/.claude/settings.json`
(`env` block), or export it yourself:

```bash
export BOND_TEAMS_WEBHOOK_URL="https://…"
```

Now `/bond-bonliva:teams-post <message>` delivers a card to that channel. The underlying
`plugins/bond-bonliva/scripts/teams-post.sh` is also usable standalone (CI, hooks):

```bash
BOND_TEAMS_WEBHOOK_URL="https://…" plugins/bond-bonliva/scripts/teams-post.sh --title "Deploy" "Build #42 passed"
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

`shared/permissions-readonly.json` is a read-only allowlist — the git reads
(`status`, `log`, `diff`, `show`, `branch`, `rev-parse`), `ls`, `wc`, `jq`,
`head`, `tail`, `pnpm exec repograph`, `pnpm tasks report`, `pnpm tasks blockers`
and `node --test`: the calls that look at a tree without changing it. A plugin
cannot apply permissions, so bond cannot switch them on for you — copy the
`permissions.allow` entries into a project's `.claude/settings.json` (or the
uncommitted `.claude/settings.local.json`). Until then every one of those calls
is approved by hand, one at a time.

## Project profile

Commands are not Bonliva-only. `shared/project-profile.md` resolves, per repo,
the PR host, the base branch, whether there is a Jira tracker at all, and who
the reviewers are. A repo can state its own answers in `.bond/project.json`;
otherwise they are inferred from the `origin` remote. Outside Bonliva the
tracker resolves to `none`, and `/implement` takes a free-text task, cuts a
`<type>/<description>` branch and opens a PR with no `## Jira` section.

Every command reads that profile rather than assuming a host or a tracker:

- **Host-flexible** — `/open-pr` and `/fix-pr` work against Bitbucket
  Pipelines and GitHub Actions alike; the profile's *Resolve PR coordinates* and
  *PR details and CI status* procedures normalise both to one vocabulary, so no
  command branches on a host-specific status string.
- **Tracker-flexible** — `/implement` and `/start` take free text where there is no
  Jira; `/bond-bonliva:fix-qa` does the same on the branch already checked out.
- **Guarded, not faked** — `/jira`, `/request-review`, `/publish-timelog` and
  `/log-plan` genuinely need Jira, a Teams channel or Clockify. They say which
  prerequisite is missing and stop, rather than pretending to work.

`/projects` discovery is no longer hardwired to `bonliva-*`: set
`BOND_PROJECT_GLOB`, or `projectGlob` in `~/.bond/projects.json`.

## Hooks

- `SessionStart` runs `hooks/standing-rules.mjs`: the standing rules above. Registered with no matcher, so it fires on every start reason — startup, resume, clear, compact and fork alike. That is deliberate: rules that do not survive a compaction quietly stop applying halfway through a long session, and a matcher that failed to parse would drop them silently.
- `SessionStart` and `UserPromptSubmit` run `hooks/branch-guard.mjs`: the branch the session opened on is recorded under `<tmp>/bond/<session_id>.branch`, and the first prompt submitted after the working tree has moved to another branch gets one line of context naming both branches and suggesting `/clear`. Once per recorded baseline — a session that carries two branches pays the first one on every turn of the second, but a reminder repeated every turn costs the tokens it is trying to save, so it is said once and re-armed by the next `SessionStart` (resume and compact reuse the session id, and the drift after one of those deserves a second word). A detached HEAD, a directory that is no git tree or an unwritable tmp means no nudge, never a blocked prompt. The rule is `decide` in that file, unit-tested in `tests/branch-guard.test.mjs`.
- `SessionStart` runs `hooks/node-guard.mjs`: a tree that pins node in `.nvmrc` (or `.node-version`) gets one line of context when the shell its Bash calls land in runs another version — both versions and the `PATH="$(nvm which <pin> | xargs dirname):$PATH"` prefix every `pnpm`/`node` command then needs. Each Bash call is a fresh shell that does not carry nvm's PATH, so the prefix is per command rather than per session; met mid-session instead of at the start, the same fact costs a failed command per call (`ERR_UNKNOWN_FILE_EXTENSION` on every TypeScript entry point). A shorter pin covers the releases under it — `24` is satisfied by `24.16.0`, `24.1` is not — while an alias only nvm could resolve (`lts/*`) and a tree with neither file say nothing. nvm is never invoked: the line names the prefix, it does not run it. The rule is `check` in that file, unit-tested in `tests/node-guard.test.mjs`.
- `PostToolUse` runs prettier on any file edited via `Edit`, `Write`, or `MultiEdit` (no-op when prettier is not available in the project), then `hooks/check-doc.mjs` scans a just-written `*.md|mdx|txt` for AI signatures and reports the lines back.
- `PreToolUse` on `Bash` runs `hooks/check-commit.mjs`: a `git commit` / `gh pr …` whose message carries an AI signature (`Co-Authored-By` naming a tool, `Claude-Session:`, "generated with") or a non-Conventional-Commits subject is blocked with the reasons. Patterns live in `hooks/ai-breadcrumbs.mjs`; see the `authorship-conventions` skill.
- `PreToolUse` on `Bash` and the Bitbucket `create_pull_request` / `create_draft_pull_request` MCP calls runs `hooks/check-pr.mjs`: a PR whose title or body misses the shared Summary / Test plan shape, is not opened as a draft where one is required (`"draft"` in `.bond/project.json`, else a Bonliva repo: origin under `bonliva/`, a Bitbucket `workspace: bonliva`, or `.bonliva-dev/project.json`), or carries an AI signature is blocked with the reasons. See the `pr-template` skill and `shared/pr-template.md`. The rule lives in `hooks/pr-template.mjs`: it recognises the PR command only where the shell would run one — not inside a heredoc body, a quoted string or a comment — and treats only the configured Jira project keys as ticket ids, so `UTF-8` and `SHA-256` are prose.
- `PreToolUse` on `Bash` runs `hooks/bash-budget.mjs`: context only, never a decision — the command always runs. Ten calls in a row that each carry a single command get one line naming the three cheaper forms — chain the next ones with `&&` or `;`, issue them in one message, or hand the loop to a subagent; measured over thirty days in one repo, 6481 Bash calls averaging 1.6 KB of output, where the price is not that output but the whole conversation being re-read on every one of them. Four shapes whose output has no bound get one line naming the bounded form — `git log` without `-n`/`--oneline`, `cat` of one whole file, `ls -R` or `find` without `-maxdepth`, a test run without `--reporter`. At most one line per call and the batch nudge wins; the row is counted in `<tmp>/bond/<session_id>.bash-singles`, whose own mtime says whether the previous call came from a turn of its own — a counter written under a second ago means both calls were dispatched in one message, which is already the batching asked for, so that call does not lengthen the row. An unwritable tmp costs the batch nudge, never the call. Separators are read where the shell would run them, so `"a && b"` and a heredoc body carrying `&&` are each one command. The rule is `judge` in that file, unit-tested in `tests/bash-budget.test.mjs`.
- `PreToolUse` on the subagent dispatch — `Agent`, or `Task` where the harness still names it that — runs `hooks/recon-router.mjs`: context only, never a decision — the agent is dispatched either way. A prompt handed to the unnamed or the general-purpose agent that asks where something lives, what or who calls it, which file holds it or how it is wired gets one line naming who answers it cheaply — `repo-scout` where the working tree has one under `.claude/agents/`, otherwise `Explore` with a breadth. The general-purpose agent pays that search in full and returns everything it read; the other two return the conclusion. A prompt that already names an agent has made the choice, and saying it again costs the tokens this is trying to save; so has a prompt that builds — one carrying `implement`, `add`, `write`, `refactor`, `fix`, `update`, `create`, `migrate` or `edit` as a word — since the agent that writes the code reads it on the way there. The rule is `route` in that file, unit-tested in `tests/recon-router.test.mjs`.

## Tests

The hook rules are unit-tested with the Node test runner — no dependencies, no
install step. Covered: the two matchers the commit and PR hooks decide on —
whether a command really runs `git commit` or `gh pr`, and whether a call really
opens a pull request — along with the AI-signature patterns they share with
`check-doc.mjs`; the ticket-key rule; the standing-rules rendering; and the four
context hooks through their decision functions, `decide` (branch-guard), `judge`
(bash-budget), `route` (recon-router) and `check` (node-guard), each with its
wrapper driven over stdin as well. `context-audit.py` is run against the
hand-sized transcript under `tests/fixtures/projects/`, every `SKILL.md` is held
to its size limit and to the `references/` files it links, and `check-commit.mjs`
is driven end to end over stdin:

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
- **context-cost** — what a screenshot, a whole-file read or an unbounded command costs once the session carries it, and the cheaper form that answers the same question. Measured: cache reads are 65 % of weighted cost, and the 15 largest sessions on one machine carried 42 % of its usage. Bundled under `skills/context-cost/`.
- **finishing-with-code-review** — a task that changed code ends with the routed review, the findings applied, the tests re-run and the fixes committed, then the recap; a docs-only diff is the one skip. Triggers before a recap, before a PR, and on "ship it". Bundled under `skills/finishing-with-code-review/`.

## Agents

- **effort-low / effort-medium / effort-high / effort-xhigh / effort-max** — one agent per reasoning effort level; the caller passes `model` at call time. `effort-high`, `effort-xhigh` and `effort-max` fall back to `model: opus` when the caller omits it; `effort-low` and `effort-medium` fall back to the session default subagent model, so a cheap tier is not silently run on the most expensive model. Used by the routing-model-and-effort skill because effort is only settable through an agent definition. Bundled under `agents/`.
- **TestRunner** — runs one test, typecheck or lint command on haiku at low effort and returns only the failures: the runner's own counts on line 1, then at most 40 `path:line: message` lines and `… N more`. A command that cannot start comes back as the first 5 lines of stderr. Hand it every check whose full output would otherwise land in the main context. Bundled under `agents/`.

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
├── skills/                 # each SKILL.md ≤ 3 KB; the detail sits in <skill>/references/
│   ├── readable-code-structure/  # small named functions, plain control flow, braces, one pass
│   ├── comment-hygiene/    # comment the why, delete the what
│   ├── testing-behavior/   # test the contract, not the implementation
│   ├── vertical-horizontal-review/  # two-pass review: depth + sibling sweep
│   ├── pr-template/         # one shared PR title + description + reviewers
│   ├── woodpecker-cli/      # Woodpecker CI CLI: auth, commands, lint/exec
│   ├── authorship-conventions/  # branch/commit/PR/doc naming, attribution, gh account
│   ├── routing-model-and-effort/  # (model, effort) pair per task phase
│   ├── routing-code-review/  # /code-review level, target and flags per diff
│   ├── context-cost/        # what a read/screenshot costs once the session carries it
│   │   └── scripts/context-audit.py  # per-session tool-result bytes, compactions, results over 40 KB
│   └── finishing-with-code-review/  # every code task ends with the review
├── agents/
│   ├── DocsExplorer.md     # look up official docs before using a third-party API
│   ├── TestRunner.md       # run one check, return only the failures
│   └── effort-{low,medium,high,xhigh,max}.md  # one agent per effort level
├── shared/
│   ├── implement-flow.md   # shared procedures used by /implement and /fix-qa
│   ├── project-profile.md  # per-repo host, base, tracker, reviewers
│   ├── standing-rules.md   # always-on rules, printed by the SessionStart hook
│   ├── pr-template.md      # single source of truth for PR title + description
│   └── permissions-readonly.json  # read-only allowlist to copy into a project
├── scripts/
│   ├── disk-analyze.sh     # disk usage report behind /disk-analyze
│   └── chrome-debug.sh     # fallback: debuggable Chrome LaunchAgent + its MCP
├── hooks/
│   ├── hooks.json
│   ├── format-file.sh      # PostToolUse: prettier on the edited file
│   ├── shell.mjs           # is this command really *running* X?
│   ├── standing-rules.mjs  # SessionStart: print the always-on rules
│   ├── render-rules.mjs    # what the session actually reads
│   ├── branch-guard.mjs    # SessionStart + UserPromptSubmit: the branch moved under this session
│   ├── bash-budget.mjs     # PreToolUse: a row of one-command calls, output with no bound
│   ├── recon-router.mjs    # PreToolUse: who answers a "where is X" prompt cheaply
│   ├── node-guard.mjs      # SessionStart: the shell node is not the version .nvmrc pins
│   ├── ai-breadcrumbs.mjs  # shared AI-signature patterns
│   ├── check-commit.mjs    # PreToolUse: block git commit / gh pr with a signature
│   ├── pr-template.mjs     # the PR rule: command matcher, ticket keys, sections
│   ├── check-pr.mjs        # PreToolUse: block a PR that breaks the shared template
│   └── check-doc.mjs       # PostToolUse: flag a written md/txt with a signature
├── tests/
│   ├── pr-template.test.mjs  # node --test 'tests/**/*.test.mjs'
│   ├── render-rules.test.mjs
│   ├── branch-guard.test.mjs
│   ├── bash-budget.test.mjs
│   ├── recon-router.test.mjs
│   ├── node-guard.test.mjs
│   ├── context-audit.test.mjs
│   ├── skill-size.test.mjs
│   ├── shell.test.mjs
│   └── fixtures/projects/    # a transcript sized by hand, read by context-audit.test.mjs
├── plugins/bond-bonliva/   # Bonliva-only companion plugin (enable per repo)
│   ├── .claude-plugin/plugin.json  # depends on bond
│   ├── commands/           # babysit-prs, fix-qa, log-plan, projects, publish-timelog, request-review, set-reviewers, setup-plugin, teams-post
│   ├── data/               # bb-members, teams-users, pr-review-card
│   ├── scripts/teams-post.sh
│   ├── shared/             # symlinks into bond: project-profile, implement-flow, jira
│   └── .mcp.json           # MCP server template (installed via /bond-bonliva:setup-plugin)
├── LICENSE
└── README.md
```

## License

MIT — see [LICENSE](./LICENSE).
