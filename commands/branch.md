---
description: Start a new branch — checked out in place or in its own ready worktree — cut from the right base for trunk or git-flow
---

# /bond:branch

**Ask first.** Before the first write, one `AskUserQuestion` with every decision `$ARGUMENTS` leaves open — none when they settle it all (standing rule *Commands ask first*).

Start a branch and nothing else: name it, pick its base from the repo's branch
model, then check it out here or open it in a worktree that is ready to run
(env files, dependencies). No ticket is created, no plan written, no code
touched. `/bond:start` is the same with a Jira issue created first;
`/bond:worktree open` reopens a branch that already exists.

Reads `${CLAUDE_PLUGIN_ROOT}/shared/project-profile.md` (`BASE_BRANCH`,
`BRANCH_MODEL`, `TRACKER`), and runs the **Set up the branch** procedure of
`${CLAUDE_PLUGIN_ROOT}/shared/implement-flow.md` and the **Prepare the
worktree** step of `${CLAUDE_PLUGIN_ROOT}/commands/worktree.md`. Read them.

## Arguments

`$ARGUMENTS` — what the branch is for, plus optional flags. One of:

- free text — `add csv export to reports` → `feat/add-csv-export-to-reports`;
- a full branch name — `fix/header-overflow` — whose prefix is its type;
- a Jira key under `TRACKER=jira` — `PROJ-135` → `feat/PROJ-135`.

Examples:
- `/bond:branch add csv export to reports`
- `/bond:branch header overflows on mobile --fix --worktree`
- `/bond:branch --release 1.4.0` — `release/v1.4.0` off develop under git-flow
- `/bond:branch payment webhook 500s --hotfix` — off the production branch under git-flow
- `/bond:branch PROJ-135 --checkout`
- `/bond:branch chore/bump-eslint --base develop`

### Flags

- **Type** — `--feat` (default), `--fix`, `--hotfix`, `--chore`, `--docs`,
  `--release <version>`. A full branch name in `$ARGUMENTS` sets the type
  itself; a flag that disagrees with it is a conflict for the upfront question.
- **Where** — `--checkout` (switch this tree) or `--worktree` (a new worktree
  under `../worktrees/`). Neither ⇒ part of the upfront question:
  recommend `--worktree` when this tree has uncommitted changes or is
  already on a branch with unpushed commits, `--checkout` otherwise.
- `--base <branch>` — cut from `origin/<branch>`, overriding the model.
- `--gitflow` / `--trunk` — use that branch model for this branch, overriding
  `BRANCH_MODEL`.

Strip the flags before reading the rest.

## Steps

### 1. Resolve the profile and the model

Resolve the project profile. `BRANCH_MODEL` comes from `--gitflow` /
`--trunk`, else the profile. When the profile leaves it unset and `origin` has
a `develop` branch, the model is an open decision: put it in the upfront
question — **git-flow** recommended — and offer to record the answer as
`branchModel` in `.bond/project.json` so the next command does not ask.

### 2. Name the branch

Type from the flag or the given name, else `feat`. Then, per
`bond:authorship-conventions`:

- **Free text** — `<type>/<three to five lowercase hyphenated words>`.
- **Full name** — kept as given once it passes the skill's rules; a name that
  breaks them (uppercase, underscore, two slashes) is corrected and the
  correction shown in the report.
- **`--release <version>`** — `release/v<version>`, a leading `v` not doubled.
- **Jira key** (`TRACKER=jira`) — `<type>/<KEY>`, stop at the key, per the
  skill's Jira branches section. Run the shared **Resolve Jira ticket(s)**,
  **Claim unassigned ticket(s)** and **Transition to In Progress** procedures
  on it first: starting a branch for an issue starts the issue. Without
  `--fix`/`--hotfix`, a `Bug` takes `fix`. A key under `TRACKER=none` is
  free text.

Text and no type that fits (an empty summary, a name with an unknown prefix)
⇒ ask in the upfront question; never invent the description.

### 3. Pick the base

`--base` wins. Otherwise by `BRANCH_MODEL`:

| Type | `gitflow` | `trunk` |
|---|---|---|
| `feat`, `fix`, `chore`, `docs` | `DEVELOP_BRANCH` | `BASE_BRANCH` |
| `release` | `DEVELOP_BRANCH` | `BASE_BRANCH` |
| `hotfix` | `PRODUCTION_BRANCH` | `BASE_BRANCH` |

The base must exist on `origin` after `git fetch origin` — a missing one
stops the run, naming it. A PR from this branch later targets the same base.

### 4. Set it up

Run **Set up the branch** with `BRANCH_NAME` from step 2, `BRANCH_SOURCE=new`,
`BASE_BRANCH` from step 3 and `WORKTREE_SUFFIX=` (empty) — worktree mode for
`--worktree`, in-place mode for `--checkout`. The procedure renames a taken
name to `-2`, `-3`… and refuses a dirty tree in place; neither is asked
about again.

Worktree mode then runs **Prepare the worktree** from `commands/worktree.md`
— env files copied, dependencies installed — so the first test run fails only
on the code.

### 5. Report

Branch name (and any rename or correction), the base and its short SHA, the
model used, and the worktree path in worktree mode — with
`cd <path>` to enter it. Under git-flow, a `release` or `hotfix` branch adds
one line: after it merges into `PRODUCTION_BRANCH`, merge it back into
`DEVELOP_BRANCH` and tag the release. Then stop.

## Do NOT

- Do not create a Jira issue — that is `/bond:start`.
- Do not commit, push or open a PR: the branch stays local until there is
  work on it.
- Do not run the `git flow` CLI. The model is plain git plus the profile, so
  it works on any machine and keeps the Conventional Branch prefixes
  (`feat/`, `fix/`) rather than git-flow's own (`feature/`, `bugfix/`).
- Do not stash, reset or switch a dirty tree to make `--checkout` work.
