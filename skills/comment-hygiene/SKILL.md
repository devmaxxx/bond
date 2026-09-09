---
name: comment-hygiene
description: >-
  Comment the *why*, never the *what*: keep comments that explain a non-obvious
  business rule, invariant, gotcha, or surprising choice; delete ones that
  restate the code (a name, a type, a union, a literal). A doc comment on a
  public surface (rustdoc `///`, a docstring, JSDoc on an export) is API
  documentation, not commentary — it states the contract and stays. Keep
  work-item keys (`ERP-587`, `CRMDEV-7212`) and issue links out of code
  comments — blame, the commit and the PR carry that; a spec or invariant ID
  the repo itself defines (`FR-PAY-03`, `INV-11`) is a name, keep it. Any
  language, any comment syntax. Use whenever you write, edit, or review
  comments, and prune restate-comments and strip ticket tags in passing during
  review or cleanup — even when the user only says "clean up", "remove
  comments", "keep only important comments", or "review this PR". Pairs with
  [[readable-code-structure]] and [[authorship-conventions]].
---

# Comment hygiene

## Rules

| Comment | Rule |
|---|---|
| **Inline comment** — `//`, `#`, `--`, `;`, `<!-- -->`, `/* */` inside a body | Survives only by saying what the code cannot: the *why* of a surprising choice, a business rule the types don't show, an invariant relied on but not enforced here, a gotcha for the next editor. Restates a name, a type, a literal, or the next line ⇒ delete. |
| **Doc comment on a public surface** — rustdoc `///` and `//!`, a Python docstring, JSDoc `/** */` on an export, a Go doc line | API documentation: read without the body, and by tooling. Keep it, and make it state the contract — units, nullability, errors, ordering, cost — not the body. Never strip on a cleanup pass; `missing_docs`-style lints and generated docs depend on it. |
| **Doc comment on a private item** | Same litmus as an inline comment. `/** Force parkingCost to null … */` on a private method that says what its body says ⇒ delete. |
| **Work-item key or issue link** — `ERP-587`, `CRMDEV-7212`, `BON-516`, a tracker URL | Strip the tag, keep the sentence. Blame, the commit and the PR carry the link; the tag rots when the ticket closes. A comment that is only a tag ⇒ delete. |
| **Spec or invariant ID the repo defines** — `FR-PAY-03`, `NFR-PH-01`, `INV-11`, `ADR-7` | A name, not a tag: it points at a rule that lives in this repo and never closes. Test: grep the ID — defined in a file of this repo (requirements doc, ADR index, bench corpus) ⇒ name, keep, write it the way the spec does; found only in a tracker ⇒ tag, strip. |
| **Literal in prose** — `// 30 seconds` on `30000` | Put the unit in the name (`TIMEOUT_MS = 30_000`), drop the comment. Keep only a *why* the number cannot carry (`// 30s — upstream p99 is 22s`). |
| **Tool directive** — `eslint-disable*`, `@ts-expect-error`, `@ts-ignore`, `prettier-ignore`, `biome-ignore`, `istanbul ignore`, `c8 ignore`, `# noqa`, `# type: ignore`, `# pragma: no cover`, `// nolint`, `# shellcheck disable` | Code, not commentary. Never delete. Keep its trailing reason; add one when the reason is not obvious. |
| **`TODO` / `FIXME` / `HACK`** | Keep when it names a real gap; strip its ticket tag in passing. A bare marker (`// TODO`) ⇒ delete. |
| **Commented-out code** | Delete. Git remembers; "kept for reference" is the rot. |
| **Block label** — `// Amenity/parking filters.` above self-evident code | Delete, or make the block a function whose name carries it ([[readable-code-structure]]). |
| **Named algorithm or idiom** — `// Luhn check`, `// x & (x-1) clears the lowest set bit` | Keep — the name is a *why* for a dense body. Better: unpack the code until the label is redundant, then drop it. |
| **Author, date, AI signature** | Delete. Blame carries author and date; no AI attribution goes in code ([[authorship-conventions]]). |
| **License / copyright header** | Out of scope. Tooling-enforced; never touch on a cleanup pass. |
| **Generated file** — `schema.d.ts`, codegen output | Never hand-edit its comments; fix the source and regenerate. |

