# How to apply

- **Match the project's test framework and layout.** Use the same runner
  (`describe` / `it` / `expect` in vitest/jest, etc.) and co-locate specs the way
  the existing tests do (`<unit>.test.ts` next to the source, or the repo's
  convention).
- **Fakes over deep mocks.** A small hand-rolled fake that behaves like the real
  collaborator (a repo whose `save()` echoes the entity) lets you assert
  outcomes; a mock that records calls pushes you toward change-detector
  assertions. Prefer the fake.
- **Use the codebase's value types in expectations** — integer minor units for
  money (`bigint` / minor-unit literals, never floats), the project's calendar
  utility for day math rather than hand-rolled `Date` arithmetic.
- **Keep fakes honest about isolation** — when you fake a scoped/tenant
  repository, don't let it return rows the real one never would, or you're
  testing a fiction.
- **One rule per `it`**, named as that rule. If an `it` needs "and" in its name,
  it's probably two tests.
- When in doubt about whether a value is _correct_ vs merely _current_ — re-read
  "question suspicious behaviour" above and ask.
