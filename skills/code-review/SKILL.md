---
name: code-review
description: Review checklists for a diff — the traps of each language and framework it touches (TypeScript, React, Vue, Angular, Svelte, NestJS, Python, Django, FastAPI, Go, Rust, Java, Kotlin, Swift, C#, PHP, Ruby, C/C++, Dart, CSS, Qt, Zig) and OWASP-derived security references per vulnerability class, with the rule for when a pattern is a finding. Loaded by bond's reviewers (pr-review, security-review, track-reviewer, vertical-horizontal-review); not Claude Code's built-in /code-review command.
allowed-tools: Read Grep Glob
---

# Code review

Two vendored corpora, read on demand. Severity, verification and the report
stay the caller's; neither guide's own report format applies.

## Stacks — `stacks/`

For each language and framework the diff touches, open its guide in
`stacks/reference/` (`typescript.md`, `react.md`, `python.md`, … — the full
list is under "Language-Specific Guides" in `stacks/GUIDE.md`) and run its
**Review Checklist** against the changed hunks. Read a cross-cutting guide
only when the diff calls for it: `common-bugs-checklist.md`,
`performance-review-guide.md`, `architecture-review-guide.md`, and
`cross-cutting/` for N+1 queries, async and concurrency, error handling.
Never run `stacks/scripts/`.

## Security — `security/`

1. **Class.** For each vulnerability class the diff touches, read
   `security/references/<class>.md`: `injection`, `xss`, `authentication`,
   `authorization`, `cryptography`, `deserialization`, `file-security`,
   `ssrf`, `csrf`, `data-protection`, `api-security`, `business-logic`,
   `misconfiguration`, `error-handling`, `supply-chain`, `logging`,
   `modern-threats`.
2. **Language.** `security/languages/python.md`, or `javascript.md` for JS
   and TS; `security/infrastructure/docker.md` when a Dockerfile or compose
   file changed.
3. **When it is a finding.** Read "Do Not Flag" and "Check Context First" in
   `security/GUIDE.md` before reporting. A pattern is a finding only once
   tracing shows attacker-controlled input reaching it; server-controlled
   values and patterns the framework already neutralises are not. Report high
   confidence only: verify a medium-confidence candidate or drop it.

## Licenses

`stacks/` is MIT (awesome-skills). `security/` is CC BY-SA 4.0, derived from
the OWASP Cheat Sheet Series. Each keeps its own `LICENSE`; see `NOTICE.md`.