Anything the table does not name: *does this tell me something I could not get by reading the code?* Yes ⇒ keep. No ⇒ delete.

## Why

A comment is a liability: it goes stale, it adds noise, and it makes the reader stop to check whether the prose still matches the code. It earns its keep only by carrying what the code cannot. A doc comment on a public surface is a different genre — its reader has not opened the body and may be a tool — so it is judged as documentation, by whether it states the contract, never by the litmus.

## Examples

### Delete — restates the code

```ts
// Tri-state filter for a yes/no flag: no filter, only-yes, only-no.
export type TriStateFilter = "all" | "yes" | "no";   // the union already says this
```

```ts
/** Force parkingCost to null unless parking is yes/option. */
private normalizeParkingCost(parking, parkingCost) {   // private; name + body say this
  return this.parkingHasCost(parking) ? (parkingCost ?? null) : null;
}
```

```rust
// Iterate the nodes and push each id.
for node in &graph.nodes { ids.push(node.id); }
```

### Keep — says what the code cannot

```ts
// The service is the boundary for the MCP path, which bypasses the DTO's
// class-validator checks — so re-validate here.
private validateParking(parking, parkingCost) { … }
```

```ts
// Plain ADD COLUMN — instant lock, online-safe. All nullable so existing rows
// survive without a backfill (NULL = unanswered).
```

```rust
// Retry once: `serve` rewrites the index file atomically, and a reader racing
// the rename sees ENOENT for one tick.
```

### Doc comment on a public surface — keep, state the contract

```rust
/// Money in grosze. Never a float: callers sum these across a day, and a
/// drift of one grosz fails the ledger check.
pub struct Money(pub i64);
```

```python
def load_index(path: Path) -> Index:
    """Read the on-disk index. Raises IndexStale when the graph is newer than
    the index; the caller decides whether to rebuild."""
```

```ts
/** Debounced: the last call inside `windowMs` wins; earlier calls resolve with its result. */
export function coalesce<T>(fn: () => Promise<T>, windowMs: number) { … }
```

A public doc comment that only repeats the signature (`/** Returns the user by id. */` on `getUserById`) is the private case in public clothes: rewrite it to say what the caller cannot see — an unknown id, a network hop, a cache — never strip it.

### Work-item key vs spec ID

```ts
// before
/** Whether the bathroom is shared (ERP-587). NULL on legacy rows = unanswered. */
// after — tag gone, invariant kept
/** Whether the bathroom is shared. NULL on legacy rows = unanswered. */
```

```ts
// before
// takes the stale lock and re-sends from the top (CRMDEV-7305)
// after
// takes the stale lock and re-sends from the top
```

```ts
// keep — FR-PAY-03 and INV-11 are defined in this repo's requirements corpus
/** Money in grosze; see FR-PAY-03 and INV-11 for the rounding rule. */
```

Where a work-item key does belong: test titles (`it("persists the ERP-587 fields", …)`), commit messages, PR descriptions, and a migration or ADR header when the ticket is genuinely the only record of *why* — rare; prefer summarising the reason.

## How to apply

- Remove whole comment lines and let the formatter settle spacing; never leave a dangling `//` or an empty `/** */`.
- Strip work-item tags in passing whenever you edit a line that carries one.
- On "remove excess comments" / "keep only important": aggressive — an inline comment survives only by the litmus; a doc comment on a public surface survives by default and is rewritten, not removed.
- Do not add restate-comments while editing; a comment that introduces the next block is a function name waiting to happen ([[readable-code-structure]]).
- Any language, any syntax — YAML, CI and shell files included.
