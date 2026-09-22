# Why

A comment is a liability: it goes stale, it adds noise, and it makes the reader stop to check whether the prose still matches the code. It earns its keep only by carrying what the code cannot. A doc comment on a public surface is a different genre — its reader has not opened the body and may be a tool — so it is judged as documentation, by whether it states the contract, never by the litmus.

# Examples

## Delete — restates the code

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

## Keep — says what the code cannot

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

## Doc comment on a public surface — keep, state the contract

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

## Work-item key vs spec ID

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
