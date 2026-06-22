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
Not the line count, not the private helper names, not the exact shape of an
intermediate value the implementation happens to build today.

The failure mode this skill prevents is the **change-detector test**: a test
written by reading the implementation and asserting back exactly what it
currently produces. It passes today, fails the moment anyone refactors (even
when behaviour is unchanged), and — worst of all — if the code has a bug, the
test faithfully locks the bug in. A change-detector test gives the green check
of "tested" while protecting nothing.

A good test is the opposite on both axes:

- It **fails when behaviour is wrong** — including the bug that's there now.
- It **survives a legitimate refactor** — same inputs, same observable outputs,
  green, even if every internal line changed.

If a refactor that preserves behaviour breaks your test, the test was coupled to
implementation. If a behaviour bug leaves your test green, the test was a
tautology. Aim between those.

## The non-negotiable: question suspicious behaviour, don't enshrine it

When you write a test you are **declaring what correct looks like**. So before
you type an `expect(...)`, ask: _is this value actually right, or is it just what
the code emits?_

If the answer is "I derived it from the spec / domain rules / the ticket" —
assert it. If the answer is "I ran the code and copied the output" and the output
looks **wrong, surprising, off-by-one, or arbitrary** — **stop and ask the
user.** Do not bake it into the test.

Concrete smells that should trigger a question instead of an assertion:

- A count that looks off-by-one (is a 1-night stay `checkIn`→`checkOut` counting
  1 night or 2?). Know the range convention before asserting it — if a domain
  uses half-open ranges `[start, end)`, an inclusive count is a bug; confirm the
  intended convention rather than copying whatever the code emits.
- A money total that rounds in a direction you can't justify, or that comes out
  in major units / as a float where the codebase is integer minor units.
- A thrown error of a type that seems wrong for the case (a `404` where a `409`
  fits a collision, a swallowed error that returns `null`).
- A scoped/tenant read that returns rows it shouldn't, or that leaks across the
  isolation boundary the code is supposed to enforce.
- Any "huh, that's odd" reaction while reading the code under test.

The cost of asking is one message. The cost of enshrining a bug is a green test
that actively defends the bug against every future fix. Ask.

> If the user confirms the surprising behaviour is intentional, capture _why_ in
> the test — a one-line comment on the rule — so the next reader doesn't re-flag
> it.

## Assert the contract, from the outside

Drive the unit through its public surface and assert on what a caller observes:
the return value, the thrown error, the persisted row, the rendered output, the
message put on the queue. Treat the internals as a black box.

### Example 1 — tautology vs real assertion

The code under test:

```ts
function stayTotal(nightlyMinor: bigint, nights: number): bigint {
  return nightlyMinor * BigInt(nights);
}
```

Change-detector (worthless) — re-derives the expected value with the **same
formula** the code uses, so it can never catch a wrong formula:

```ts
it('computes the total', () => {
  const nightly = 1000n;
  const nights = 3;
  expect(stayTotal(nightly, nights)).toBe(nightly * BigInt(nights)); // tautology
});
```

Behavioural — states the expected number independently, so a broken formula
fails:

```ts
it('totals nightly rate × nights in minor units', () => {
  // 3 nights at 10.00 → 30.00
  expect(stayTotal(1000n, 3)).toBe(3000n);
});

it('a zero-night stay costs nothing', () => {
  expect(stayTotal(1000n, 0)).toBe(0n);
});
```

The literal `3000n` is the contract written by hand. The tautology version would
stay green even if `stayTotal` started _adding_ instead of multiplying.

### Example 2 — assert the outcome, not the call

Over-mocking turns a test into a mirror of the implementation's call sequence:

```ts
it('saves the reservation', async () => {
  await service.create(DTO);
  expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ ... })); // brittle
});
```

This breaks if you rename a field, batch the save, or move persistence — none of
which change what the caller gets. Prefer asserting the observable result:

```ts
it('returns the persisted reservation with its generated id', async () => {
  const created = await service.create(DTO);
  expect(created.id).toBeDefined();
  expect(created.checkIn).toBe('2026-09-01');
});

it('maps a double-booking to a 409 Conflict', async () => {
  // the DB constraint is the hard guarantee; the service maps its violation to
  // ConflictException — that mapping is the contract.
  await expect(service.create(OVERLAPPING_DTO)).rejects.toBeInstanceOf(ConflictException);
});
```

`toHaveBeenCalledWith` is justified only when the _call itself is the observable
effect_ — e.g. an email was dispatched, a job was enqueued, an audit row was
written. There, assert the effect (a mail was sent to the guest) at the coarsest
level that still proves the behaviour, not every argument the impl happens to
pass.

### Example 3 — test the rule, name the rule

Each `it` should read as a sentence stating one rule of the contract. The name is
documentation; if it just says `it('works')` the test teaches nothing.

```ts
describe('isExclusionViolation', () => {
  it('treats half-open ranges as non-overlapping at the boundary', () => {
    // checkout day == next guest's checkin day is allowed
    ...
  });
});
```

## What earns a test, and what to cover

Spend assertions where behaviour is non-trivial and where breakage would hurt:

- **Domain rules** — pricing, totals, fees/VAT, counting, availability,
  date-overlap. Pure and high-value; test the edges.
- **Boundaries** — empty, zero, one, the off-by-one neighbour, min/max, the
  half-open range edge, null/undefined inputs, a past-date guard.
- **Error paths** — the _type_ of error and the condition that triggers it, not
  just the happy path.
- **The bug you're fixing** — a regression test must assert the **corrected**
  behaviour and must fail against the unfixed code. Write it, watch it fail on
  the old code, then fix. A regression test that was never red proves nothing.

Skip tests that don't pull their weight: a getter that returns a field, a
one-line pass-through, framework wiring with no logic. Coverage of trivial code
is noise that dilutes the signal of the tests that matter.

## Snapshots: rarely, and small

A snapshot asserts "the output is whatever it was last time" — the textbook
change-detector. Reach for it only for stable, human-reviewable output (a small
rendered string, a generated line) where you'll actually read the diff when it
changes. Never snapshot a large object blob nobody inspects; assert the few
fields that encode the contract instead.

## How to apply

- **Match the project's test framework and layout.** Use the same runner
  (`describe` / `it` / `expect` in vitest/jest, etc.) and co-locate specs the way
  the existing tests do (`<unit>.test.ts` next to the source, or the repo's
  convention).
- **Fakes over deep mocks.** A small hand-rolled fake that behaves like the real
  collaborator (a repo whose `save()` echoes the entity) lets you assert
  outcomes; a mock that records calls pushes you toward change-detector
  assertions. Prefer the fake.
- **Use the codebase's value types in expectations** — integer minor units for
  money (`bigint` / minor-unit literals, never floats), the project's calendar
  utility for day math rather than hand-rolled `Date` arithmetic.
- **Keep fakes honest about isolation** — when you fake a scoped/tenant
  repository, don't let it return rows the real one never would, or you're
  testing a fiction.
- **One rule per `it`**, named as that rule. If an `it` needs "and" in its name,
  it's probably two tests.
- When in doubt about whether a value is _correct_ vs merely _current_ — re-read
  "question suspicious behaviour" above and ask.
