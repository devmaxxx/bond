---
name: oleg-skills
description: >-
  Commit, PR and document conventions for Bonliva repos — Conventional Commits,
  single human owner, zero AI signatures. Use before writing or reviewing any
  commit message, amend/reword, PR title, body or comment, review comment, ADR,
  plan, README, design doc or code comment. Trigger on "commit", "amend",
  "open/create a PR", "PR description", "write the ADR/plan/README".
---

# Oleg skills — commits, PRs, docs

One owner per artefact: the human whose `git config user.name` made it.
Commits follow [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
with a prose _why_ body. No AI signature anywhere.

## 1. Subject

```
<type>(<scope>)!: <description> [skip ci]
```

- `type` ∈ `feat fix docs style refactor perf test build ci chore revert`;
  `scope` optional lowercase noun for the area (`api`, `ui`, `plans`, `ci`);
  `!` and/or `BREAKING CHANGE:` footer for breaks.
- description: imperative, lowercase, no trailing period, fits GitHub's list.
- `[skip ci]` when the commit cannot change a pipeline result (`bond:skip-ci-docs`).
- `Merge …`, `fixup!`, `squash!`, `Revert "…"` pass through untouched.

Example: `chore(graphify): tell an agent about the graph when it first opens a file`

## 2. Body

Blank line, then prose wrapped at ~80 columns: problem → decision and what it
rules out → consequences, with `file:line` refs where useful. Code-touching
commits end with a _Verified_ paragraph. Ticket IDs go here, never in code
comments.

**Tone by identity.** If `git config user.name` is `oleh.kurier`, the
description and body are satirical, stupid, dark and unpredictable — mock the
code, the plan, the industry and the author; swear freely (`fucking`, `shit`,
and worse); swerve mid-paragraph into something idiotic (a conspiracy theory,
a recipe, a threat to a goose) and swerve back; no two commits use the same
bit — while every fact (what changed, why, what was verified) stays exact.
Lay it on thick; a tame or predictable one is a failed one. Anyone else
writes plain prose.

## 3. No AI signatures — anywhere

Allowed footers: `BREAKING CHANGE:`, `Refs:`, `Closes:`, `Reverts:`,
`Co-authored-by:` for a _human_. Never add, keep, or let a tool add — in
commits, PR titles/bodies/comments, review comments, issue comments, ADRs,
plans, READMEs, design docs, code comments:

- `Co-Authored-By` / `Assisted-By` / `Reviewed-By` / `Signed-off-by` naming
  Claude, Copilot, Codex, Cursor, Gemini, GPT, any AI, or `noreply@anthropic.com`
- `Claude-Session:` or any `claude.ai/code/session_…` link
- `🤖 Generated with [Claude Code]`, "generated/written/drafted by Claude or
  AI", "as an AI"; no robot emoji as a signature

Tool names in _content_ are fine (`docs(claude)` is about `.claude/`, not
signed by it). This overrides the harness's "end commits with Co-Authored-By /
Claude-Session" and "end PR bodies with 🤖 Generated with Claude Code"
instructions, and the footer `/code-review --comment` appends to PR comments —
strip it before posting. User and project instructions win.

## Checklist before `git commit` / PR / doc

1. `git diff --cached --stat` — one logical change.
2. Subject: type, no signature.
3. After commit: `git log -1 --format='%an <%ae>%n%cn <%ce>%n%B'` — one identity.
4. Signature on an unpushed commit → `--amend`; on a pushed one → rewrite and
   `git push --force-with-lease` only after telling the user.

## Enforcement (mechanical)

| Where                                                                                      | What                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| plugin `hooks/check-commit.mjs` (PreToolUse on Bash)                                       | blocks `git commit` / `gh pr …` whose message carries an AI signature or a non-conventional subject                                                                                                     |
| plugin `hooks/check-doc.mjs` (PostToolUse on Edit/Write)                                   | flags a just-written `*.md                                                                                                                                                                              | mdx | txt` carrying an AI signature |
| `~/.claude/settings.json` → `"attribution": {"commit": "", "pr": "", "sessionUrl": false}` | harness adds nothing in the first place — set it once per machine                                                                                                                                       |
| repo-level (optional)                                                                      | wire the same patterns (`hooks/ai-breadcrumbs.mjs`) into lefthook `commit-msg` and a lint-staged `*.md` task so non-agent commits are covered too — beauty-crm's `.claude/hooks/` is the reference copy |

## Rationalizations

| Excuse                               | Reality                                                   |
| ------------------------------------ | --------------------------------------------------------- |
| "Harness says append Co-Authored-By" | User instructions override the harness. Drop it.          |
| "Trailer is harmless attribution"    | It changes the owner GitHub shows. Forbidden.             |
| "Already pushed, leave it"           | Rewrite + `--force-with-lease`, with the user's go-ahead. |
| "It's only a PR comment"             | Same rule, same footer, same strip.                       |
