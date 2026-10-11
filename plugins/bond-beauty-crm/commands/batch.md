---
description: Close several beauty-crm milestone tasks that share files in one pull request — claim, join, implement, done each, one pr with every Closes and Plan-Done
---

# /bond-beauty-crm:batch

**Ask first.** Before the first write, one `AskUserQuestion` with every decision `$ARGUMENTS` leaves open — none when they settle it all (standing rule *Commands ask first*).

`/bond:implement-batch --group` for beauty-crm. The repository owns its task
flow — the `pnpm tasks` CLI, the card on GitHub, the checkbox flipped by the
squash commit's `Plan-Done` trailer — so this command drives that flow instead
of bond's Jira/`gh` one, under `${CLAUDE_PLUGIN_ROOT}/shared/questions-first.md`
instead of bond's **Autonomy** note. Read that file and the repository's `tasks`
skill (`.claude/skills/tasks/SKILL.md`) before step 2; the skill wins over this
file wherever the two differ.

## Usage

```
/bond-beauty-crm:batch <MID> [<MID-T##> …] [--max-tasks K] [--dry-run]
```

- `<MID>` — the milestone. Only its open cards of a worked stage are
  candidates (`pnpm tasks next <MID>` and `pnpm tasks status <MID>`).
- `<MID-T##> …` — take exactly these tasks instead of choosing.
- `--max-tasks K` — at most `K` tasks in the batch, default `10`. A bigger PR
  is a slower review and a wider revert, so the file-overlap rule below still
  decides who joins, not the cap.
- `--dry-run` — stop after the batch is printed; nothing claimed.

## Identity

Every `pnpm tasks` and `gh` write runs under the clone's pinned login, never
the machine's active account:
`GH_TOKEN=$(gh auth token -u <gh_user>) pnpm tasks …`, with `gh_user` from
`.claude/task-sync.local.json`. Never `gh auth switch`.

## 1. Choose the batch

1. List the candidates: open, unassigned, `stage:` of a worked stage, every
   `Depends on:` done. A card held by someone else is never a candidate.
2. For each, read its task line in the milestone file and predict the files it
   edits (`pnpm exec repograph ask "<task text>"`, then the `path:line` it
   prints).
3. The batch is the first-ranked task plus the candidates whose predicted files
   overlap its own — the same package and the same module, not merely the same
   workspace — up to `--max-tasks`. Tasks that share no files are not batched:
   they are separate PRs.
4. Print the batch: each id, card number, predicted files and why it joined.
   `--dry-run` ⇒ stop.
5. A task whose remainder belongs to a later stage (another milestone's beta,
   a prod ADR, a release tag) is left out and named: that is the owner's
   decision under `.claude/CLAUDE.md`, not this command's.

## 2. Claim

1. `pnpm tasks claim <first n>` from the main clone — it cuts the branch and
   the worktree, installs and builds. Every later step runs in that worktree.
2. From the worktree, `pnpm tasks claim <n> --join` for each other task: the
   card is held, no branch or worktree of its own.
3. A refused claim drops that task from the batch and is reported; a refused
   first claim ⇒ take the next-ranked task as the first.
4. Send the `broadcast:` lines only to the one or two sessions `ListAgents`
   shows as recent on the same milestone.

## 3. Questions gate

`shared/questions-first.md` over the whole batch: read every task (step 2 of
`/bond-beauty-crm:implement`), then every open point of every task in one
`AskUserQuestion` round, before the first edit. A task whose answer takes it
out of the batch is released now.

## 4. Implement

Per task, in batch order, in the one worktree: the repository's own skills
(`feature-slice` and the skills it names), TDD, its checkbox rules — the tick
covers the whole task text. Commit each task on its own with a Conventional
Commit subject.

A task that ships only in part is **split** per the `tasks` skill, section
"Split, not partial". A task that cannot be done in this PR at all ⇒
`pnpm tasks release <n>` and drop it — a batch never holds a card nobody is
working on.

## 5. Done and PR

1. `pnpm tasks done <MID-T##>` once per finished task. Put every `Plan-Done`
   line at the end of the last commit message too — local `pnpm verify` reads
   them from the commit range.
2. The cheap slice locally: `lint`, `typecheck`, the unit sets of the touched
   packages.
3. **Ask the owner before the push.** On a yes:
   `pnpm tasks pr <first MID-T##> <MID-T##> …` — the first id first, since the
   branch is its. The title is the branch's oldest Conventional subject — the
   squash subject plan-check judges — so the first commit of the batch is
   one; `pr` refuses a branch without one. The body ends with one `Closes #n`
   per card, then the trailer block; nothing goes under it.
4. Hand over to the repository's `pull-request` skill for the run, the merge
   condition and the squash.

## 6. Report

```
task          card   status    note
BE-M12-T17    #1649  done      first — branch backend/1649-…
BE-M12-T18    #1650  done      joined: same twilio adapter
BE-M12-T19    #1651  released  needs the prod ADR — owner's call
PR #1860 · Closes #1649 #1650 · Plan-Done BE-M12-T17 BE-M12-T18
```

Then `gh issue view <n> --json state,assignees,labels` for every card the
batch touched: each is in the PR, or released.
