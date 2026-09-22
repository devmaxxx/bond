# What earns a test, and what to cover

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

# Snapshots: rarely, and small

A snapshot asserts "the output is whatever it was last time" — the textbook
change-detector. Reach for it only for stable, human-reviewable output (a small
rendered string, a generated line) where you'll actually read the diff when it
changes. Never snapshot a large object blob nobody inspects; assert the few
fields that encode the contract instead.
