---
description: Diagnose a red pipeline (Woodpecker, GitHub Actions, Bitbucket) or a PR's failing CI, fix what the branch broke, push, and wait for the re-run — or every one of your open PRs with --mine
---

# /bond:fix-ci

Takes a failed pipeline from red to green on the branch that owns it. Each
failure is sorted first: what the base also fails is reported, a flaky step is
rerun once, an infrastructure failure goes to the user, and only a failure the
branch's own code caused is fixed here.

It reuses `${CLAUDE_PLUGIN_ROOT}/shared/project-profile.md` (profile, PR
coordinates, PR details and CI status) and `${CLAUDE_PLUGIN_ROOT}/shared/implement-flow.md`
(Set up the branch, Analyse the codebase, Test, Review and fix, Teardown). It
never merges, never approves, and never moves a ticket.

**Standing instructions win.** "Don't push", "only investigate" and the like,
given earlier in the session, override the matching step for the rest of the run.

## Usage

```
/bond:fix-ci <target>… [--rebase] [--base <branch>] [--rounds N] [--no-wait]
/bond:fix-ci --mine [--base <branch>]
```

## Arguments

`$ARGUMENTS` — one or more targets, each:

- a Woodpecker pipeline URL — `https://<server>/repos/<repo-id>/pipeline/<n>[/<step>]`;
- a GitHub Actions run or job URL — `github.com/<o>/<r>/actions/runs/<id>[/job/<id>]`;
- a Bitbucket pipeline URL — `bitbucket.org/<ws>/<r>/pipelines/results/<n>[/steps/<uuid>]`;
- a PR number or URL (either host);
- nothing — the PR of the current branch.

Free text next to a target ("investigate create PR fix", "check and fix") only
confirms the intent; "rebase on fresh main" means `--rebase --base main`.

### Flags

| Flag | Effect |
| --- | --- |
| `--mine` | Every open PR of yours in this repo whose CI is **failed**. |
| `--rebase` | Rebase the branch onto a freshly fetched base before fixing. |
| `--base <branch>` | The base to rebase on and compare against. Under `--mine`, also limits to PRs targeting it. Default: the PR's base, else the profile's `BASE_BRANCH`. |
| `--rounds N` | Fix → push → re-run rounds per pipeline (default `2`). |
| `--no-wait` | Push the fix and stop; do not wait for the re-run. |

## The ledger

`~/.claude/bond/fix-ci-<OWNER>-<REPO_SLUG>-<branch-slug>.json` — outside the
repo, so a second run on the same branch knows what was already tried:

```json
{ "rounds": 1, "reruns": ["<step>: <cause>"], "failedCauses": { "<step>: <cause>": 1 } }
```

A cause — in `failedCauses` and in `reruns` alike — is keyed by step plus its
first-line cause, never by pipeline id: a Woodpecker restart is a new pipeline
failing the old way, and an id-keyed rerun would repeat forever.

## Steps

### 0. Resolve the targets

1. Resolve the project profile.
2. `--mine` — GitHub: `gh pr list --author @me --state open --json
   number,headRefName,baseRefName,statusCheckRollup`, keeping PRs with a
   failing check. Bitbucket: `get_pull_requests` (state `OPEN`), keeping those
   authored by the current user, then **PR details and CI status** on each to
   keep the **failed** ones. Nothing ⇒ say so and stop.
3. A URL for another repo ⇒ find its checkout under `~/Documents/projects/`
   and work there, or stop and say which repo is missing. A Woodpecker repo id
   maps to its repo through `woodpecker-cli` (`repo ls`) — load the
   `bond:woodpecker-cli` skill for any Woodpecker call.
4. Before any write, apply `bond:authorship-conventions`: the active `gh`
   account must be the one for this repo, and `git ls-remote origin` must succeed.

Several targets ⇒ steps 1–5 run per target, one after another; they never share
a checkout.

### 1. Diagnose

- **PR target** — `bond:pr-status` first: `MERGED` / `CLOSED` ⇒ skip it; CI
  **running** ⇒ say so and skip; **passed** ⇒ nothing to fix. It gives the
  head, base, mergeability and each failed check's link.
- Then `bond:ci-diagnose` once per failed pipeline — the raw URL, or each failed
  check link from pr-status — with the base from `--base` or the PR, and the
  checkout as working directory. It returns the branch, the PR (or none), and
  per failed step a class, a `file:line` cause, and a short excerpt. Read a
  full step log yourself only when that cause is not enough to fix it.

`superseded … passed` ⇒ report it; nothing to do.

### 2. Sort each failed step

- **pre-existing-on-base** ⇒ report it with the base pipeline. Not fixed here:
  it is not this branch's, and fixing it here hides it from the base.
- **flaky** ⇒ rerun once, unless its `<step>: <cause>` is in `reruns`:
  `gh run rerun <id> --failed`; Woodpecker `pipeline start <repo-id> <n>`;
  Bitbucket has no rerun tool here — list it under *Needs you*. Record the key,
  then go to step 5. A deploy pipeline (`deployment` event, or a step that
  deploys an environment) is never restarted without the user's yes — it re-runs
  the deploy.
- **infra** ⇒ *Needs you*, with the cause and the excerpt. Never rotate,
  write or echo a secret; a 401 from a registry is a token the user owns.
- **code** ⇒ step 3.

