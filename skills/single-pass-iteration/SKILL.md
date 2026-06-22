---
name: single-pass-iteration
description: >-
  Collapse repeated iterations over the same array/collection into a single
  pass. Use this whenever you write or review code that walks one collection
  more than once — multiple `.reduce()` calls computing different sums, a
  `.filter().map()` chain, a `.map()` followed by `.reduce()`, several
  `.filter(...).reduce(...)` over the same source, or two `for` loops over the
  same list. Trigger even when the user just asks to "clean up", "optimize", or
  "refactor" code that happens to contain redundant passes, and proactively flag
  it during code review. Especially relevant in hot paths, React `useMemo`
  bodies, and per-row/per-request handlers where the same array is scanned
  several times.
---

# Single-pass iteration

## The idea

Each `.reduce` / `.map` / `.filter` / `forEach` / `for` over a collection is a
full traversal. Computing N independent results over the _same_ source array in
N separate passes does N× the iteration work and reads worse than one labelled
pass that produces all N at once. Collapse them.

This is about **redundant traversals of one source**, not about merging
unrelated loops. If two loops walk different arrays, leave them alone.

## When it applies

- 2+ `.reduce()` over the same array, each accumulating a different value
- `.filter(...).reduce(...)` repeated with different predicates over one source
- `.map(...)` then `.reduce(...)` over the result (fuse into one reduce)
- `.filter().map()` chains (one pass that conditionally pushes)
- multiple `for` / `forEach` loops iterating the same list

## When to leave it

- The passes are over **different** collections.
- The intermediate array is reused elsewhere (e.g. a `.filter()` result is also
  returned or passed on) — fusing would force recomputation.
- It's a tiny array on a cold path and a single combined pass would actually
  read _worse_ than two obvious one-liners. Readability wins on cold paths;
  reach for the merge when there are 3+ passes or the path is hot
  (loops, `useMemo`, per-row/per-request handlers).
- Laziness/short-circuit matters (e.g. `.find()`, `.some()` that bails early) —
  don't turn an early-exit into a full scan.

## How to merge

Use a single `reduce` whose accumulator is an object holding every value, and
**destructure the result** so the call sites stay unchanged. Seed every field
and give the accumulator param a clear name.

### Example 1 — multiple reduces → one pass

Input:

```ts
const bookingNights = groupBookings.reduce((s, b) => s + b.bookedNights, 0);
const bookingCost = groupBookings.reduce((s, b) => s + b.totalPrice, 0);
```

Output:

```ts
const { bookingNights, bookingCost } = groupBookings.reduce(
  (acc, b) => {
    acc.bookingNights += b.bookedNights;
    acc.bookingCost += b.totalPrice;
    return acc;
  },
  { bookingNights: 0, bookingCost: 0 },
);
```

### Example 2 — filter + map → one pass

Input:

```ts
const activeNames = users.filter((u) => u.active).map((u) => u.name);
```

Output:

```ts
const activeNames = users.reduce<string[]>((acc, u) => {
  if (u.active) {
    acc.push(u.name);
  }
  return acc;
}, []);
```

### Example 3 — repeated filter+reduce → one pass

Input:

```ts
const frozenCost = weeks.filter((w) => w.frozen).reduce((s, w) => s + w.cost, 0);
const frozenTax = weeks.filter((w) => w.frozen).reduce((s, w) => s + w.tax, 0);
```

Output:

```ts
const { frozenCost, frozenTax } = weeks.reduce(
  (acc, w) => {
    if (w.frozen) {
      acc.frozenCost += w.cost;
      acc.frozenTax += w.tax;
    }
    return acc;
  },
  { frozenCost: 0, frozenTax: 0 },
);
```

## Rules to keep it safe

- **Preserve behavior exactly.** Same totals, same order, same types. Only the
  number of traversals changes.
- **Keep names at the call site stable** via destructuring, so nothing
  downstream has to change.
- **Type the accumulator** in TS (`reduce<T>` or a typed seed) so inference
  doesn't widen to `any`/`never`.
- **Don't over-merge.** Fusing unrelated logic into one giant reduce to save a
  pass is a net loss — if the combined body becomes hard to follow, stop. The
  goal is fewer passes _and_ equal-or-better readability, not cleverness.
