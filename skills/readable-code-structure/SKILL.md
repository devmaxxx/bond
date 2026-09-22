---
name: readable-code-structure
description: >-
  Write code that reads top-down as a sequence of named intentions: split long
  functions into small, well-named ones, and replace awkward/clever control flow
  with plain expressions. Use whenever you write, edit, or review a function that
  is long, deeply nested, or does several unrelated things, and proactively when
  you spot awkward idioms — a `while (await repo.exists(...))` / loop-with-a-query
  to find a free value, a query inside a loop body (N+1), nested ternaries, a
  boolean "flag" parameter that splits a function in two, a stacked fallback that
  mixes `??` with a ternary, arrow-of-arrows, or a comment that exists only to
  explain the next block. Also covers the two
  mechanical rules that share this trigger exactly: brace every control-statement
  body, even a one-line guard (`if (!ok) return;`), and collapse repeated passes
  over one collection (two `.reduce()` over the same array, a `.filter().map()`
  chain, a `.map()` then `.reduce()`). Trigger even when the user just says
  "clean up", "refactor", "make this readable", "optimize", or "structure this
  better". Pairs with [[comment-hygiene]].
---

# Readable code structure

A function should read as a short list of named steps, each doing one thing. The two failure modes: one function doing many things, and clever control flow. Clarity, not function-count.

## Split into small, named functions

Pull a block out when **naming it explains it** — a comment introduces it, it has its own scope, or the function mixes levels of abstraction. The name says _what_, the body says _how_.

## Replace awkward control flow

- A loop that searches for a free value → one batched query, then resolve in memory. **No query or I/O inside a loop condition or body.**
- Deep nesting → early returns: exits first, happy path unindented.
- Nested ternaries → a flat lookup or a named helper.
- Stacked fallbacks → a named function; one `??` stays inline, extract at the second operator.
- A boolean flag parameter → two functions.

Details: references/structure-and-control-flow.md — read for the before/after of each.

## The two mechanical rules

Brace every `if`, `else`, `else if`, `for`, `for…of`, `for…in`, `while` and `do…while` body — one-liners and guard clauses included; not ternaries, not expression-bodied arrows.

One pass per collection: N results over the _same_ source in N passes does N× the work. Merge into one `reduce` and destructure the result. Leave it for different collections, a reused intermediate, or short-circuiting.

Details: references/mechanical-rules.md — read for the examples and the leave-it rows.

## When to leave it

Leave a clear short function, a sequential procedure, a measured hot path, an over-extracted helper. A refactor preserves behaviour exactly.

Details: references/leaving-it-alone.md — read before extracting, and for where the result lives.
