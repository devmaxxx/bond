---
description: Implement a whole batch of issues — a Jira release, epic, JQL, key list, or GitHub milestone/label — as parallel /bond:implement runs, scheduled so no two in flight touch the same files
---

# /bond:implement-batch

Runs `/bond:implement` over many issues at once, each in its own worktree and
its own subagent, at most `N` at a time. What it adds over launching them by
hand is the scheduling: it predicts which files each issue will touch and never
runs two issues at once that share one, so the PRs that come out do not fight
each other at merge time.

Everything per issue — claim, In Progress, branch, plan, implement, test,
review, ship, PR, In Review, teardown — is `${CLAUDE_PLUGIN_ROOT}/commands/implement.md`
and the procedures it names in `${CLAUDE_PLUGIN_ROOT}/shared/implement-flow.md`.
This command owns only selection, the conflict map, the schedule and the ledger.
Read both files.

Autonomous per the **Autonomy** note in `implement-flow.md`. It never stops to
ask mid-batch: an issue that would need a question is set aside and reported.

## Usage

```
/bond:implement-batch <source> [--max N] [--group] [--limit K] [--base <branch>] [--dry-run]
```

### Source

| Form | Issues |
| --- | --- |
| Jira release URL (`…/projects/<P>/versions/<id>/…`) | JQL `fixVersion = <id>` |
| Jira board/backlog URL (`…/projects/<P>/boards/<n>/…`) | JQL `project = <P>`, plus `assignee = <id>` when the URL filters on one |
| one key whose type is `Epic` | JQL `parent = <KEY> OR "Epic Link" = <KEY>` — team- and company-managed projects store the link differently |
| JQL (contains `=`, ` AND `, ` IN ` or `ORDER BY`) | as given |
| keys `ERP-1 ERP-2 …` (or a single non-epic key) | those keys |
| GitHub milestone URL, `milestone:<name>`, `label:<name>` | `gh issue list --state open --limit 1000 --milestone/--label … --json number,title,body,labels,assignees` (the default limit is 30) |

Jira search: `mcp__bond-atlassian__searchJiraIssuesUsingJql` with the `cloudId`
from **Resolve Jira ticket(s)**, fields `summary,issuetype,status,assignee,priority,issuelinks,labels,components,description`,
following `nextPageToken` until the result is exhausted.

### Flags

| Flag | Effect |
| --- | --- |
| `--max N` | Concurrent subagents, default `3`, capped at `10`: each holds a checkout with its own dependency install and test runs. |
| `--group` | Merge tightly related issues into one branch and PR (step 4). |
| `--limit K` | Implement only the first `K` selected issues, in rank order. |
| `--base <branch>` | Passed to every `/bond:implement` run. Default: the profile's `BASE_BRANCH`. |
| `--dry-run` | Stop after printing the schedule — nothing claimed, transitioned, branched or pushed. |

## The ledger

`~/.claude/bond/implement-batch-<OWNER>-<REPO_SLUG>-<source-slug>.json` —
outside the repo, like ship-pr's, so a later session can resume. Written after every state change, so a re-run with the same source
continues instead of redoing:

```json
{ "source": "…", "base": "main", "max": 3,
  "items": [ { "keys": ["ERP-41", "ERP-44"], "files": ["apps/api/src/x.ts"],
               "after": ["ERP-39"], "status": "pending | running | pr-open | blocked | failed | skipped",
               "branch": "feat/ERP-41_ERP-44", "worktree": "…", "pr": "…", "ci": "…",
               "agent": "<agent id>", "note": "…" } ] }
```

Another session may have moved things since, so resume never trusts the ledger
alone: step 1 also reads the remote, and an issue with a branch or PR already
there is not started again.

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
   Jump to step 5.

### 2. Select

From the source, keep an issue only when **all** hold — every dropped issue goes
in the report with its reason:

- **open** — status category *To Do* (`Todo`, `To Do`, `Backlog`, `Open`);
  GitHub: state open.
- **unassigned or mine** — never take an issue someone else holds.
- **no branch yet** — no local or `origin` branch contains its key (case-insensitive,
  and `ERP-4` is not in `ERP-41`). One that does
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

One read-only `Explore` agent per selected issue, all launched in one message,
each given the issue's summary, description and comments. Each returns only:

