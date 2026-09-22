# The idea

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

# Split into small, named functions

Pull a block out when **naming it explains it**. Good signs: you wrote a comment
to introduce the block (the comment becomes the function name), the block has its
own local scope that doesn't leak, or the function mixes levels of abstraction
(high-level flow next to low-level fiddling).

A function name should say _what_, the body says _how_. After extraction the
caller should read as a sequence of intentions.

## Example 1 — comment-introduced blocks become functions

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

# Replace awkward control flow

## A loop whose job is to find a free value → compute it directly

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

## Deep nesting → early returns (guard clauses)

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

## Nested ternaries → a named helper or a lookup

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

## Stacked fallbacks → a named function

One `??` is a default and reads fine. A chain that mixes `??` with a ternary is a
decision, and a decision written inside an object literal has nowhere to put its
name or its reason — the reader holds three branches and their precedence in
their head while working out which parens bind what.

Input:

```ts
return {
  ...base,
  // A create that failed left no item behind, so a previous id is stale.
  webflowItemId:
    outcome.itemId ?? (outcome.action === 'create' ? null : (previous?.itemId ?? null)),
  status: PushStatus.Failed,
};
```

Output — the branches become guard clauses, in the order they are decided:

```ts
function itemIdAfterFailure(previous: PushState | null, outcome: PushOutcome): string | null {
  if (outcome.itemId !== null) {
    return outcome.itemId;
  }
  // A create is only planned when the collection holds no item under the slug,
  // and a create that failed left none behind — so an id still on the row is
  // stale, and keeping it would link at a page the site does not serve.
  if (outcome.action === 'create') {
    return null;
  }
  return previous?.itemId ?? null;
}

return { ...base, itemId: itemIdAfterFailure(previous, outcome), status: PushStatus.Failed };
```

The literal now reads as fields, the rule reads as a rule, and each branch has
room for the one comment that explains it. The same move applies to an `&&`/`||`
chain that encodes a rule, and to a ternary whose arms are themselves computed.

**Where the line is:** a single fallback (`name ?? "unknown"`), a null-coalesce
over one optional chain, or one ternary over one condition stays inline. Extract
at the second operator, or as soon as the expression needs a comment to be read.

## Boolean flag parameter → two functions

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
