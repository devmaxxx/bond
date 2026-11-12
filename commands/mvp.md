---
description: Build a whole MVP — from an idea, a spec or a set of tickets — in an empty folder or an existing repo; spec, vertical-slice tickets, walking skeleton, then every ticket in parallel on one integration branch, reviewed once, shipped as one PR
---

# /bond:mvp

**Ask first.** Before the first write, one `AskUserQuestion` with every decision `$ARGUMENTS` leaves open — none when they settle it all (standing rule *Commands ask first*). From an idea, that round runs through `superpowers:brainstorming` and its approved design is the answer; the outward points below ride along in the same round.

Takes an MVP from nothing to one PR in one run. This command owns only what
comes before the build — the repo, the spec, the tickets and the walking
skeleton ticket. The build is `/bond:implement-batch --integration`: read
`${CLAUDE_PLUGIN_ROOT}/commands/implement-batch.md` and the files it names.

```
idea ─▶ spec ─▶ tickets (graph) ─▶ integration branch ─▶ implement-batch --integration ─▶ smoke run ─▶ PR
        ▲ skipped from a spec      ▲ skipped from tickets
```

Every phase checks for its output first and skips when it is there, so a
re-run with the same arguments continues instead of redoing.

## Usage

```
/bond:mvp <idea | spec path | tickets> [--name <slug>] [--stack <hint>] [--max N] [--local] [--dry-run]
```

| Input | Starts at |
| --- | --- |
| free text (`a booking app for barbers`) | 1. Spec |
| a Markdown spec (`docs/specs/x.md`) | 2. Tickets |
| a tickets file (`docs/tickets/x.md`, `## <KEY>:` sections) | 3. Repo |
| any `/bond:implement-batch` source — Jira epic, release, JQL, keys, GitHub milestone or label | 3. Repo, the spec read from what the tickets cite |

| Flag | Effect |
| --- | --- |
| `--name <slug>` | The MVP's slug: spec and tickets file names, ticket key prefix, integration branch `feat/<slug>`. Default: from the spec's title. |
| `--stack <hint>` | The stack, when the input does not name one (`next+postgres`, `fastapi+htmx`). Otherwise it is a decide-class point of the spec. |
| `--max N` | Passed to `implement-batch`. |
| `--local` | No GitHub repo, no push, no PR: the run ends on the integration branch. |
| `--dry-run` | Write the spec and tickets, print the batch's schedule, stop — no repo created, nothing pushed or built. |

## The upfront round

Read-only first: `git rev-parse` (is there a repo?), the folder listing, the
project profile when there is a repo. Then the one round carries only what
is open:

- **From an idea** — the brainstorming conversation: what the MVP must let a
  user do, what is out of v1, the stack. Push for the smallest version that
  proves the idea; everything else goes under `## Out of scope`.
- **No repo or no remote, and no `--local`** — create a GitHub repo
  (recommended: private, under the account `bond:authorship-conventions`
  names for a personal repo), or stay local.
