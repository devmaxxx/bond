---
description: Run a batch of beauty-crm beta tasks the owner's way — Haiku recon, owner questions before any code, claim, one plan agent writing PRD-first, a two-track build workflow with review and fix, one PR per track merged together
---

# /bond-beauty-crm:batch

**Ask first.** Before the first write, one `AskUserQuestion` with every decision `$ARGUMENTS` leaves open — none when they settle it all (standing rule *Commands ask first*).

The owner's process for a batch of milestone tasks. It sits on the repository's
rules — `CLAUDE.md`, `.claude/CLAUDE.md`, the skills `tasks`, `pull-request`,
`oleg-skills`, `repo-query`, `feature-slice` — and overrides none of them; where
this file and a skill differ, the skill wins. It runs under
`${CLAUDE_PLUGIN_ROOT}/shared/questions-first.md` instead of bond's **Autonomy**
note.

Two bond files carry the generic half; read both before step 1. Find bond next
to this plugin: `BOND=$(ls -d ${CLAUDE_PLUGIN_ROOT}/../../bond/*/ | sort -V | tail -1)`.

- `$BOND/shared/owner-questions.md` — how a question is phrased, owner rulings
  (R) apart from lead decisions (L).
- `$BOND/shared/track-build.md` — recon schema, tracks, fleet arithmetic, the
  build/review/fix workflow and its schemas.

**Roles.** The **owner** decides. The **lead** — this session, on opus —
orchestrates and barely codes.

## Usage

```
/bond-beauty-crm:batch [<side>] [<MID> …] [<MID-T##> …] [--stage beta] [--max-tasks K] [--dry-run]
```

- `<side>` — `business` (BE-M…, FE-M00/01/02/03/05/06/11, …) or `client`; a
  batch never mixes them.
- `<MID> …` / `<MID-T##> …` — narrow the candidates to these milestones or take
  exactly these tasks.
- `--stage` — default `beta`.
- `--max-tasks K` — default `10` per track.
- `--dry-run` — stop after the recon report; nothing claimed.

## 0. Standing rules

- **Reports** to the owner are short, in the language the owner writes in, and
  only at the gates — after recon, after the plan, after the build — or at once
  on a blocker.
- **Push and merge** only on the owner's word. The batch merges together, not PR
  by PR; `main` takes only a squash, only on green.
- **An owner's question is a request for an estimate**, not an order: expensive
  steps start on an explicit "do it".
- **Never touch what is not yours.** The main checkout may be dirty from another
  session; every track lives in its own worktree under `.claude/worktrees/`; a
  card someone else holds is never taken.
- **Schema is `prd/02` only.** A field, table or enum it does not define is a PRD
  change first, then code.
- **Build config** (`packages/config/`, `turbo.json`, the root `package.json`) is
  not touched without an explicit request; a new dependency needs the owner's
  separate yes.
- **Identity.** Every `pnpm tasks` and `gh` write runs as
  `GH_TOKEN=$(gh auth token -u <gh_user>) …`, `gh_user` from
  `.claude/task-sync.local.json`. Never `gh auth switch`.

## 1. Recon — Haiku, read-only

1. **Candidates.** Open cards of the stage (`stage:beta`) on the side's
   milestones, from `gh issue list --label stage:<stage> --state open --limit
   1000` (paginate: the repo has more than a thousand issues) and
   `pnpm tasks report`. Drop: cards already held; the other side's; cards
   waiting on design or an owner decision. Dependencies are read off
   `origin/main`'s milestone file in all three forms — `After …`,
   `Depends on …`, `**Waits for:**` — and a `Waits for:` an owner, counsel or a
   lawyer is a blocker however the ids read.
2. **A recon worktree.** Detached, on fresh `origin/main`, read-only:
   `git worktree add --detach .claude/worktrees/recon-<date> origin/main`.
3. **The recon fleet.** About seven `haiku` agents at `effort: medium`, each with
   its group of cards, per `track-build.md` **Recon**: the task line, the PRD
   references, what the code already has (`pnpm exec repograph ask` / `impact`
   first). Verdicts `ready | mostly-built | already-done | blocked | needs-owner`,
   with estimate, dependencies and open questions.
4. **The lead re-checks** every `ready`, `mostly-built` and `already-done`
   against the code and the PRD. Haiku misses decisions already taken and pins
   remainders on the wrong milestone.
5. **Two tracks** by code, so they never edit the same files (for example
   track A «Najemca», track B «Kalendarz»). A migration sequence or a contract
   version bump is one shared kind: its tasks share a track. Doubtful tasks are
   **options**.
6. Remove the recon worktree. Report the recon to the owner. `--dry-run` ⇒ stop.

## 2. Owner questions — before any code

