---
description: Implement a whole batch of issues — a Jira release, epic, JQL, key list, or GitHub milestone/label — as parallel /bond:implement runs, scheduled so no two in flight touch the same files
---

# /bond:implement-batch

**Ask first.** Before the first write, one `AskUserQuestion` with every decision `$ARGUMENTS` leaves open — none when they settle it all (standing rule *Commands ask first*). Here it comes after the read-only recon (step 4.4), so the same one question also carries the owner points recon found.

Runs `/bond:implement` over many issues at once, each in its own worktree and
its own subagent, at most `N` at a time. What it adds over launching them by
hand is the scheduling: it predicts which files each issue will touch and never
runs two issues at once that share one, so the PRs that come out do not fight
each other at merge time.

`--integration` swaps the many-PRs shape for one: every issue lands on one
**integration branch**, an item starts the moment its blockers are merged
there instead of when their PRs open, and the whole batch is reviewed once and
ships as one PR (**5i**).

Everything per issue — claim, In Progress, branch, plan, implement, test,
review, ship, PR, In Review, teardown — is `${CLAUDE_PLUGIN_ROOT}/commands/implement.md`
and the procedures it names in `${CLAUDE_PLUGIN_ROOT}/shared/implement-flow.md`.
This command owns only selection, the conflict map, the schedule and the ledger
— and, under `--integration`, the merges and the one closing review.
Read both files.

A repository that owns its task flow has a companion command instead: in
beauty-crm (`.bond/project.json` with `tracker: none` and a `pnpm tasks` CLI)
the batch is `/bond-beauty-crm:batch`. When it is not installed, say so and
offer to enable it in the clone's `.claude/settings.local.json` before running
this one — the generic flow knows nothing of the repository's claim, its
plan-file dependencies or its trailers.

Autonomous per the **Autonomy** note in `implement-flow.md`. It never stops to
ask mid-batch: what recon can see is asked once in step 4.4, and a question
that only surfaces during a run sets that issue aside for the report.

## Usage

```
/bond:implement-batch <source> [--max N] [--group | --integration [<branch>]] [--limit K] [--base <branch>] [--dry-run]
```

### Source

| Form | Issues |
| --- | --- |
| Jira release URL (`…/projects/<P>/versions/<id>/…`) | JQL `fixVersion = <id>` |
| Jira board/backlog URL (`…/projects/<P>/boards/<n>/…`) | JQL `project = <P>`, plus `assignee = <id>` when the URL filters on one |
| one key whose type is `Epic` | JQL `parent = <KEY> OR "Epic Link" = <KEY>` — team- and company-managed projects store the link differently |
| JQL (contains `=`, ` AND `, ` IN ` or `ORDER BY`) | as given |
| keys `PROJ-1 PROJ-2 …` (or a single non-epic key) | those keys |
| a tickets file (Markdown, one `## <KEY>: <title>` section per ticket with `Status:` and `Blocked by:` lines) | its sections whose `Status` is not `done`; `Blocked by:` keys are `is blocked by` links. Worked without a tracker: nothing is claimed or transitioned, and outside `--integration` each runs as a free-text task like a GitHub issue |
| GitHub milestone URL, `milestone:<name>`, `label:<name>` | `gh issue list --state open --limit 1000 --milestone/--label … --json number,title,body,labels,assignees` (the default limit is 30) |

Jira search: `mcp__bond-atlassian__searchJiraIssuesUsingJql` with the `cloudId`
from **Resolve Jira ticket(s)**, fields `summary,issuetype,status,assignee,priority,issuelinks,labels,components,description`,
following `nextPageToken` until the result is exhausted.

### Flags

| Flag | Effect |
| --- | --- |
| `--max N` | Concurrent subagents, default `3`, capped at `10`: each holds a checkout with its own dependency install and test runs. |
| `--group` | Merge tightly related issues into one branch and PR (step 4). |
| `--integration [<branch>]` | One integration branch and one PR for the whole batch (**5i**). Branch default: `feat/<source-slug>`, named per `bond:authorship-conventions`. Excludes `--group`: the integration branch already is the one PR. |
| `--limit K` | Implement only the first `K` selected issues, in rank order. |
| `--base <branch>` | Passed to every `/bond:implement` run. Default: the profile's `BASE_BRANCH`. |
| `--dry-run` | Stop after printing the schedule — nothing claimed, transitioned, branched or pushed. |

