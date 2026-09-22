# Examples — assert the contract from the outside

## Example 1 — tautology vs real assertion

The code under test:

```ts
function stayTotal(nightlyMinor: bigint, nights: number): bigint {
  return nightlyMinor * BigInt(nights);
}
```

Change-detector (worthless) — re-derives the expected value with the **same
formula** the code uses, so it can never catch a wrong formula:

```ts
it('computes the total', () => {
  const nightly = 1000n;
  const nights = 3;
  expect(stayTotal(nightly, nights)).toBe(nightly * BigInt(nights)); // tautology
});
```

Behavioural — states the expected number independently, so a broken formula
fails:

```ts
it('totals nightly rate × nights in minor units', () => {
  // 3 nights at 10.00 → 30.00
  expect(stayTotal(1000n, 3)).toBe(3000n);
});

it('a zero-night stay costs nothing', () => {
  expect(stayTotal(1000n, 0)).toBe(0n);
});
```

The literal `3000n` is the contract written by hand. The tautology version would
stay green even if `stayTotal` started _adding_ instead of multiplying.

## Example 2 — assert the outcome, not the call

Over-mocking turns a test into a mirror of the implementation's call sequence:

```ts
it('saves the reservation', async () => {
  await service.create(DTO);
  expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ ... })); // brittle
});
```

This breaks if you rename a field, batch the save, or move persistence — none of
which change what the caller gets. Prefer asserting the observable result:

```ts
it('returns the persisted reservation with its generated id', async () => {
  const created = await service.create(DTO);
  expect(created.id).toBeDefined();
  expect(created.checkIn).toBe('2026-09-01');
});

it('maps a double-booking to a 409 Conflict', async () => {
  // the DB constraint is the hard guarantee; the service maps its violation to
  // ConflictException — that mapping is the contract.
  await expect(service.create(OVERLAPPING_DTO)).rejects.toBeInstanceOf(ConflictException);
});
```

`toHaveBeenCalledWith` is justified only when the _call itself is the observable
effect_ — e.g. an email was dispatched, a job was enqueued, an audit row was
written. There, assert the effect (a mail was sent to the guest) at the coarsest
level that still proves the behaviour, not every argument the impl happens to
pass.

## Example 3 — test the rule, name the rule

Each `it` should read as a sentence stating one rule of the contract. The name is
documentation; if it just says `it('works')` the test teaches nothing.

```ts
describe('isExclusionViolation', () => {
  it('treats half-open ranges as non-overlapping at the boundary', () => {
    // checkout day == next guest's checkin day is allowed
    ...
  });
});
```
