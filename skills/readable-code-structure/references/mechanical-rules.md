# Brace every control body

A control statement whose body is a bare single statement (`if (x) doThing();`)
reads fine until someone adds a second line — and then the second line silently
falls outside the block (the classic `goto fail;` bug). Always-braces removes
that whole failure mode: every body is a block, so adding a line is safe, diffs
stay one-sided, and the eye never has to decide "is this controlled or not?".
The cost is one line per block; on a shared codebase that trade is worth it
every time.

Brace every `if`, `else`, `else if`, `for`, `for…of`, `for…in`, `while` and
`do…while` body — one-liners and guard clauses included.

```ts
if (!user) return null;              // before
if (!user) {                          // after
  return null;
}

if (isFrozen(w)) frozen.push(w);      // before
else active.push(w);
if (isFrozen(w)) {                    // after
  frozen.push(w);
} else {
  active.push(w);
}
```

**Not braceless blocks — do not add braces to these:** ternaries
(`const x = a ? b : c;`, and `(cond ? arrA : arrB).push(item);`) are
expressions, not blocks; arrow functions with an expression body
(`xs.map((x) => x * 2)`) change semantics if you brace them — you would need an
explicit `return`; `switch` cases follow the surrounding file's style.

This is about *bracing* only, and does not contradict "Nested ternaries → a
named helper" above: a nested ternary should be replaced, not wrapped in a block
it cannot legally take.

Add braces without reformatting unrelated code — the formatter settles
indentation. Fix a braceless block in passing when you edit near one.

# One pass per collection

Each `.reduce` / `.map` / `.filter` / `forEach` / `for` over a collection is a
full traversal. Computing N independent results over the _same_ source in N
passes does N× the work and reads worse than one labelled pass producing all N.
This is about **redundant traversals of one source** — two loops over different
arrays are not this.

It applies to: 2+ `.reduce()` over one array accumulating different values;
`.filter(...).reduce(...)` repeated with different predicates over one source;
`.map()` then `.reduce()` over the result; `.filter().map()` chains; multiple
`for` / `forEach` over the same list.

Merge with a single `reduce` whose accumulator holds every value, and
**destructure the result** so call sites stay unchanged:

```ts
const bookingNights = groupBookings.reduce((s, b) => s + b.bookedNights, 0);
const bookingCost = groupBookings.reduce((s, b) => s + b.totalPrice, 0);

const { bookingNights, bookingCost } = groupBookings.reduce(
  (acc, b) => {
    acc.bookingNights += b.bookedNights;
    acc.bookingCost += b.totalPrice;
    return acc;
  },
  { bookingNights: 0, bookingCost: 0 },
);
```

**Leave it** when the passes walk different collections; when the intermediate
array is reused elsewhere, so fusing would force recomputation; when it is a
tiny array on a cold path and one combined pass reads *worse* than two obvious
one-liners — reach for the merge at 3+ passes or on a hot path (loops,
`useMemo`, per-row/per-request handlers); or when short-circuiting matters
(`.find()`, `.some()`), because fusing turns an early exit into a full scan.
