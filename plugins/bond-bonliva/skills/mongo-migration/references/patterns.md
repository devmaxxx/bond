# Migration patterns

## Batched, idempotent, dry-runnable template (MikroORM migrations-mongodb)

Adapt names to the repo; keep the shape.

```ts
import { Migration } from "@mikro-orm/migrations-mongodb";
import { AnyBulkWriteOperation, Document } from "mongodb";

const BATCH_SIZE = 500;
const DRY_RUN_LIMIT = 10;

/**
 * Why this migration exists and which collections/fields it touches.
 *
 * Verify (0 when done):
 *   db.crm_bookings.countDocuments({ contractType: { $exists: false }, externalRef: { $exists: true } })
 */
export class Migration20261001BackfillContractType extends Migration {
  async up() {
    const dryRun = process.env.MIGRATION_DRY_RUN === "true";
    const bookings = this.getCollection("crm_bookings");
    const filter = { contractType: { $exists: false }, externalRef: { $exists: true } };

    let ops: AnyBulkWriteOperation<Document>[] = [];
    let scanned = 0;
    let modified = 0;
    let skipped = 0;

    const flush = async () => {
      if (ops.length === 0 || dryRun) {
        ops = [];
        return;
      }
      const result = await bookings.bulkWrite(ops, { ordered: false });
      modified += result.modifiedCount;
      ops = [];
    };

    const cursor = bookings.find(filter, {
      projection: { _id: 1, contractType: 1, groupId: 1 },
      batchSize: BATCH_SIZE,
      limit: dryRun ? DRY_RUN_LIMIT : 0,
    });

    for await (const doc of cursor) {
      scanned++;
      const next = resolveContractType(doc);
      if (next === null) {
        skipped++;
        console.log(`SKIP ${doc._id}: no contract type derivable`);
        continue;
      }
      if (dryRun) {
        console.log(`DRY ${doc._id}: ${doc.contractType ?? "∅"} → ${next}`);
      }
      ops.push({
        updateOne: {
          // Re-checking the filter keeps a concurrent writer's value.
          filter: { _id: doc._id, contractType: { $exists: false } },
          update: { $set: { contractType: next } },
        },
      });
      if (ops.length >= BATCH_SIZE) {
        await flush();
      }
    }
    await flush();

    console.log(
      `scanned=${scanned} modified=${modified} skipped=${skipped}${dryRun ? " (dry run, nothing written)" : ""}`,
    );
  }
}
```

## Lookups without N+1

Collect the foreign ids of a batch, fetch them once with `$in`, keep them in
a `Map<string, T>` keyed by `_id.toHexString()`. A lookup per document inside
the loop is the usual reason a migration is "too long".

## Renames and splits

- Rename: `$rename` in one `updateMany` when no computation is needed —
  still filtered on the old field existing, so a rerun is a no-op.
- Split one field into two: set both new fields, then `$unset` the old one in
  the same update only once the app reads the new fields.

## Config / seed documents

`updateOne({ key }, { $setOnInsert: {...} }, { upsert: true })` — inserts
once, never overwrites a value someone edited since.

## Indexes

- `createIndex` with an explicit `name`; identical to the entity's `@Index`
  (keys, partial filter, unique) so `ensureIndexes()` at boot does nothing.
- Dropping: `dropIndex(name)` guarded by `indexExists` — a rerun must not throw.
- **Atlas Search / vector indexes**: `createSearchIndex` needs Atlas and the
  right tier; it is often created by hand in the Atlas UI. Either way, write
  it in the release notes: cluster, database, collection, index name, full
  JSON definition, and whether it must exist before the deploy (queries using
  `$search` fail without it).

## Verification queries

Phrase each as "documents still in the old state", so 0 means done:

```js
db.crm_bookings.countDocuments({ contractType: { $exists: false }, externalRef: { $exists: true } })
db.consultants.countDocuments({ "gdpr.jobMailing": { $exists: true } })   // after a split
db.crm_bookings.getIndexes().filter(i => i.name === "demandSource_1_week_1").length === 0  // after a drop
```

## Rerunning one migration

Runners with an interactive mode (`-i`) can rerun an executed migration or
drop it from the executed list; use that on staging, not a second migration.