The same `<step>: <cause>` already at `1` in `failedCauses` ⇒ the last fix did
not hold: stop on this pipeline and report both attempts.

### 3. Set up the branch

Where the fix lands depends on what the pipeline ran on:

| Pipeline ran on | Fix on |
| --- | --- |
| an open PR's head | that branch — `BRANCH_SOURCE=existing` |
| a feature branch with no PR | that branch — `BRANCH_SOURCE=existing` |
| the base, `main`/`master`/`dev`, a `release/*` or `hotfix/*` branch, with no PR | a new `fix/<description>` cut from it — `BRANCH_SOURCE=new`, `BASE_BRANCH` = that branch |

Run **Set up the branch** with `WORKTREE_SUFFIX=-ci`. The head already checked
out — here or in a kept worktree — is worked in place; never share a checkout
another session is using. Local head ahead of or diverged from the remote ⇒
stop: unpushed work is the user's.

`--rebase` (existing branch only): `git fetch origin <base>`, `git rebase
origin/<base>`. Conflicts are resolved by the rules of **Resolve merge
conflicts** in `${CLAUDE_PLUGIN_ROOT}/shared/merge-conflicts.md` — by file kind,
never `--ours`/`--theirs` wholesale on code; a conflict it would hand back ⇒
`git rebase --abort`, *Needs you*, stop. A cause the fresh base already fixed
is gone after the rebase — re-run its failing command before fixing it.

### 4. Fix

1. **Analyse the codebase** with `FOCUS` = the `code` causes. A failing test
   whose expectation is right is a code bug; a test the branch changed
   behaviour under on purpose is updated to the new contract, per
   `bond:testing-behavior`.
2. Fix the root cause, not the symptom — no skipped tests, no raised timeouts,
   no `|| true`, no disabled lint rule, no `continue-on-error`. A CI config
   change (`.woodpecker/*.yaml`, `.github/workflows/*`, `bitbucket-pipelines.yml`)
   is linted locally first (`woodpecker-cli lint`).
3. Reproduce the failing step locally — the exact command the step ran, through
   `bond:test-runner` — then **Test** and **Review and fix** with `SCOPE` = the fix.
   A step that cannot run locally (needs secrets or a deploy target) ⇒ say so in
   the report; the re-run is the proof.
4. Commit per `bond:authorship-conventions` — `fix(<scope>): …` or `ci: …`, one
   commit per cause, never `[skip ci]`. Push: `git push`
   (`git push -u origin <branch>` for a new `fix/` branch, which has no upstream
   yet), or `git push --force-with-lease=<branch>:<sha of origin/<branch> before
   the rebase>` after `--rebase` — never `--force`. Push
   failed ⇒ stop with the worktree intact.
5. New `fix/` branch ⇒ `/bond:open-pr <BASE_BRANCH>`; its PR is what the
   re-run belongs to.
6. Increment each fixed cause in `failedCauses` and `rounds`.

### 5. Wait for the re-run

Skip under `--no-wait`. Wait in the background — a `run_in_background` loop or
the Monitor tool, never a foreground poll:

- **GitHub PR** (Woodpecker statuses included — they land in the rollup):
  ```sh
  bash "${CLAUDE_PLUGIN_ROOT}/scripts/ship-pr-poll.sh" \
    <n> <OWNER>/<REPO_SLUG> "$LEDGER" 0 1
  ```
  It prints one `settled checks=… failed=…` line.
- **Woodpecker, no GitHub PR** — every 15s, `woodpecker-cli pipeline ls
  <repo-id> --output json` until the pipeline for the pushed commit (or the
  restarted one) is no longer `pending`/`running`.
- **Bitbucket** — **PR details and CI status** every 30s until the pipeline
  for the head commit settles.

Then: passed ⇒ done. Failed ⇒ back to step 1 with the new pipeline, until
`--rounds` is spent. A flaky step that fails again on its rerun is reclassified
`code` and fixed.

### 6. Teardown and report

Run **Teardown** for a worktree this run created, only once
`git ls-remote origin <branch>` equals local `HEAD`.

Report one block per pipeline:

```
woodpecker repo 1 #181 dev — PR #57 (fix/ci-pricing-type) — passed on #183
  ✓ test-api [code] pricing.service.ts:42 — fixed in a1b2c3d
  ↻ e2e [flaky] passed on rerun
  ✗ deploy-web-dev [infra] — needs you
```

Then **Needs you**: infra causes with their excerpts, pre-existing-on-base
failures with the base pipeline, Bitbucket reruns to start by hand, deploy
restarts awaiting a yes, and every stop reason.

## Do NOT

- Do not fix a pre-existing, flaky or infrastructure failure as if the branch
  caused it, and do not widen a CI fix into unrelated work.
- Do not push to `main`/`master`/`dev`/`release/*`/`hotfix/*` directly — a fix
  for one of those goes through a `fix/` branch and a PR.
- Do not rerun more than once per pipeline, or restart a deploy without a yes.
- Do not skip, delete or loosen a test, a lint rule or a CI step to go green.
- Do not `--force`, `[skip ci]`, merge, approve, or post CI-status comments.
- Do not print, commit or paste a token or secret value — not even one the
  user pasted into the prompt.
- Do not poll in the foreground or echo whole CI logs.
- The shared flow's own **Do NOT** list applies.
