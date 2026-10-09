---
description: Deliver ready tasks from the crewboss queue end to end — claim, implement, verify, PR, review, CI, merge — with this session as the boss and every phase run by an agent
---

# /bond:crewboss

The crewboss loop with this session as the boss. It reads the same profile as
the crewboss CLI and works the same queue, but every phase is a bond agent, and a
question goes to the owner as a choice with drafted answers instead of a parked
NeedsHuman state.

The session holds the queue, the ledger and each verdict. It writes no code
itself and keeps no raw log: agents do the work and return short reports.

## Usage

```
/bond:crewboss [<task id>] [--max N] [--limit K] [--dry-run]
```

| Flag | Effect |
| --- | --- |
| `<task id>` | Deliver this task only, instead of the next one in the queue. |
| `--max N` | Tasks in flight at once, default `1`, capped at `3`. Each task has its own worktree. |
| `--limit K` | Stop after `K` tasks reach a terminal state. With no limit, run until the queue is empty. |
| `--dry-run` | Print the queue and the next task's brief. Nothing is claimed. |

## Inputs read once

- **Profile** — the one `*.json` in `${CREWBOSS_CONFIG_DIR:-~/.config/crewboss}/profiles/`.
  Zero or several ⇒ stop, as the CLI does. Read `repo` (`path`, `github`,
  `defaultBranch`), `ghUser`, `source.commands` (`next`, `list`, `claim`,
  `close`, `pr`, `release`; `{repoPath}`, `{id}`, `{planId}` are filled, shell-quoted),
  `source.closeBy`, `verify`, `protectedPaths`, `guard.deny.commands` and
  `strategies.merge`.
- **Ledger** — `~/.claude/bond/crewboss-<profile>.json`, written after every
  state change. A re-run resumes from it. Per task: `id`, `planId`, `title`,
  `branch`, `worktree`, `pr`, `phase`, `fixRounds`, `reviewRounds`, `note`.

## Steps

### 1. Preflight

1. Spawn the `crewboss` agent with ask `status`. Stop with its line if:
   - the CLI loop holds a task (`loop:` is not `idle`); or
   - the loop reports `BUSY`.

   Two bosses on one queue claim the same work.
2. Apply `bond:authorship-conventions`. The active `gh` account must be
   `ghUser`; switch to it before any push, and say so.
3. Resume: for each ledger task not in a terminal phase, check the remote
   (`git ls-remote --heads origin <branch>`, `gh pr view <branch>`) and continue
   it at the phase the remote supports.

### 2. Pick and claim

1. Queue: the profile's `list` command, or `next`, run in `repo.path` with
   `GH_TOKEN="$(gh auth token --user <ghUser>)"`. Use the last JSON value in the
   output. With a `<task id>`, take that task alone.
2. `--dry-run` ⇒ print the queue and stop.
3. Claim with the profile's `claim` command. Its JSON gives `branch` and
   `worktree`, and the claim makes the worktree. Record both in the ledger,
   phase `implement`.

A claim that fails ⇒ note it and take the next task. Never claim twice.

### 3. Implement

Route through `bond:routing-model-and-effort` (default opus/high) and spawn the
phase agent with the worktree as its working directory. The brief:

- the task's id, title and plan file (the claim's JSON names it; read it there, not from memory);
- **Verify** — run each `verify` command and leave it green;
- **Off limits** — `protectedPaths`: a change there needs the owner. Stop and
  return `blocked: <the question>` rather than touch one;
- **Never run** — `guard.deny.commands`, `git push`, anything that merges;
- `source.closeBy` is `agent` ⇒ run `close` as the last commit's step, as the
  CLI's agent would;
- commit on the branch with a Conventional subject;
- return `done` or `blocked: <question>`, then a one-line summary.

`blocked` ⇒ step 7.

### 4. Gate and verify

1. `git -C <worktree> diff --name-only origin/<defaultBranch>...HEAD` against
   `protectedPaths`. Any match ⇒ step 7, quoting the paths.
2. Run each `verify` command through `bond:test-runner`. A failure goes back to
   the phase agent once with the failures; a second failure ⇒ step 7.

### 5. PR and review

1. Push the branch. Open the PR with the profile's `pr` command (run in the
   worktree) when there is one; otherwise follow `/bond:open-pr`.
2. Run `bond:pr-review` and `bond:security-review` as the pair in
   `${CLAUDE_PLUGIN_ROOT}/shared/pr-review-flow.md`. Each critical or high
   finding goes to the phase agent to fix, then push. At most 2 review rounds;
   one still open after that ⇒ step 7.

### 6. CI and merge

1. `bond:pr-status` on the PR once checks settle. Pending ⇒ wait with
   `gh pr checks <n> --watch --fail-fast` in the background. Do not poll.
2. Failed ⇒ `bond:ci-diagnose`, then:
   - **flaky or infra**: rerun once;
   - **code**: send the diagnosis to the phase agent, push, and count a fix round;
   - **pre-existing on the base**: step 7.

   Three fix rounds ⇒ step 7.
3. Green, and no review in `CHANGES_REQUESTED`:
   - `strategies.merge` is `squash-on-green` ⇒ `gh pr merge <n> --squash --delete-branch`;
   - any other merge strategy ⇒ phase `pr-open`; the owner merges.
4. Merged, and `closeBy` is not `agent` ⇒ run `close`. Phase `merged`. Then
   remove the worktree under the personal rule for pushed worktrees.

### 7. Needs the owner

The boss asks; it never answers for the owner.

1. Draft 2–4 answers, one per real choice in the question. Each is the full
   reply. A fact only the owner holds stays a `<placeholder>`.
2. One `AskUserQuestion`: the question whole in the prompt, the drafts as
   options. With `--max` above 1, park this task (phase `needs-owner`) and keep
   the others moving. Ask when nothing else is runnable.
3. The answer goes back to the phase agent as the owner's words. Resume at the
   phase that blocked.
4. The owner says drop ⇒ run `release`, list any unpushed work in the worktree
   as lost, and set phase `dropped`.

### 8. Next and report

Phase `merged`, `pr-open` or `dropped` is terminal. Take the next task until the
queue is empty or `--limit` is reached. With `--max N`, keep up to N in flight.
Never run two tasks whose plan files name the same paths at the same time.

Report one line per task:

```
#<id> <title> — merged #<pr> | pr-open #<pr> | dropped | failed: <why>   (<fix> fix, <review> review rounds)
```

## Do NOT

- Do not run while the crewboss CLI loop holds a task or its lock.
- Do not write code in this session; each change is a phase agent's.
- Do not send an answer the owner did not choose or write.
- Do not merge under any `strategies.merge` other than `squash-on-green`.
- Do not touch `protectedPaths` without the owner's answer.
