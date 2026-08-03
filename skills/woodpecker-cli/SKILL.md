---
name: woodpecker-cli
description: >-
  Use when interacting with a Woodpecker CI server from the terminal — listing
  or inspecting pipelines, reading step logs, restarting/stopping/approving a
  pipeline, managing secrets/crons/registries, or validating and locally running
  a `.woodpecker.yaml` config. Covers `woodpecker-cli` auth (WOODPECKER_SERVER /
  WOODPECKER_TOKEN, `login`, `~/.config/woodpecker/config.json`), the command
  map, JSON output for scripting, and `lint` / `exec`. Trigger on "woodpecker",
  "woodpecker-cli", "why did the pipeline fail", "pipeline logs", ".woodpecker.yaml",
  "run the pipeline locally".
---

# Woodpecker CI CLI

`woodpecker-cli` talks to a Woodpecker CI server's API. Use it instead of
scraping the web UI: it gives machine-readable pipeline state, step logs, and
local config validation.

## Before anything: check what is installed

Woodpecker renamed and reshuffled commands between v1 → v2 → v3. Flags in this
skill are the stable core; **when a flag or subcommand is uncertain, run
`--help` rather than guessing** — a wrong flag silently targets the wrong repo
on some subcommands.

```sh
command -v woodpecker-cli || command -v woodpecker
woodpecker-cli --version
```

Older installs expose the binary as `woodpecker`; v2+ ships it as
`woodpecker-cli`. Use whichever resolves.

If it is missing, install it:

```sh
brew install woodpecker-cli                                     # macOS
go install go.woodpecker-ci.org/woodpecker/v3/cmd/cli@latest    # any platform
```

## Auth

Two credentials, both required:

| Variable | Value |
| --- | --- |
| `WOODPECKER_SERVER` | Server base URL, e.g. `https://ci.example.com` — no trailing slash, no `/api` suffix |
| `WOODPECKER_TOKEN` | Personal access token from the server UI, under user settings / "CLI usage" |

Resolution order, highest first:

1. Explicit flags — `--server` / `-s`, `--token` / `-t`.
2. Environment — `WOODPECKER_SERVER`, `WOODPECKER_TOKEN`.
3. Config file — `~/.config/woodpecker/config.json`, written by
   `woodpecker-cli login`.

In a bond setup the two variables live in `~/.claude/settings.json` under `env`
(written by `/bond:setup-plugin`), so they are already exported for Bash tool
calls. `woodpecker-cli login` is the interactive alternative — it opens a
browser and persists the token to the config file, which survives outside
Claude Code sessions.

Verify auth with one call — it is the cheapest round-trip:

```sh
woodpecker-cli info
```

Failure to authenticate shows as `401`/`Unauthorized`, not as an empty list.
Treat an empty `repo ls` as "token has no repo access", not as "no repos exist".

## Command map

Repos are addressed by `owner/name` or by numeric **repo-id**. v3 tightened this:
several subcommands take the id only. Get ids once with `repo ls`.

```sh
woodpecker-cli repo ls                        # id, full name, activity state
woodpecker-cli repo info <repo>               # config path, visibility, settings
```

Pipelines:

```sh
woodpecker-cli pipeline ls <repo>             # recent pipelines, newest first
woodpecker-cli pipeline last <repo>           # latest pipeline on the default branch
woodpecker-cli pipeline info <repo> <number>  # status, event, commit, per-step state
woodpecker-cli pipeline logs <repo> <number>  # all step logs
woodpecker-cli pipeline logs <repo> <number> <step>
woodpecker-cli pipeline start <repo> <number> # restart an existing pipeline
woodpecker-cli pipeline stop <repo> <number>
woodpecker-cli pipeline approve <repo> <number>
woodpecker-cli pipeline decline <repo> <number>
woodpecker-cli pipeline create <repo> -b <branch>
woodpecker-cli pipeline ps <repo>             # running steps
woodpecker-cli pipeline queue                 # server-wide queue (admin)
```

Config-scoped resources — each takes a scope flag (`--repository`,
`--organization`, or `--global`); **omitting the scope is the usual cause of
"secret not found"**:

```sh
woodpecker-cli secret ls --repository <repo>
woodpecker-cli secret add --repository <repo> --name <key> --value <val>
woodpecker-cli cron ls --repository <repo>
woodpecker-cli registry ls --repository <repo>
```

## Debugging a failed pipeline

Do this in order — it costs one API call per step and avoids dumping megabytes
of logs into context:

1. `pipeline last <repo>` (or `pipeline ls`) → find the failing pipeline number.
2. `pipeline info <repo> <number>` → identify **which step** failed. Do not skip
   to logs; a pipeline with 20 steps produces logs you cannot read whole.
3. `pipeline logs <repo> <number> <step>` → read only that step.
4. Fix, push, and re-check — or `pipeline start <repo> <number>` to restart the
   same pipeline when the failure was infrastructure, not code.

## Scripting

Most list/info commands accept output formatting. Prefer JSON over parsing the
table:

```sh
woodpecker-cli pipeline ls <repo> --output json
woodpecker-cli repo ls --output json | jq -r '.[] | "\(.id)\t\(.full_name)"'
```

`--output-no-headers` strips the header row from table output when JSON is not
supported by that subcommand.

## Working on the config file itself

The pipeline definition lives at `.woodpecker.yaml` or, split into workflows,
under `.woodpecker/*.yaml`.

```sh
woodpecker-cli lint                    # validate config in the current repo
woodpecker-cli lint .woodpecker/       # validate a specific path
woodpecker-cli exec .woodpecker/build.yaml
```

`lint` catches schema errors and deprecated fields **without a server round-trip**
— run it before pushing a config change rather than burning a CI run on a typo.

`exec` runs a workflow locally against the Docker backend. It does **not** get
the server's secrets, and its environment is not identical to the real agent —
use it to iterate on step logic, not to certify that CI will pass.

## Rules

- **Never paste `WOODPECKER_TOKEN` into a command you print, a commit, or a PR
  description.** Reference the env var; let the CLI read it.
- `pipeline start` **restarts** an existing pipeline; `pipeline create` triggers
  a **new** one. Restarting a deploy pipeline re-runs the deploy — confirm with
  the user before restarting anything that touches an environment.
- A pipeline that is "pending approval" is blocked on a human, not broken.
  Check `pipeline info` before assuming a hang.
- Read logs step-scoped. Dumping a whole pipeline's logs is the single most
  common way this CLI wastes a context window.
