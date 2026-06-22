---
name: always-use-braces
description: >-
  Always wrap the body of every control statement — `if`, `else`, `for`,
  `for…of`, `for…in`, `while`, `do…while` — in curly braces, even when the body
  is a single statement. Use this whenever you write, edit, refactor, or review
  JavaScript/TypeScript control flow, and proactively fix brace-less one-liners
  (`if (x) doThing();`, `for (…) acc.push(y);`, guard clauses like
  `if (!ok) return;`) during code review or cleanup. Trigger even when the user
  just says "clean up", "refactor", or "make this readable" on code containing
  unbraced blocks.
---

# Always use braces on control statements

## The idea

A control statement whose body is a bare single statement (`if (x) doThing();`)
reads fine until someone adds a second line — and then the second line silently
falls outside the block (the classic `goto fail;` bug). Always-braces removes
that whole failure mode: every body is a block, so adding a line is safe, diffs
stay one-sided, and the eye never has to decide "is this controlled or not?".

The cost is one line per block. The payoff is that the code can't lie about its
own structure. On a shared codebase that trade is worth it every time.

## What to brace

Every `if`, `else`, `else if`, `for`, `for…of`, `for…in`, `while`, and
`do…while` body — including one-liners and guard clauses.

### Example 1 — guard clause

Input:

```ts
if (!user) return null;
```

Output:

```ts
if (!user) {
  return null;
}
```

### Example 2 — single-statement if

Input:

```ts
if (week.frozen) total += week.cost;
```

Output:

```ts
if (week.frozen) {
  total += week.cost;
}
```

### Example 3 — loop body

Input:

```ts
for (const b of bookings) paid.push(b.id);
```

Output:

```ts
for (const b of bookings) {
  paid.push(b.id);
}
```

### Example 4 — if / else

Input:

```ts
if (isFrozen(w)) frozen.push(w);
else active.push(w);
```

Output:

```ts
if (isFrozen(w)) {
  frozen.push(w);
} else {
  active.push(w);
}
```

## What this does NOT touch

These aren't braceless blocks — leave them as they are:

- **Ternaries** — `const x = a ? b : c;` and ternary-push idioms like
  `(cond ? arrA : arrB).push(item);`. A ternary is an expression, not a block.
- **Arrow functions with an expression body** — `xs.map((x) => x * 2)`. Adding
  braces there changes semantics (you'd need an explicit `return`).
- **`switch` cases** — follow the surrounding file's existing style; braces on
  cases are situational, not part of this rule.

## How to apply

- Add braces without changing behavior or reformatting unrelated code — let the
  project formatter (prettier) settle indentation; a `PostToolUse` hook runs it
  automatically here.
- Keep `else` / `else if` on the same line as the closing brace
  (`} else {`) — that's the prettier default in this repo.
- When you spot a braceless block while editing nearby code, fix it in passing;
  it's a cheap, safe cleanup.
