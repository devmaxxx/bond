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

One read-only `haiku` agent per group of about five issues, `effort: medium`,
all launched in one message. Each reads the issue, the spec it cites and what
the code already has (the repo's graph or index first, then `path:line`), and
returns per issue, strictly:

```
<id> verdict: ready | mostly-built | already-done | blocked | needs-owner
<id> estimate: <days>
<id> depends: <ids, with their state>
<id> files: <existing files it will edit>
<id> shared: migrations | contract version | generated client | lockfile | route registry | none
<id> questions: <open points, or none>
```

**The lead re-checks every `ready`, `mostly-built` and `already-done` itself**,
against the code and the spec. A cheap scout misses a decision already taken and
pins a remainder on the wrong milestone; a wrong `already-done` closes work
nobody did.

## 2. Tracks

Group the `ready` issues into **tracks** by code: two tracks never edit the same
file, and a shared kind (one migration sequence, one contract version, one
generated client) keeps its issues in one track. Within a track, order the
steps so each follows what it depends on. Anything doubtful is an **option** the
owner rules on, not a step.

## 3. Fleet arithmetic

Before launching, print it: how many agents each phase starts and why — one
implementer per step, one reviewer and at most one fixer per track — and how
many run at once (at most the number of tracks, usually two). Typical: 8–12
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
return parallel(TRACKS.map(t => () => track(t.name, t.worktree, t.steps)))
```

**Implementers are opus.** A step is one issue, or two small ones in the same
code.

### `COMMON` — the prefix every implementer and fixer gets

- Work only in your worktree; never touch the main checkout or another track's.
- The plan is the contract: read the owner's rulings (R), the lead's decisions
  (L) and your own items before the first edit.
- A failing test first; at the end the cheap slice — lint, typecheck, the unit
  sets of the touched packages, the integration specs of this step. End-to-end
  runs are the forge's.
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

## 5. After the build

The lead reads the results, closes what closes without code, puts the open
owner items back to the owner in the `owner-questions.md` format, and pushes only
on the owner's word.
