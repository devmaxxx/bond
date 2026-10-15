# Track build

> **Not an invocable command.** How a batch of issues is scouted, split into
> tracks and built by a fleet of subagents, with one review and one fix pass
> per track. Used by `/bond:implement-batch --group`, by `/bond:implement` with
> two or more tickets, and by companion batch commands, which add their
> repository's own claim, plan and close steps around it.

The lead — the session running the command — orchestrates and barely codes.
Every subagent gets the absolute repo path, its own worktree, and the rule that
it writes nowhere else.

## 1. Recon

One `bond:batch-scout` agent (haiku, read-only) per group of about five
issues, all launched in one message. Each reads the issue, the spec it cites
and what the code already has (the repo's graph or index first, then
`path:line`), and returns per issue its fixed schema: verdict, estimate,
dependencies, files, new-file dirs, shared kinds, evidence, confidence, and
every open question with its class (`ask` | `decide`) and recommended answer
per **Ask or decide** in `owner-questions.md`.

**The lead re-checks every `mostly-built` and `already-done` itself**, against
the code and the spec, and a `ready` only when its confidence is `low` or its
`depends` names something open. A cheap scout misses a decision already taken
and pins a remainder on the wrong milestone; a wrong `already-done` closes work
nobody did. A wrong `ready` costs less: its implementer finds the code there,
reports it and stops. Run the re-checks in parallel — one read each — not one
issue after another.

## 2. Tracks

Group the `ready` issues into **tracks** by code: two tracks never edit the same
file, and a shared kind (one migration sequence, one contract version, one
generated client) keeps its issues in one track. Within a track, order the
steps so each follows what it depends on. A step whose only open points are
`decide` is a step, with those points as L decisions; one with an `ask` point
is an **option** the owner rules on.

A track with no option among its steps does not wait for the owner's answers
on another track's: it builds as soon as its plan is final.

## 3. Fleet arithmetic

Before launching, print it: how many agents each phase starts and why — one
implementer per step, one reviewer and at most one fixer per track — and how
many run at once: one per track, and **no more than two tracks building at a
time**, since every implementer runs tests on the same machine (**The cheap
slice**). Make as many tracks as the code splits into without shared files, up
to four — a third and fourth track queue behind the first two. Typical: 8–16
agents in all.

## 4. The build

One `Workflow` script when the command's invocation opts into it; otherwise the
same shape with background `Agent` calls.

```js
async function track(name, worktree, steps) {
  const built = []
  for (const s of steps) {                  // steps run in order within a track
    const r = await agent(COMMON + where(name, worktree) + s.text,
      { phase: 'Build', model: 'opus', effort: 'high', schema: IMPL })
    built.push(r)
    if (!r || r.status === 'blocked') break // a block stops the track, not the batch
  }
  const review = await agent(reviewPrompt(name, worktree, built),
    { phase: 'Review', model: 'opus', effort: 'high', schema: REVIEW })
  const actionable = review.findings.filter(f => f.severity !== 'nit')
  const fix = actionable.length
    ? await agent(COMMON + fixPrompt(actionable),
        { phase: 'Fix', model: 'opus', effort: 'high', schema: IMPL })
    : null
  return { name, built, review, fix }
}
// two tracks at a time: the third starts when one of the first two finishes
const queue = [...TRACKS], results = []
const lane = async () => { for (let t; (t = queue.shift()); ) results.push(await track(t.name, t.worktree, t.steps)) }
await parallel([lane, lane])
return results
```

**Implementers are opus.** A step is one issue, or two small ones in the same
code.

### `COMMON` — the prefix every implementer and fixer gets

- Work only in your worktree; never touch the main checkout or another track's.
- The plan is the contract: read the owner's rulings (R), the lead's decisions
  (L) and your own items before the first edit.
- A failing test first; at the end the cheap slice — lint, typecheck, the unit
  sets of the touched packages, the integration specs of this step. End-to-end
  runs are the forge's. Keep the slice small (see **The cheap slice** below):
  only the touched packages, never their dependents, and capped parallelism.
- Before editing a symbol, measure its blast radius with the repo's tooling;
  report HIGH or CRITICAL in `impact_warnings`.
- Verify every third-party API against the pinned version's docs
  (`docs-explorer`), never from memory.
- No new dependency and no build-config change.
- Commit per `bond:authorship-conventions`; never push.
- Migration numbers and the contract version come from the plan, not from what
  looks free.
- A small defect in the code you are in: fix it. Anything bigger goes to
  `seams`; anything the owner must decide goes to `owner_items`.
- Another track runs tests on the same database at the same time: a test that
  fails on a collision is re-run once before it counts.

### `IMPL` — the return schema

`status` (`done` | `partial` | `blocked`), `commits` (sha + subject), `closed`
(issue ids), `tests` (command → result), `impact_warnings`, `seams`,
`owner_items`, `note`.

### The review

One reviewer per track, read-only, `effort: high`, over the track's whole diff,
every lens at once:

- behaviour against the issue text and the plan's items;
- tests that would pass without the code;
- permissions and row-level security;
- money and time;
- migrations, and the contract version;
- user-facing strings in the product's language;
- the seams between steps.

Each finding: `severity` (`must` | `should` | `nit`), `file:line`, the defect in
one line, the fix in one line.

### The fix

One fixer per track takes every `must` and `should`. A finding it disagrees with
goes to `rejected_findings` with the reason; it is never silently dropped.

### The cheap slice

Each track's slice runs its tests on the same machine as every other track's,
and test runners default to one worker per core. Four tracks with
`--filter='...[origin/main]'` (the changed packages **and every dependent**)
started about 190 vitest processes and 44 GB on a 36 GB Mac: the OS killed
processes and the machine had to be rebooted (beauty-crm, 2026-10-15). So:

- **At most two at once.** No more than two test runs on the machine at a
  time — a track's slice, or an implementer or fixer running its tests, counts
  as one. The lead queues the rest and starts the next as one finishes.
- **Touched packages only.** Filter to the changed workspaces
  (`--filter='[origin/main]'` in turbo, no `...`); dependents are the forge's.
- **Cap the parallelism.** The task runner at two (`turbo --concurrency=2`),
  the test runner at two workers (`vitest --maxWorkers=2`, or the runner's
  equivalent), and a single changed spec file run by path when that is enough.
- Say the limits in every prompt that runs tests: an implementer, a fixer and
  a test runner each inherit no limit otherwise.

## 5. After the build

The lead reads the results, closes what closes without code, decides the
decide-class owner items itself (as L), puts only the ask-class ones back to the
owner in the `owner-questions.md` format, and pushes only on the owner's word —
given in the first round when it was asked there, so a green track with no
must finding left pushes without a new question.
