---
name: comment-hygiene
description: >-
  Comment the *why*, never the *what*: keep comments that explain a non-obvious
  business rule, invariant, gotcha, or surprising choice, and delete ones that
  merely restate the code (a name, a type, a union, a literal). Keep ticket IDs
  (`ERP-587`, `JIRA-123`) and issue links out of code comments — git blame,
  commit messages, and the PR carry that traceability. Use this whenever you
  write, edit, or review comments, and proactively prune restate-comments and
  strip ticket tags during code review or cleanup. Trigger even when the user
  just says "clean up", "remove comments", "keep only important comments", or
  "review this PR". Pairs with [[readable-code-structure]] and [[stop-slop]].
---

# Comment hygiene

## The idea

Every comment is a liability: it can go stale, it adds noise, and it makes the
reader stop and check whether the prose still matches the code. A comment earns
its keep only when it tells the reader something the code _cannot_ — the *why*
behind a surprising choice, a business rule that isn't visible in the types, an
invariant the code relies on but doesn't enforce locally, or a gotcha that will
bite the next editor.

A comment that restates the *what* — the function name, the type, the literal
values, the obvious effect of the next line — is pure cost. Delete it.

## Delete: comments that restate the code

If the comment says the same thing the symbol name, signature, or body already
says, it's noise. The reader can read the code.

```ts
// Tri-state filter for a yes/no flag: no filter, only-yes, only-no.
export type TriStateFilter = "all" | "yes" | "no";   // the union already says this
```

```ts
/** Force parkingCost to null unless parking is yes/option. */
private normalizeParkingCost(parking, parkingCost) {   // the name + body say this
  return this.parkingHasCost(parking) ? (parkingCost ?? null) : null;
}
```

```ts
// Amenity/parking filters.          ← labels a block whose code is self-evident
if (filters.sharedBathroom != null) { … }
```

All three: delete the comment, keep the code.

A comment that just converts a literal to prose is restate too — `const TIMEOUT = 30000; // 30 seconds`. Encode the unit in the name instead (`TIMEOUT_MS = 30_000`) and drop the comment. Keep it only when it adds a *why* the number can't (`// 30s — upstream p99 is 22s`).

## Keep: comments that explain the why

These say something the code can't. Keep them (and write them when missing):

```ts
// The service is the boundary for the MCP path, which bypasses the DTO's
// class-validator checks — so re-validate here.
private validateParking(parking, parkingCost) { … }
```

```ts
// parkingCost is required only when parking is yes/option, so it can't live in
// VERIFY_REQUIRED_FIELDS (optional otherwise).
```

```ts
// Plain ADD COLUMN — instant lock, online-safe. All nullable so existing rows
// survive without a backfill (NULL = unanswered).
```

```ts
// Edge-detect so a no-op re-save of an already-verified row is left untouched.
if (accommodation.isVerified && !wasVerified) { … }
```

Litmus test before deleting: *does this comment tell me something I couldn't get
by reading the code?* If yes — keep it. If no — delete it.

## Keep ticket IDs out of code comments

`ERP-587`, `JIRA-123`, issue URLs and similar tags don't belong in code
comments. Git blame, the commit message, and the PR already tie any line to its
ticket — the tag in the comment just rots (the ticket closes, the work moves on)
and adds noise to every reader.

```ts
// before
/** Whether the bathroom is shared (ERP-587). NULL on legacy rows = unanswered. */
// after — drop the tag, keep the invariant
/** Whether the bathroom is shared. NULL on legacy rows = unanswered. */
```

```ts
// before
// Clear the cost qualifier when parking no longer carries one (ERP-587), so a
// after
// Clear the cost qualifier when parking no longer carries one, so a
```

If the comment is _only_ a ticket tag (`// ERP-587 fields`), delete it outright.

### Where ticket IDs ARE fine

- **Test `it()` / `describe()` titles** — `it("persists the ERP-587 fields", …)`
  acts as a traceability label for the spec, not a code comment.
- **Commit messages and PR descriptions** — that's where traceability lives.
- A migration / ADR header documenting a one-time decision, when the ticket is
  genuinely the only record of *why* — rare; prefer summarising the reason.

## Special cases the litmus doesn't settle

Some lines that look like comments aren't prose explanations, so the
why-not-what test misfires on them. Handle these by category:

| Comment kind | Rule |
|---|---|
| **Tool directive** — `eslint-disable*`, `@ts-expect-error`, `@ts-ignore`, `prettier-ignore`, `biome-ignore`, `istanbul ignore`, `c8 ignore` | **Never delete.** These are code, not commentary — removing one re-enables an error, changes coverage, or unsuppresses formatting. The why-not-what test does not apply. Keep any trailing rationale; if it has none and the reason isn't obvious, add one. |
| **`TODO` / `FIXME` / `HACK`** | Keep — it flags a real gap the code can't show. Strip any ticket tag in passing (`// FIXME: … (ERP-902)` → `// FIXME: …`). A bare marker with no content (`// TODO`) is noise — delete. |
| **Commented-out code** | Delete. Git remembers it; "kept for reference / remove after migration" is exactly the rot to cut. |
| **License / copyright header** | Out of scope — leave it untouched. Often tooling-enforced; never strip on a "clean up comments" pass. |
| **Names a non-obvious algorithm or idiom** — `// Luhn check`, `// x & (x-1) clears the lowest set bit` | Keep — naming the trick is a *why*: it tells you what the dense body can't. Better still, rename / unpack the code per [[readable-code-structure]] so the label becomes redundant, then drop it. |

## Generated files

Never hand-edit generated output (`schema.d.ts`, codegen types) to fix its
comments — the tags there mirror the source DTO/decorator descriptions. Fix the
source, then regenerate. Editing the artifact just gets overwritten.

## How to apply

- When pruning, remove the whole comment line(s) and let the formatter settle
  spacing — don't leave a dangling blank comment or an empty `/** */`.
- Strip ticket tags in passing whenever you edit a line that carries one.
- On a "remove excess comments" / "keep only important" request, default to
  aggressive: a comment survives only if it passes the why-not-what litmus test.
- Don't add new restate-comments while editing — if you're tempted to narrate
  the next block, consider extracting it into a named function instead (see
  [[readable-code-structure]]).
