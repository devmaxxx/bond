---
name: testing-behavior
description: >-
  Write tests that pin the expected behaviour (the contract a caller relies on),
  not whatever the current implementation happens to produce. Use whenever you
  add, edit, or review a test — a `*.test.ts` / `*.spec.ts`, a `describe/it`
  block, a new service/util/component spec, or a regression test for a bug. Catch
  and refuse change-detector tests: assertions copied from the implementation,
  expected values re-derived with the same formula the code uses (tautologies),
  over-mocking that asserts "was called with" instead of the result, and giant
  snapshots. The non-negotiable rule: if the behaviour you're about to lock in
  looks wrong, surprising, or arbitrary, STOP and ask the user before enshrining
  it as "expected". Trigger even when the user just says "add tests", "cover
  this", "write a spec", or "test this function".
---

# Testing behaviour, not implementation

## The idea

A test exists to answer one question: **does the code do what a caller is
entitled to expect?** That expectation — the contract — is the thing you assert.
A good test **fails when behaviour is wrong**, including the bug that is there
now, and **survives a legitimate refactor**. The failure mode this skill
prevents is the **change-detector test**: written by reading the implementation
and asserting back what it currently produces.

Details: references/change-detector.md — read when a test's value is in doubt.

## The non-negotiable: question suspicious behaviour, don't enshrine it

When you write a test you are **declaring what correct looks like**. Before you
type an `expect(...)`, ask: _is this value actually right, or is it just what the
code emits?_ Derived from the spec, the domain rules or the ticket — assert it.
Copied from a run, and **wrong, surprising, off-by-one, or arbitrary** — **stop
and ask the user.** Do not bake it into the test.

Details: references/suspicious-behaviour.md — read for the smells that earn a question.

## Assert the contract, from the outside

Drive the unit through its public surface and assert on what a caller observes:
the return value, the thrown error, the persisted row, the rendered output, the
message put on the queue. Treat the internals as a black box. Never re-derive an
expected value with the formula the code uses, and never assert a call sequence
where the outcome is observable.

Details: references/examples.md — read before writing the first `expect` of a spec.

## What earns a test

Domain rules, boundaries, error paths, and the bug you are fixing — a regression
test must fail against the unfixed code. Skip trivial code. Snapshots are the
textbook change-detector: small, human-reviewable output only.

Details: references/what-to-cover.md — read when deciding what to cover.

## How to apply

Match the project's runner and layout, prefer a fake over a deep mock, use the
codebase's value types, one rule per `it`, named as that rule.

Details: references/how-to-apply.md — read while writing the spec.
