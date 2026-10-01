---
description: Publish a markdown doc (plan, investigation, runbook) to Outline, tracking its doc id in frontmatter so re-publishing updates it — and never overwrites edits made on Outline
---

# /bond-bonliva:publish-doc

> **Needs the `bond-outline` MCP** (installed by `/bond-bonliva:setup-plugin`).
> Its tools missing ⇒ say so, point at `setup-plugin`, and stop.

Push a local markdown file to Outline. The first publish creates the Outline doc;
every later publish updates **the same doc**, because the file remembers it in
its frontmatter:

```yaml
---
outline_id: 0eea34eb-63d2-478c-98bb-0955af39a0b8
outline_url: https://docs.bonliva.dev/doc/taxation-crm-integration-tcGOwVJxXg
outline_hash: 3f9a1c0b7d2e4a65
---
```

`outline_hash` is the hash of the doc's text **as Outline last returned it**.
Outline is the source of truth once published — people edit it there — so a
remote hash that no longer matches means someone changed the doc since your last
publish, and their edits must not be overwritten blind.

## Usage

```
/bond-bonliva:publish-doc <path> [--collection <name>] [--parent <doc>] [--audience non-tech] [--yes]
```

Examples:
- `/bond-bonliva:publish-doc docs/plans/ERP-142-export.md --collection ERP`
- `/bond-bonliva:publish-doc docs/runbooks/scheduled-jobs.md` — already has `outline_id`: updates it.
- `/bond-bonliva:publish-doc docs/investigations/hatchet-timeouts.md --audience non-tech`

## Arguments

- `<path>` — the markdown file. Missing or not found ⇒ ask; never pick one.
- `--collection <name>` — first publish only; matched against
  `mcp__bond-outline__list_collections` (case-insensitive). Ignored when the file
  already has `outline_id` — the doc's collection is set.
- `--parent <doc>` — first publish only: an Outline URL, a `urlId`, or a title
  (resolved with `search_documents`). The new doc nests under it.
- `--audience non-tech` — publish a rewritten version for product / QA readers
  (Step 2) instead of the file as written.
- `--yes` — skip the preview confirmation on first publish. Never skips the
  remote-edit question in Step 5.

## Steps

### 1. Read the file

Split frontmatter from body. Keep every frontmatter key — only the three
`outline_*` keys are this command's.

- **Title** — the body's first `# H1`, removed from the body (Outline renders the
  title itself, so keeping it duplicates the heading); no H1 ⇒ the filename in
  Title Case.
- **Links** — a relative link to another local doc that has its own
  `outline_url` becomes that URL; other relative links to repo files are left as
  they are and listed in the report, since they will not resolve on Outline.

### 2. Non-tech rewrite (`--audience non-tech`)

Rewrite the body for someone who uses the product but not the code: what
changed or went wrong, who is affected, what they will see, what they need to
do, what is still open. Drop code, file paths, stack traces, identifiers and
internal names; keep dates, ticket keys and screen names.

Write it to a sibling file `<name>.summary.md` — when that file exists, keep its
`outline_*` frontmatter and replace only the body, or the next publish would
create a second Outline doc — and run the rest of this command
on **that** file — it gets its own `outline_*` frontmatter and its own Outline
doc (default parent: the technical doc, when that one is published), so the two
versions never overwrite each other.

### 3. Hash rule

```sh
printf '%s' "$TEXT" | sed -e 's/[[:space:]]*$//' | shasum -a 256 | cut -c1-16
```

Always hash **the text Outline returns** (`get_document` / `create_document` /
`update_document` → `text`), never the local file: Outline normalises markdown
on save, so a local hash would differ every time and flag phantom edits.

### 4. First publish (no `outline_id`)

1. **Collection** — `--collection`, else the collection of `--parent`, else list
   the collections and ask. There is no safe default for where a doc lives.
2. **Parent** — resolve `--parent` to a document id; ambiguous title ⇒ show the
   matches and ask.
3. **Duplicate check** — `search_documents` with the title. An exact-title doc
   in the same collection ⇒ ask: adopt it (store its id and go to Step 5) or
   create a new one.
4. **Preview** — show title, collection, parent and the full body that will be
   published. Confirm with `AskUserQuestion` unless `--yes`.
5. `mcp__bond-outline__create_document({ title, text, collectionId,
   parentDocumentId?, publish: true })`.
6. Write `outline_id`, `outline_url` (`$OUTLINE_API_URL` without `/api`, + the
   response's `url`) and `outline_hash` into the frontmatter.

### 5. Re-publish (`outline_id` present)

1. `mcp__bond-outline__get_document({ id: outline_id })`. Not found or archived ⇒
   ask: recreate (clear the `outline_*` keys and run Step 4) or stop.
2. Hash the remote `text` → `REMOTE`.
3. **`REMOTE` ≠ `outline_hash`** ⇒ the doc was edited on Outline since your last
   publish. Show a unified diff of remote text vs. the local body and ask:
   - **Pull** — replace the local body with the remote text, store `REMOTE` as
     the new `outline_hash`; publish nothing.
   - **Merge** — fold the remote edits into the local body, show the result,
     then update with it.
   - **Overwrite** — publish the local body, discarding the remote edits.
   - **Abort.**
4. **`REMOTE` = `outline_hash`** ⇒ nobody touched it. Local body and title equal to the
   remote text and title (after the same normalisation) ⇒ say *already up to date* and
   stop. Otherwise show a short diff and update — no question needed, this is
   the routine path.
5. `mcp__bond-outline__update_document({ documentId: outline_id, title, text })`.
6. Store the new `outline_hash` from the response's `text`.

### 6. Report

The Outline URL, created vs. updated, the new hash, any links left unresolved,
and that the frontmatter changed — commit it with the doc, or the next publish
from another checkout will not know the doc exists.

## Do NOT

- Do not create a second Outline doc for a file that already has `outline_id`.
- Do not overwrite a doc that was edited on Outline without showing the diff and
  asking.
- Do not hash the local file to detect remote edits — hash what Outline returns.
- Do not publish a first version without showing it (unless `--yes`).
- Do not drop or reorder frontmatter keys this command does not own.
- Do not put secrets, tokens or customer personal data on Outline — strip them
  and say what was removed.
