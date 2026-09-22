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
scraping the web UI.

## Before anything: check what is installed

The binary is `woodpecker` on older installs, `woodpecker-cli` on v2+; use
whichever resolves. Commands moved between v1 → v2 → v3, so **run `--help`
rather than guessing a flag** — a wrong one silently targets the wrong repo.
Auth is `WOODPECKER_SERVER` plus `WOODPECKER_TOKEN`, already exported in a bond
setup; `woodpecker-cli info` verifies it in one round-trip.

Details: references/install-and-auth.md — read when the binary is missing or a call returns 401.

## Command map

Repos are addressed by `owner/name` or by numeric **repo-id** from `repo ls`;
secrets, crons and registries take a scope flag.

Details: references/command-map.md — read for the repo, pipeline, secret, cron and registry calls.

## Debugging a failed pipeline

Do this in order — it costs one API call per step and avoids dumping megabytes
of logs into context:

1. `pipeline last <repo>` (or `pipeline ls`) → find the failing pipeline number.
2. `pipeline info <repo> <number>` → identify **which step** failed. Do not skip
   to logs; a pipeline with 20 steps produces logs you cannot read whole.
3. `pipeline logs <repo> <number> <step>` → read only that step.
4. Fix, push, and re-check — or `pipeline start <repo> <number>` to restart the
   same pipeline when the failure was infrastructure, not code.

## Scripting and the config file

Prefer `--output json` over parsing the table, and `lint` a `.woodpecker.yaml`
change locally before pushing it.

Details: references/config-and-scripting.md — read before scripting a call or linting a config.

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