## The ledger

`~/.claude/bond/implement-batch-<OWNER>-<REPO_SLUG>-<source-slug>.json` —
outside the repo, like ship-pr's, so a later session can resume. Written after every state change, so a re-run with the same source
continues instead of redoing:

```json
{ "source": "…", "base": "main", "max": 3, "notes": "…-notes.md",
  "integration": { "branch": "feat/…", "worktree": "…", "pr": "…" },
  "agents": [ { "id": "…", "type": "bond:track-implementer", "item": "PROJ-41",
                "phase": "build", "status": "queued | running | done | failed",
                "started": "…", "result": "…" } ],
  "items": [ { "keys": ["PROJ-41", "PROJ-44"], "files": ["apps/api/src/x.ts"],
               "after": ["PROJ-39"], "status": "pending | running | pr-open | merged | blocked | failed | skipped",
               "branch": "feat/PROJ-41_PROJ-44", "worktree": "…", "pr": "…", "ci": "…",
               "agent": "<agent id>", "note": "…" } ] }
```

Another session may have moved things since, so resume never trusts the ledger
alone: step 1 also reads the remote, and an issue with a branch or PR already
there is not started again.

## Agents

Every agent the batch starts, by phase. The lead runs no code itself beyond
the merges and the ledger.

| Phase | Agent | Model / effort | How many | Does |
| --- | --- | --- | --- | --- |
| 3. Conflict map | `bond:batch-scout` | haiku / medium | 1 per ~5 issues, all at once | reads issues + code, returns verdict, files, shared kinds, questions |
| 5. Run | `general-purpose` running `/bond:implement` | opus / per routing | 1 per item, ≤ `--max` at once | claim → branch → plan → build → review pair → PR; starts its own `bond:test-runner` and `bond:security-review` inside |
| 5i.3 Build | `bond:track-implementer` | opus / high | 1 per item, ≤ `--max` at once | builds the item test first in its worktree, merges the integration tip, commits |
| 5i.4 Merge | `bond:track-implementer` | opus / high | only on a merge conflict | resolves it in the integration worktree |
| 5i.5 Verify | `bond:test-runner` | haiku / low | 1 per check command | returns failures only |
| 5i.5 Review | `/code-review` + `bond:security-review` | per `bond:routing-code-review` / opus high | 1 pair | reviews the whole integration diff once |
| 5i.5 Fix | `bond:track-implementer` | opus / high | at most 1 | fixes the findings that pass the scope gate |
| 6. Report | `bond:pr-status` | haiku / low | 1 per PR, all at once | CI verdict |

**Show them.** Before the first agent starts, print the fleet: this table cut
to the batch's mode, with each row's real count (`batch-scout ×3`,
`track-implementer ×9 + ≤1 fix`, …) and the total. Then, after every start
and every result, print one board — one line per agent that has run or is
running, never a running summary in prose:

```
#  agent               item               phase   status    since   result
1  batch-scout         PROJ-39…PROJ-44    recon   done      2m      5 ready, 1 blocked
4  track-implementer   PROJ-41            build   running   6m      —
5  track-implementer   PROJ-47            build   queued    —       after PROJ-41
6  track-implementer   PROJ-39            build   done      9m      merged ff, 3 commits
```

The board is the ledger's `agents` list, so a resumed session prints the same
board.

## Steps

### 1. Load or resume

1. Resolve the project profile. Before any subagent can push, apply
   `bond:authorship-conventions` once: the active `gh` account must be the one
   for this repo, and `git ls-remote origin` must succeed. Every subagent pushes
   with whatever account is active, so a wrong one here is wrong N times.