- **Tickets** — where they live when the profile says a tracker: the tracker
  (Jira issues under the project's epic, GitHub issues under a milestone) or a
  local tickets file (recommended for an MVP: no tracker writes). No tracker ⇒
  the file, no question.
- **Stack** — only when neither the input nor `--stack` names one and two fit
  equally; otherwise it is decided and logged.

## Steps

### 1. Spec

Skipped when the input is a spec or tickets. The brainstormed design becomes
`docs/specs/<slug>.md`:

- `## Goal` — who the MVP is for and the one thing it proves;
- `## Users and journeys` — the core journeys end to end, each a numbered list;
- `## Requirements` — each with acceptance criteria an automated test can
  check (`AC-<n>`);
- `## Stack` — language, framework, storage, auth, hosting, each version
  pinned — a third-party scaffolder or library confirmed against its current
  docs through `bond:docs-explorer`, never from memory;
- `## Out of scope` and `## Decisions` (every decide-class point, with its
  reason).

### 2. Tickets

Skipped when the input is tickets. Split the spec into **vertical slices**: each
ticket a thin path through every layer that a user can see working, never a
layer on its own ("DB schema", "API", "UI"). Typical: 5–12 tickets.

- **`<KEY>-1` is the walking skeleton**, and every other ticket is blocked by
  it: the app boots; one trivial route or screen; the test runner with one
  passing test; lint and typecheck; an end-to-end harness with one smoke test
  when there is a UI; a CI workflow running all of them; `.env.example`; a
  README with the run and test commands. Every later item's cheap slice and
  the final Verify run on what it sets up. A scaffolder that refuses a folder
  that is not empty runs in a temporary folder and its output is moved in.
- Every other ticket: the journeys and `AC-<n>` it delivers, its predicted
  files, and `Blocked by:` only where it truly needs another ticket's code —
  every needless edge removes parallelism.
- **Coverage.** Every `AC-<n>` belongs to exactly one ticket; print the map
  and fix a gap before going on.
- **Names.** Anything two tickets both add — an entity, a route, a string key,
  an env var — gets its exact name in the ticket that adds it first, and the
  other ticket points at it.

Local file, `docs/tickets/<slug>.md`, keys `<SLUG>-<n>` (the slug in capitals):

```markdown
# <MVP name> — tickets
Spec: docs/specs/<slug>.md

## SHOP-2: Customer signs up and sees an empty cart
Status: open
Blocked by: SHOP-1
Delivers: AC-1, AC-2 (journey 1, steps 1–3)
Files: apps/web/src/app/signup/page.tsx, apps/api/src/users/…
Names: User.email, POST /api/users, cart.empty

<what to build, in the spec's words>
```

Tracker instead ⇒ one issue per ticket with the same body, through
`/bond:jira` create (an epic over them) or `gh issue create` (a milestone over
them), blocking links set; the source for step 4 is that epic or milestone.

### 3. Repo

`--dry-run` ⇒ skip this step and run step 4 with `--dry-run` on the tickets.

- **No repo** ⇒ `git init -b <base>` (`main` unless the profile says
  otherwise), a `.gitignore` for the stack, a README holding the spec's goal, a
  `.bond/project.json` (`tracker` as step 2 chose, `baseBranch`), staged by
  path in one commit `chore: initialize repository` — the spec and tickets
  wait for the integration branch.
- **No remote, no `--local`** ⇒ `gh repo create <owner>/<slug>
  --private|--public --source . --remote origin` as the account the round picked, then push
  `<base>`. `--local` ⇒ every `origin/<base>` in the batch reads `<base>`,
  nothing is pushed, no PR opens.
- **Integration branch.** Cut `feat/<slug>` from the base into a worktree per
  **Set up the branch**, commit the spec and the tickets file there
  (`docs: add <slug> spec and tickets`), push it. It is the branch
  `implement-batch --integration` reuses.

### 4. Build

Run `/bond:implement-batch <tickets source> --integration feat/<slug>`
in-thread, per that file, with `--max` and `--dry-run` passed on — its upfront
question is already answered here, so it asks nothing new. Between its 5i.5
(review) and 5i.6 (ship), run step 5 below. The skeleton is the
only item on the first frontier; once it is merged, every ticket it unblocks
starts at once.

### 5. Smoke run

Start the app from
the integration worktree as the README says, on a free port, and walk each
journey in `## Users and journeys` once — through the `run` skill when the
session has it, otherwise the e2e harness the skeleton set up. A journey that
breaks is a defect: fix it with one `bond:track-implementer`, re-run Verify,
then let the batch ship. A journey that cannot be checked automatically goes
into the PR's test plan as a manual step.

### 6. Report

The batch's report, then: the spec, the tickets file or epic, the AC coverage
map, each journey's smoke result, the run command, and the next step —
`/bond:ship-pr <PR>` (or, under `--local`, the integration branch to try).

## Do NOT

- Do not start building from an idea the round did not approve as a spec.
- Do not cut horizontal tickets, or add a `Blocked by:` edge only for order.
- Do not let a ticket other than the skeleton add a framework, a test runner
  or a CI workflow.
- Do not create a public repo, or one under a work account, without the round's
  answer.
- `implement-batch.md`'s **Do NOT** list applies to the build.