```
<KEY> files: <path>, <path>, …        # existing files it will edit
<KEY> new: <dir>/…                     # where new files will go
<KEY> shared: lockfile | migrations | generated client | i18n | route registry | none
<KEY> confidence: high | low
```

Two issues **conflict** when they share an edited file, a new-file directory
that holds an index or barrel, or any `shared` kind except `i18n` (keyed JSON
merges as a union — see **Resolve merge conflicts** in
`${CLAUDE_PLUGIN_ROOT}/shared/merge-conflicts.md`). A lockfile counts only when the
issue adds a dependency; migrations always count, since two branches cut from
the same base number theirs the same. `confidence: low` ⇒ conflict with every
issue sharing its top-level module: a wrong guess costs some parallelism, a
missed one costs a merge conflict.

### 4. Schedule

1. **Group** (`--group` only). Conflicting issues that are one piece of work —
   one links the other (`relates to`, `duplicates`, a subtask), or they share
   most of their edited files — become one item, at most 3 keys, implemented as
   one `/bond:implement <KEY1> <KEY2>` run: one branch, one PR. Log each group
   and why.
2. **Chain** every remaining conflicting pair: the later-ranked item gets
   `after` = the earlier one. An item that conflicts with two items that do not
   conflict with each other cannot stack on both branches: `after` is a list,
   it is cut from the later-ranked predecessor's branch, starts only once
   **all** of them are `pr-open`, and its report note names the other one
   (`also overlaps <KEY> — merge it first, then /bond:rebase`). Running them in turn is not enough on its own —
   two PRs cut from the same base still conflict when the second merges — so a
   chained item is cut from its predecessor's pushed branch (`--base
   <predecessor branch>`): its PR stacks on the earlier one and must merge after
   it. On GitHub, merging the predecessor with branch deletion retargets the
   stacked PR to the base; on Bitbucket it does not — say so in the report.
3. Print the schedule: items in start order, each with its keys, predicted
   files, `after`, and group. `--dry-run` ⇒ stop here.

### 5. Run

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
- the rules: write only inside its own worktree, never `git checkout` or commit
  in the main checkout; do not start a dev server on a fixed port, others run
  beside it; a `.git/*.lock` error from a concurrent `git worktree add` or fetch
  ⇒ wait a few seconds and retry once; a blocker ⇒ stop and report it, never
  `AskUserQuestion`;
- the return contract, one line:
  `RESULT <keys> status=pr-open|blocked|failed branch=<b> pr=<url> worktree=<path|removed> files=<changed files> note=<why, if not pr-open>`.

On each result: update the ledger. Compare `files=` with the predictions of
every `pending` item — a new overlap ⇒ chain that item onto this one (step 4.2)
before it starts. `failed` / `blocked` ⇒ its chained successors become
`skipped` (their base never landed). Then fill the freed slot.

### 6. Report

When nothing is `pending` or `running`: one `bond:pr-status` agent per PR, all in
one message, for the CI verdict. Do not watch or fix CI here — a red PR is
`/bond:ship-pr <PR>`.

```
issue            branch                 PR    CI       status    note
ERP-41, ERP-44   feat/ERP-41_ERP-44     #212  passed   pr-open   grouped: shared invoice form
ERP-39           feat/ERP-39            #211  running  pr-open
ERP-47           feat/ERP-47            #213  failed   pr-open   stacked on #211 — merge after it
ERP-50           —                      —     —        blocked   comment by A. Berg 2026-08-02 unanswered
ERP-52           —                      —     —        skipped   assigned to D. Lind
```

Then: merge order for stacked PRs, every `blocked` issue with its quoted
blocker, failed items with their worktree path (kept for inspection), and the
ledger path.

## Do NOT

- Do not run two items at once whose predicted or actual files overlap, and do
  not exceed `--max`.
- Do not take an issue assigned to someone else, or one that already has a
  branch — and never reassign one.
- Do not ask the user mid-batch; set the issue aside and report it.
- Do not merge, approve, or mark a PR ready — that is `/bond:ship-pr` and a human.
- Do not let a subagent touch the main checkout or another item's worktree.
- `implement.md`'s and the shared flow's **Do NOT** lists apply to every item.