Per `owner-questions.md`. The first question is the batch's make-up: which
tracks, which options. Answers become R1, R2, … in the plan; the lead's own
small calls are L1, L2, … shown as "going with these unless you object". An
alpha task held by beta work is the owner's call: "do this piece now, or move
the task to beta". Expect two or three rounds — the plan surfaces new
contradictions.

## 3. Claim before the first edit

- `pnpm tasks claim <n>` from the main checkout. A track's first card creates
  its worktree; each other card of the track is
  `pnpm tasks claim <n> --join` from inside that worktree.
- A claim refused on the login ⇒ retry with the `GH_TOKEN` prefix, never skip.
- A claim that printed `spawnSync pnpm ENOENT` ⇒ in the worktree,
  `pnpm install --frozen-lockfile` then
  `pnpm turbo run build --filter='./packages/*'`.
- Send `broadcast:` lines only to the one or two sessions `ListAgents` shows as
  recent on the same milestone.

## 4. Plan and PRD — one agent

One background `opus` agent at `effort: xhigh` (the owner set this tier for the
plan) writes:

- **The plan** `docs/prd-2026-08-16/plans/YYYY-MM-DD-<side>-batch-<N>.md`:
  owner rulings R…; D-items (what exactly is built); lead decisions L…; owner
  questions Q… each with a recommendation; per track the steps S1…Sn, each
  starting from its failing test and naming its migration number and the
  contract version it lands.
- **PRD-first commits** on the tracks' branches.

No code, no push. It ends with `pnpm tasks check --since origin/main` at 0
problems.

The lead reads the plan, asks the owner what it surfaced, and sends the answers
to **the same agent** with `SendMessage` — never a new one, which would start
without the context.

## 5. Build — one Workflow, two tracks

Print the fleet arithmetic first (`track-build.md` **Fleet arithmetic**), then
run `track-build.md` **The build** with both tracks in parallel and steps in
order within each. Implementers, the reviewer and the fixer are `opus` at
`effort: high`; Haiku and Sonnet do not write code here.

`COMMON` is `track-build.md`'s, plus this repository's rules:

- before editing a symbol, `pnpm exec repograph impact <Symbol>`; HIGH or
  CRITICAL goes into `impact_warnings`;
- commits in English per the `oleg-skills` skill, no AI attribution, no push;
- each task closes with `pnpm tasks done <MID-T##>` in the same commit as its
  code; never a checkbox or `TRACKER.md` by hand;
- migration numbers and the contract version from the plan;
- the other track runs tests on the same Docker Postgres: a test that fails on a
  collision is re-run once;
- e2e is the forge's.

`IMPL` returns `track-build.md`'s schema with `tasks_closed` and the
`Plan-Done` trailers in place of `closed`. The reviewer adds Polish UI strings to
its lenses.

## 6. After the build

1. Read the results. Close the tasks that close without code, with
   `pnpm tasks done` and the closing text from the plan.
2. Remaining owner items ⇒ questions again, per step 2.
3. Rebase each track onto `origin/main` — behind main, `pnpm tasks trailers`
   prints a bogus `Plan-Reopen` per task main ticked since the cut — and run the
   cheap slice.
4. On the owner's word: per track,
   `pnpm tasks pr <first MID-T##> <MID-T##> …` (the PR body ends with a
   `Closes #n` per card, then the `Plan-Done` block), then the `pull-request`
   skill: green run, and the batch's PRs merge together.
5. **Partly done ⇒ split** (`tasks` skill, "Split, not partial"): the shipped
   part closes, the rest becomes a new task of the milestone. Never
   `Plan-Partial`.
6. After the merges, remove the tracks' worktrees per the owner's worktree rule.

## 7. The batch ledger

Not memory files — bond's standing rule keeps lessons out of them. One ledger
per batch, outside the repo:
`~/.claude/bond/beauty-crm-<side>-batch-<N>.json`, written at every gate:
the recon result, the R and L lists, claimed cards and worktree paths, the
workflow id and commit hashes, and what is still open. A re-run reads it and
resumes. A ruling that outlives the batch (how notifications are billed, say)
goes to the repository's `.claude/CLAUDE.md` or the plan file, on the owner's
yes.

## Report

```
track  task          card   status    note
A      BE-M12-T17    #1649  done      first — branch backend/1649-…
A      BE-M12-T18    #1650  done      joined: same twilio adapter
B      FE-M03-T42    #1576  split     remainder FE-M03-T61
—      BE-M12-T19    #1651  option    needs the prod ADR — owner's call
PR #1860 (A) · PR #1861 (B) · merge together
```

Then `gh issue view <n> --json state,assignees,labels` for every card the batch
touched: each is in a PR, released, or split.
