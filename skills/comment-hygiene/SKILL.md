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

Comment the *why*, never the *what*. An inline comment survives only by saying what the code cannot; one that restates a name, a type, a literal or the next line goes. A doc comment on a public surface is API documentation: keep it and make it state the contract. A tool directive (`eslint-disable*`, `@ts-expect-error`, `# noqa`, `// nolint`, …) is code — never delete it. Commented-out code, a bare `TODO`, a block label, an author, date or AI signature: delete. Strip a work-item key (`ERP-587`, `CRMDEV-7212`) and keep the sentence; a spec or invariant ID this repo defines (`FR-PAY-03`, `INV-11`) is a name, keep it. License headers and generated files are out of scope.

Anything the table does not name: *does this tell me something I could not get by reading the code?* Yes ⇒ keep. No ⇒ delete.

Details: references/rules-table.md — read for the row that covers the comment in front of you.

Details: references/examples.md — read when a keep-or-delete call is close, and for why the litmus is what it is.

## How to apply

- Remove whole comment lines and let the formatter settle spacing; never leave a dangling `//` or an empty `/** */`.
- Strip work-item tags in passing whenever you edit a line that carries one.
- On "remove excess comments" / "keep only important": aggressive — an inline comment survives only by the litmus; a doc comment on a public surface survives by default and is rewritten, not removed.
- Do not add restate-comments while editing; a comment that introduces the next block is a function name waiting to happen ([[readable-code-structure]]).
- Any language, any syntax — YAML, CI and shell files included.
