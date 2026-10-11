# Questions first

> **Not an invocable command.** The rule every bond-beauty-crm command runs
> under. It replaces the **Autonomy** note of bond's `shared/implement-flow.md`
> ("do not ask, pick and record") for this repository.

beauty-crm's own rules want doubts named out loud (`.claude/CLAUDE.md`, rule 1)
and some decisions reserved for the owner — an alpha task held by beta work, a
later-stage remainder of a split, a schema field `prd/02` does not define. A
question discovered halfway through costs a worktree that sits idle, or work
redone. So every question is asked **once, before the first edit**, and none
after.

## The gate

After the claim and the reading (task line, card thread, `prd/02`, the
milestone file, `repograph impact` of what will change) and **before the first
edit**:

1. List every open point:
   - an ambiguous requirement in the task text, or two readings of it;
   - an entity, field, enum or status `prd/02` does not define;
   - a third-party API whose pinned version is not yet confirmed (ask
     `docs-explorer` first — only what it cannot settle is a question);
   - a split whose remainder belongs to a later stage (owner's call, with the
     pros and cons of each path);
   - an alpha task held by beta work (same);
   - a `repograph impact` of HIGH or CRITICAL — warn before the edit;
   - a change to `packages/config/`, `turbo.json` or the root `package.json`;
   - anything the task would need that is outside its text.
2. Ask them **all in one `AskUserQuestion` call** (up to four questions; more ⇒
   a second call straight after, still before any edit). Each option carries its
   trade-off; a recommended one is first and says so.
3. Record each answer in the task's PR body summary or the plan file it touches,
   and where the repository's rules say a ruling lives (the stage line with its
   date, an ADR), there too.
4. Nothing open ⇒ say "no open questions" in one line and go.

## After the gate

The work runs without asking. A point that surfaces later and has a sensible
default is decided, and the decision goes into the PR body's summary. One that
has no safe default — it would change the schema, the stage, or another
session's task — stops the work: `pnpm tasks handoff <n> "<the question>"`,
and the question goes to the owner in the report, not mid-run.

Two asks are never folded into the gate and never skipped: the push (and
opening, readying or merging a PR) waits for the owner's yes, and a refused
claim is reported, never worked around.
