---
name: mongo-migration
description: >-
  Use when writing, updating or reviewing a MongoDB data migration in a Bonliva
  repo's migrator (e.g. apps/*-migrator/src/migrations, MikroORM
  migrations-mongodb) — backfills, field renames/splits, config seeds, index or
  Atlas Search index changes. Covers naming, idempotency, batched bulkWrite,
  logging, a 10-document dry run, the verification query, and release notes.
  Trigger on "create a migration", "backfill", "update the migration", "use
  batches", "migration too slow", "mongo query to check".
---

# Mongo migration

## 1. Find the migrator and its conventions

Locate the migrations dir (`**/migrations/` next to a migrator app) and read
the two newest migrations plus the runner (`main.ts`). Copy, don't invent:
the base class, filename prefix (`YYYYMMDD-` or a 13-digit timestamp — the
dir decides; the new one sorts last), kebab-case name, class name with the
same prefix, the registration list (`migrations.ts`) if the runner has one,
and the dry-run switch (e.g. `MIGRATION_DRY_RUN=true`).

**One migration per branch.** This branch already adds one → update it.

## 2. Write it

- **Idempotent**: the filter selects only documents still needing the change
  (`$exists: false`, `$ne: <target>`), and the update sets deterministic
  values. Running it twice must modify 0 the second time.
- **Batched**: stream a cursor with a projection of only the fields read,
  collect `updateOne` ops, `bulkWrite(ops, { ordered: false })` every ~500,
  flush the tail. No `find().toArray()` over a whole collection; no
  per-document query in the loop — preload lookups into a `Map`.
- **Logged**: scanned / modified / skipped totals at the end; one line per
  skip with the `_id` and reason.
- **Dry run**: with the switch on, process at most **10** documents, write
  nothing, print each `_id` with before → after.
- **Self-contained**: no services, repositories or app helpers — they change
  later and the migration must replay identically. Inline the rule; shared
  enums/constants are fine. JSDoc on the class says why and what it touches.
- Indexes: match the entity's `@Index` spec exactly so boot-time
  `ensureIndexes()` is a no-op.

Template and patterns: references/patterns.md.

## 3. Verification query

Write the mongosh query that counts documents still needing the change —
0 after the run — and put it in the JSDoc and the PR description.

## 4. Release notes

Atlas Search / vector index changes, manual data steps, and anything to run
by hand go in the PR's release notes (the repo's manual-actions mechanism if
it has one): index name, collection, definition, before or after deploy.

## 5. Verify

Dry run against a local or staging copy (never production), show the 10 ids,
then a real run, then the verification query → 0, then run again → 0
modified. Typecheck and tests via `bond:TestRunner`.

## Do NOT

- Add a second migration on a branch that has one; change a merged one.
- Call app services or business logic from a migration.
- Run against production yourself.
