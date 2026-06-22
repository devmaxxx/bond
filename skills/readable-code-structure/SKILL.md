---
name: readable-code-structure
description: >-
  Write code that reads top-down as a sequence of named intentions: split long
  functions into small, well-named ones, and replace awkward/clever control flow
  with plain expressions. Use whenever you write, edit, or review a function that
  is long, deeply nested, or does several unrelated things, and proactively when
  you spot awkward idioms — a `while (await repo.exists(...))` / loop-with-a-query
  to find a free value, a query inside a loop body (N+1), nested ternaries, a
  boolean "flag" parameter that splits a function in two, arrow-of-arrows, or a
  comment that exists only to explain the next block. Trigger even when the user
  just says "clean up", "refactor", "make this readable", or "structure this
  better". Pairs with [[always-use-braces]] and [[single-pass-iteration]].
---

# Readable code structure

## The idea

Code is read far more often than it is written. The cheapest readability win is
shape: a function should read like a short list of named steps, each step doing
one thing, with the awkward mechanics tucked behind a name. When a reader can
understand _what_ a function does from its top level without tracing _how_, the
structure is doing its job.

Two failure modes this skill targets:

1. **One function doing many things** — fetch + validate + compute + format +
   persist inline. Split it so each concern is a small named function and the
   caller reads as prose.
2. **Awkward or clever control flow** — loops that exist to search for a value,
   queries inside loops, nested ternaries, flag parameters, pyramids of `if`.
   Replace the cleverness with a plain expression or an early return.

The goal is _clarity_, not function-count. Don't shatter a clear 15-line
function into six one-liners — that just scatters the logic. Extract when a block
has a name you'd want to read, or when the function no longer fits in your head.

## Split into small, named functions

Pull a block out when **naming it explains it**. Good signs: you wrote a comment
to introduce the block (the comment becomes the function name), the block has its
own local scope that doesn't leak, or the function mixes levels of abstraction
(high-level flow next to low-level fiddling).

A function name should say _what_, the body says _how_. After extraction the
caller should read as a sequence of intentions.

### Example 1 — comment-introduced blocks become functions

Input:

```ts
async function createReservation(dto: CreateReservationDto) {
  // validate the date range
  if (dto.checkOut <= dto.checkIn) {
    throw new BadRequestException('checkOut must be after checkIn');
  }
  if (dto.checkIn < startOfToday()) {
    throw new BadRequestException('checkIn is in the past');
  }

  // compute the total
  const nights = differenceInDays(dto.checkOut, dto.checkIn);
  const total = Money.fromMinor(dto.nightlyMinor, dto.currency).times(nights);

  // persist
  const row = repo.create({ ...dto, totalMinor: total.toMinor() });
  return repo.save(row);
}
```

Output:

```ts
async function createReservation(dto: CreateReservationDto) {
  assertValidStay(dto.checkIn, dto.checkOut);
  const total = stayTotal(dto);
  return persistReservation(dto, total);
}
```

The three helpers carry the comments' intent in their names, and the top level
now reads as exactly what it does: validate, total, persist.

## Replace awkward control flow

### A loop whose job is to find a free value → compute it directly

The flagship anti-pattern: `while (await repo.exists(...))` to find an unused
slug. It runs one DB round-trip _per collision_ (an N+1 hidden in a loop) and
makes the reader trace a mutating loop to understand "pick a slug nobody has".
Fetch the colliding rows once, then resolve the candidate in memory.

Input (`property.service.ts`):

```ts
let candidate = base;
let suffix = 2;
while (await repo.exists({ where: { tenantId, slug: candidate } })) {
  candidate = `${base}-${suffix}`;
  suffix += 1;
}
return candidate;
```

Output — one query, pure in-memory resolution:

```ts
const taken = new Set(
  (
    await repo.find({
      where: { tenantId, slug: Like(`${base}%`) },
      select: { slug: true },
    })
  ).map((r) => r.slug),
);

return firstFreeSlug(base, taken);

// pure + unit-testable, no DB
function firstFreeSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    return base;
  }
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}
```

Same guarantee, one round-trip, and the "pick a free slug" logic is now a pure
function you can unit-test without a database. (A `(tenantId, slug)` unique index
stays the hard backstop against a racing create either way — keep it.)

The general rule: **don't put a query (or any I/O) inside a loop condition or
body when one batched query upfront would do.** Loop over data already in memory,
not over the database.

### Deep nesting → early returns (guard clauses)

Input:

```ts
function priceFor(booking: Booking) {
  if (booking) {
    if (booking.confirmed) {
      if (booking.rate) {
        return booking.rate.times(booking.nights);
      }
    }
  }
  return Money.zero(booking.currency);
}
```

Output:

```ts
function priceFor(booking: Booking) {
  if (!booking?.confirmed || !booking.rate) {
    return Money.zero(booking.currency);
  }
  return booking.rate.times(booking.nights);
}
```

Handle the exits first, then let the happy path sit unindented at the bottom.

### Nested ternaries → a named helper or a lookup

Input:

```ts
const label = s === 'paid' ? 'Paid' : s === 'pending' ? 'Awaiting' : s === 'void' ? 'Cancelled' : 'Unknown';
```

Output:

```ts
const STATUS_LABELS: Record<InvoiceStatus, string> = {
  paid: 'Paid',
  pending: 'Awaiting',
  void: 'Cancelled',
};
const label = STATUS_LABELS[s] ?? 'Unknown';
```

A flat lookup reads at a glance and is exhaustively typed; chained `?:` does not.

### Boolean flag parameter → two functions

A function whose body is `if (flag) { ... } else { ... }` is two functions
wearing a trench coat. The flag forces every caller to know the internal branch
and read `true`/`false` at the call site with no clue what it toggles.

Input:

```ts
function sendConfirmation(booking: Booking, isOwner: boolean) { ... }
sendConfirmation(b, false);
```

Output:

```ts
function sendGuestConfirmation(booking: Booking) { ... }
function sendOwnerConfirmation(booking: Booking) { ... }
sendGuestConfirmation(b);
```

## When to leave it

- **A clear, short function** — even if it does two small things, if it already
  reads at a glance, extracting helpers just adds indirection. Readability wins.
- **A genuinely sequential procedure** where every line depends on the previous
  and there's no meaningful sub-step to name. Splitting it scatters the story.
- **Hot paths** where an extra function call or a different data structure would
  measurably hurt — but reach for this rarely and only with evidence; modern JS
  inlines small calls.
- **Over-extraction already present** — a helper used exactly once, named the
  same as the line it wraps (`addOne`, `getX`), that you have to jump to in order
  to read the caller. Inlining it back is the readable move.

## How to apply

- **Preserve behavior exactly.** This is a structural refactor — same inputs,
  same outputs, same errors. Don't smuggle in logic changes.
- **Extracted pure logic belongs in the right home.** Calculation (pricing,
  totals, fees, date math, availability) moves to a domain service or a shared
  module, never inline in a controller or a UI component. Route money and
  calendar math through the project's value objects / utilities rather than
  hand-rolling floats and raw `Date` arithmetic.
- **Name for the domain.** Keep identifiers in English; the name should describe
  the intent (`assertValidStay`), not the mechanism (`checkDates2`).
- **Brace every block you touch** ([[always-use-braces]]) and avoid re-introducing
  redundant passes ([[single-pass-iteration]]); let the formatter settle layout.
