# Owner questions

> **Not an invocable command.** How every bond command phrases a question to
> the owner and records the answer. Used by the upfront question of the
> *Commands ask first* standing rule, by the **Autonomy** note of
> `implement-flow.md`, and by the batch commands' question rounds.

## Ask or decide

Every open point is sorted before anything is asked. Most are not questions:
a lead decision ships faster and the owner can still object to it.

**Ask** only a point with no safe default:

- an outward or irreversible step no standing preference already covers — a
  push, opening, readying or merging a PR, a tracker or chat write beyond the
  claim, a delete;
- a change to the schema, a contract, a stage or the scope beyond the issue's
  text, or to work someone else holds;
- money, legal, security or permission semantics;
- two readings of a requirement whose user-visible results differ, where
  neither the code, the spec nor an earlier ruling picks one.

**Decide** everything else — naming, structure, which of two equivalent
libraries already in the tree, test layout, the order of steps, a reading the
code or the spec already settles, a point an earlier ruling (R) of the same kind
answered. Each becomes an L with its one-line reason, applied without waiting.

When in doubt whether a point is one or the other, ask what it costs to undo:
a revert inside the branch is a decision, anything past the branch is a
question.

## The shape of one question

Plain words, no jargon the owner has to decode:

1. **The gist** — one to three sentences: what is undecided and why it matters
   now.
2. **Options A, B, C** — each with what it costs and what it buys. Two to four
   options; "Other" is always available, so it is never one of them.
3. **The recommendation** — first in the list, marked `(Recommended)`, with the
   one reason that decides it.

A question the owner asks back is a request for an estimate, not an order: answer
it with the cost and the recommendation, and start the expensive step only on an
explicit "do it".

## Owner rulings and lead decisions

Two lists, never mixed:

- **R1, R2, …** — the owner's rulings, each with the question it answered and
  its date. Only what the owner actually chose.
- **L1, L2, …** — what the lead decided alone because a sensible default exists.
  Shown to the owner as one list under "going with these unless you object",
  before the build starts. A lead decision is never presented as the owner's.

Both live in the plan file the work runs from (its `## Decisions` section, or
the batch plan's R/L sections); a ruling that outlives the batch goes where the
repository keeps standing rules, on the owner's yes.

## Rounds

One by default: it settles scope, every ask-class point recon found, and the
outward steps that come at the end (push, PR) — asked now, so the end does not
wait for an answer. A second round only when the plan surfaces a new ask-class
point; decide-class points it surfaces join the L list. Each round is one
`AskUserQuestion` call (up to four questions; more ⇒ a second call straight
after). No round starts code: every question is asked before the first edit of
the work it gates — work it does not gate goes on.

## Outside research

When the owner asks how a competitor or another product does it, one read-only
`haiku` agent looks; the answer comes back as a conclusion and a
recommendation, not a dump of what it found.