2. Ledger exists ⇒ load it. Per `running` item: its agent still alive ⇒ leave
   it; otherwise read the remote (`git ls-remote --heads origin | grep -iE '(^|[^0-9A-Za-z])<KEY>([^0-9]|$)'`,
   the host's PR list for that branch). PR open ⇒ `pr-open`. Worktree kept with
   commits ⇒ `pending`, resumed in that worktree (step 5). Neither ⇒ `pending`.
   Under `--integration`, an item whose branch tip is already on the
   integration branch (`git merge-base --is-ancestor`) ⇒ `merged`.
   Jump to step 5 (**5i** under `--integration`).

### 2. Select

From the source, keep an issue only when **all** hold — every dropped issue goes
in the report with its reason:

- **open** — status category *To Do* (`Todo`, `To Do`, `Backlog`, `Open`);
  GitHub: state open.
- **unassigned or mine** — never take an issue someone else holds.
- **no branch yet** — no local or `origin` branch contains its key (case-insensitive,
  and `PROJ-4` is not in `PROJ-41`). One that does
  is someone's work in progress (`/bond:worktree open <KEY>` picks it up).
- **unblocked** — run **Check for blockers** on it (description and every
  comment, via **Resolve Jira ticket(s)**). Any blocker ⇒ `blocked`, quoted with
  its source in the final report. `implement.md` would ask the user mid-run; a
  subagent cannot, so the question is answered here by setting the issue aside.
- **not waiting on the batch** — `is blocked by` an issue in this batch that is
  not Done ⇒ schedule it after that issue (step 4), not in parallel with it.

Order by rank (the source's order), then priority. Apply `--limit`.
`TRACKER=none` with a Jira source ⇒ stop: the profile says this repo has no
Jira.

### 3. Conflict map

One `bond:batch-scout` agent per group of about five selected issues, all
launched in one message, each given the issues' summary, description and
comments. Each returns the scout's fixed schema — verdict, files, new-file
dirs, shared kinds, questions with a recommendation each, confidence.

Re-check verdicts against the code per `track-build.md` **Recon** — every
`mostly-built` and `already-done`, a `ready` only when it is `low` confidence or
depends on something open. A `blocked` one is set aside
like a step 2 blocker. A `needs-owner` one, and every `questions:` line, is
sorted per **Ask or decide** in `${CLAUDE_PLUGIN_ROOT}/shared/owner-questions.md`:
decide-class points become the item's L decisions, passed to its run; an issue
left with an ask-class point waits for step 4.4.

Two issues **conflict** when they share an edited file, a new-file directory
that holds an index or barrel, or any `shared` kind except `i18n` (keyed JSON
merges as a union — see **Resolve merge conflicts** in
`${CLAUDE_PLUGIN_ROOT}/shared/merge-conflicts.md`). A lockfile counts only when the
issue adds a dependency; migrations always count, since two branches cut from
the same base number theirs the same. `confidence: low` ⇒ conflict with every
issue sharing its top-level module: a wrong guess costs some parallelism, a
missed one costs a merge conflict.

**Shared notes.** Write what recon found to the ledger's `notes` file, beside
the ledger: per issue its verdict, files, the code it builds on (`path:line`)
and its decisions. Two issues that each add the same kind of thing — a
user-facing string key, a type or field, a config entry, a column — get the
exact name each one uses pinned there, so parallel runs that never see each
other's work do not name one concept twice (`blockedSince` beside
`blockedOn`). Every run gets the notes path, not a pasted summary: the prompt
stays small and the run skips exploration recon already did.

### 4. Schedule

1. **Group** (`--group` only). Conflicting issues that are one piece of work —
   one links the other (`relates to`, `duplicates`, a subtask), or they share
   most of their edited files, or one shared kind (a migration sequence, a
   contract version, a generated client) — become one item, at most 10 keys,
   implemented as one `/bond:implement <KEY1> <KEY2> …` run: one branch, one PR,
   built as one track of `${CLAUDE_PLUGIN_ROOT}/shared/track-build.md`. Log each
   group and why.
2. **Chain** every remaining conflicting pair: the later-ranked item gets
   `after` = the earlier one. An item that conflicts with two items that do not
   conflict with each other cannot stack on both branches: `after` is a list,
   it is cut from the later-ranked predecessor's branch, starts only once
   **all** of them are `pr-open`, and its report note names the other one
   (`also overlaps <KEY> — merge it first, then /bond:rebase`). Running them in turn is not enough on its own —
   two PRs cut from the same base still conflict when the second merges — so a
   chained item is cut from its predecessor's pushed branch (`--base
   <predecessor branch>`): its PR stacks on the earlier one and must merge after
   it. Merging the predecessor with branch deletion retargets the
   stacked PR to the base.
   A squash merge rewrites the predecessor into one new commit, so the
   retargeted PR goes `DIRTY` even when nothing truly conflicts: rebase it with
   `git rebase --onto origin/<base> <predecessor's last head sha>`, re-run the
   cheap slice and push `--force-with-lease`. Record that sha in the ledger
   when the predecessor returns `pr-open`, since its branch is deleted on merge.
   When most selected issues conflict through one shared kind (a contract
   version, a generated client, migrations), chaining yields a stack as deep
   as the batch: offer `--group` or `--integration` instead, in step 4.4.
   **Under `--integration` nothing stacks:** a chained item, and one that `is
   blocked by` another, waits until all its `after` items are `merged` and is
   cut from the integration tip — no predecessor branches, no rebase after a
   squash.
3. Print the schedule: items in start order, each with its keys, predicted
   files, `after`, and group — then the fleet (**Agents**). `--dry-run` ⇒
   stop here.
4. **Ask once.** One `AskUserQuestion`, per `owner-questions.md`, with only
   what is still open: the ask-class points from step 3 (per issue, its options
   with the recommendation first, and "set it aside" among them), the `--group`
   offer when step 4.2 made it, and the outward steps `$ARGUMENTS` and standing
   preferences leave open. Nothing open ⇒ no question, say so in one line. Print
   the L list beside it as "going with these unless you object". Items with no
   open point start in step 5 at once; the rest start when their answer lands.

### 5. Run

Under `--integration`, run **5i** instead.

`git fetch origin` once before each start, from the orchestrator. A slot is free
while fewer than `--max` items are `running`. Start the next `pending` item
whose `after` items are all `pr-open` (or unset) and whose predicted files intersect no
`running` item's. Nothing eligible ⇒ wait for a completion.

Per item, one background subagent (`Agent`, `subagent_type: general-purpose`,
model per `bond:routing-model-and-effort` — `opus` to build). Do **not** pass
`isolation: "worktree"`: `/bond:implement` makes its own worktree under
`../worktrees`, and a second one around it nests checkouts. Its prompt carries:

- the absolute repo path and the absolute `${CLAUDE_PLUGIN_ROOT}`;
- the instruction: read `<plugin root>/commands/implement.md` and run it for
  `<KEYS>` (or, for a GitHub issue, the issue's title as the free-text task,
  with `Closes #<n>` in the commit body so `/bond:open-pr` leads the title with
  it), auto mode, worktree mode, `--base` per step 4 — Ship + PR runs with
  `PR_HANDLING=create` as `implement.md` sets it;
- after **Set up the branch**, run **Prepare the worktree** from
  `<plugin root>/commands/worktree.md` — a bare worktree has no env files or
  dependencies, and its tests fail on that, not on the code;
- a kept worktree from step 1 ⇒ work in it (`BRANCH_SOURCE=existing`) instead of
  cutting a new branch;
- the item's owner rulings and L decisions from steps 3 and 4.4, to go into its
  plan file's `## Decisions` as given — the run does not re-open them;
- the rules: write only inside its own worktree, never `git checkout` or commit
  in the main checkout; do not start a dev server on a fixed port, others run
  beside it; a `.git/*.lock` error from a concurrent `git worktree add` or fetch
  ⇒ wait a few seconds and retry once; a blocker ⇒ stop and report it, never
  `AskUserQuestion`;
- the return contract, one line:
  `RESULT <keys> status=pr-open|blocked|failed branch=<b> pr=<url> worktree=<path|none> files=<changed files> note=<why, if not pr-open>`.

On each result: update the ledger. Compare `files=` with the predictions of
every `pending` item — a new overlap ⇒ chain that item onto this one (step 4.2)
before it starts. `failed` / `blocked` ⇒ its chained successors become
`skipped` (their base never landed). Each run already ran its own review pair
before its PR opened, so nothing reviews it again here. Then fill the freed slot.

### 5i. Run — integration mode

The batch is a task graph: `after` edges are its blocking edges, and every
`pending` item whose `after` items are all `merged` is on the **frontier**. The
frontier comes from the ledger, never from the tracker — a Jira or GitHub
blocked-by link clears only when its blocker closes, which here is the end of
the run.

1. **Open the integration branch.** Cut it from `origin/<base>` into its own
   worktree per **Set up the branch** (`BRANCH_SOURCE=new`; a named branch
   already on `origin` is reused with `BRANCH_SOURCE=existing`), run
   **Prepare the worktree**, push it. Record both in the ledger. All merges happen there,
   never in the main checkout. Write the batch's `PLAN_FILE` there per
   **Implementation plan** — every selected issue under `## Tickets` and
   `## Spec`, one step per item, the R and L decisions — and commit it: it is
   each implementer's plan, and Verify maps its coverage at the end.
2. **Claim up front.** For every selected issue: **Claim unassigned
   ticket(s)**, then **Transition to In Progress** — the runs below do not
   touch the tracker.
3. **Build the frontier.** Same slot rule as step 5 (`--max`, no overlap with
   a `running` item's files). Per item, the lead cuts a worktree from the
   integration tip (`git worktree add -b <item branch> ../worktrees/<dir>
   <integration branch>`, then **Prepare the worktree**) and starts one
   background `bond:track-implementer` with `track-build.md`'s `COMMON`
   prefix, the worktree path, the item's keys, the notes path, the `PLAN_FILE`
   and its step. Its added rules:
   - before the first edit, check the worktree's base is the current
     integration tip, and reset onto it when it is not;
   - test first, the cheap slice at the end — no review pair, no push, no PR:
     the batch reviews once, in 5i.5;
   - before reporting `done`, merge the integration tip into its branch and
     re-run the cheap slice, so landing it is a fast-forward;
   - a GitHub issue gets `Closes #<n>` in its commit body.
4. **Merge each result as it lands.** `done` ⇒ in the integration worktree,
   `git merge --ff-only <item branch>`; not a fast-forward because another
   item landed meanwhile ⇒ `git merge --no-ff`; a conflict ⇒ one
   `bond:track-implementer` in the integration worktree resolves it per
   **Resolve merge conflicts** in `merge-conflicts.md` and re-runs the cheap
   slice. Mark the item `merged`, compare its actual files with every
   `pending` prediction as in step 5, then refill the slots from the new
   frontier. `partial` / `blocked` ⇒ not merged, its successors `skipped`.
5. **Review once, at the end.** When nothing is `pending` or `running`:
   **Verify** in the integration worktree, then **Review and fix** over the
   integration branch's whole diff against `origin/<base>` — one review pair,
   its findings through the scope gate, every finding that holds fixed by
   **one** `bond:track-implementer`, then the Verify commands again. Never
   mid-run: reviewed against the whole batch, every unbuilt item reads as a
   defect. No second review after the fix.
6. **Ship.** A tickets-file source: set each `merged` ticket's `Status:
   done` in one commit first. Then **Ship + PR** from the integration worktree with
   `PR_HANDLING=create`, `TICKET_IDS` = every `merged` key, then **Transition
   to In Review** for them. Remove every item worktree per **close** in
   `worktree.md`, then the integration worktree per **Teardown**. A failed
   item keeps its worktree for the report.

A test that reads gitignored fixtures, a local database or credentials can
skip silently in a worktree and report green: an item whose proof depends on
such material is verified in 5i.5, not trusted from its slice.

### 6. Report

When nothing is `pending` or `running`: one `bond:pr-status` agent per PR, all in
one message, for the CI verdict. Do not watch or fix CI here — a red PR is
`/bond:ship-pr <PR>`.

```
issue            branch                 PR    CI       status    note
PROJ-41, PROJ-44   feat/PROJ-41_PROJ-44     #212  passed   pr-open   grouped: shared invoice form
PROJ-39           feat/PROJ-39            #211  running  pr-open
PROJ-47           feat/PROJ-47            #213  failed   pr-open   stacked on #211 — merge after it
PROJ-50           —                      —     —        blocked   comment by A. Berg 2026-08-02 unanswered
PROJ-52           —                      —     —        skipped   assigned to D. Lind
```

Under `--integration`: one row per issue with the shared branch and PR, status
`merged` or why not, then the review's follow-ups from `## Decisions`.

Then: merge order for stacked PRs, every `blocked` issue with its quoted
blocker, failed items with their worktree path (kept for inspection), and the
ledger path.

## Do NOT

- Do not run two items at once whose predicted or actual files overlap, and do
  not exceed `--max`.
- Do not take an issue assigned to someone else, or one that already has a
  branch — and never reassign one.
- Do not ask the user mid-batch; set the issue aside and report it. Do not ask
  a decide-class point at all — record it as an L.
- Do not merge, approve, or mark a PR ready — that is `/bond:ship-pr` and a human.
- Do not let a subagent touch the main checkout or another item's worktree.
- Under `--integration`, do not review per item or mid-run, and do not start a
  second broad review after the fix — that loop is how a five-issue batch
  turns into hours.
- `implement.md`'s and the shared flow's **Do NOT** lists apply to every item.
