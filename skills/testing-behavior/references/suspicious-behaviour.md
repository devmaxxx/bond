# Question suspicious behaviour, don't enshrine it

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
