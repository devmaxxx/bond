---
description: Start implementing beauty-crm issues — claim the card, ask every question up front, then build, done and pr through the repository's own pnpm tasks flow
---

# /bond-beauty-crm:implement

**Ask first.** Before the first write, one `AskUserQuestion` with every decision `$ARGUMENTS` leaves open — none when they settle it all (standing rule *Commands ask first*).

`/bond:implement` for beauty-crm. The repository owns its task flow — the
`pnpm tasks` CLI, the card on GitHub, the checkbox flipped by the squash
commit's `Plan-Done` trailer — so this command drives that flow instead of
bond's Jira/`gh` one, and runs under
`${CLAUDE_PLUGIN_ROOT}/shared/questions-first.md` instead of bond's
**Autonomy** note: every question before the first edit, none after. Read that
file and the repository's `tasks` skill (`.claude/skills/tasks/SKILL.md`) first;
the skill wins wherever the two differ.

## Usage

```
/bond-beauty-crm:implement [<MID-T##> | #<n> | <MID>] … [--dry-run]
```

- `<MID-T##>` or `#<n>` — that task; find the card with
  `gh issue list --search '"<MID> T##" in:title'`.
- `<MID>` — the first card `pnpm tasks next <MID>` offers.
- nothing — the first card `pnpm tasks next` offers.
- Several tasks ⇒ they are one batch when they share files: hand them to
  `/bond-beauty-crm:batch` with the same ids. Tasks that share none are
  separate runs, one session each.
- `--dry-run` — stop after the questions gate; nothing claimed.

Every `pnpm tasks` and `gh` write runs as
`GH_TOKEN=$(gh auth token -u <gh_user>) …`, `gh_user` from
`.claude/task-sync.local.json`. Never `gh auth switch`.

## 1. Claim

`pnpm tasks claim <n>` from the main clone, before the first edit. Refused
because someone holds it ⇒ stop and say so, never reassign. Refused on identity
⇒ the `GH_TOKEN` prefix, retry. The output names the worktree; every later step
runs there, in a session of its own when this one already carries a branch.

## 2. Read

In the worktree: the task line and its milestone file (stage line, `Depends
on:`), the card thread the claim printed, `prd/02` for every entity the task
names, the `MODULE.md` of each workspace it touches, and
`pnpm exec repograph impact <Symbol>` for each symbol it will change. The
repository's `feature-slice` skill names the order of the layers and the skill
that owns each.

## 3. Questions gate

`shared/questions-first.md`, in full: every open point in one
`AskUserQuestion` call, answers recorded, before the first edit. `--dry-run` ⇒
stop here.

## 4. Build

Per `feature-slice`: migration, contracts, api, ui, fixture and seed, tests —
TDD, the money-and-time vocabulary, the comment rules. Commit as you go with
Conventional Commit subjects; the **first** commit's subject is the PR title
`pnpm tasks pr` will take, so it names the task's work as a whole.

Before the PR: the cheap slice (`lint`, `typecheck`, the unit sets of the
touched packages), `pnpm exec repograph changes --base origin/main`, and bond's
`finishing-with-code-review` over the branch.

## 5. Done and PR

1. `pnpm tasks done <MID-T##>` — the whole task text shipped. Only part ⇒
   split it per the skill's "Split, not partial"; a later-stage remainder was
   a gate question, so its answer is already in hand.
2. Put the `Plan-Done` line at the end of the last commit message too.
3. **Ask the owner before the push.** On a yes: `pnpm tasks pr <MID-T##>`.
4. Hand over to the repository's `pull-request` skill for the run and the
   merge.

## 6. Report

The card, the branch, the PR, the gate's questions with their answers, any
decision taken after the gate, and
`gh issue view <n> --json state,assignees,labels` — the card is in the PR, or
handed off with the question that stopped it.
