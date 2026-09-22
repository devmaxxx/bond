# Rules

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
