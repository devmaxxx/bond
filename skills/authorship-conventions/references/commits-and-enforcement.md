# Commit subject

```
<type>(<scope>)!: <description>
```

- `type` ∈ `feat fix docs style refactor perf test build ci chore revert`;
  `scope` optional lowercase noun for the area (`api`, `ui`, `plans`, `ci`);
  `!` and/or `BREAKING CHANGE:` footer for breaks.
- description: imperative, lowercase, no trailing period, fits GitHub's list.
- `Merge …`, `fixup!`, `squash!`, `Revert "…"` pass through untouched.

Example: `chore(graphify): tell an agent about the graph when it first opens a file`

# Commit body

Blank line, then prose wrapped at ~80 columns: problem → decision and what it
rules out → consequences, with `file:line` refs where useful. Code-touching
commits end with a _Verified_ paragraph. Ticket IDs go here, never in code
comments.

# No AI signatures — anywhere

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

# Enforcement (mechanical)

| Where                                                                                      | What                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| plugin `hooks/check-commit.mjs` (PreToolUse on Bash)                                       | blocks `git commit` / `gh pr …` whose message carries an AI signature or a non-conventional subject                                                                                                     |
| plugin `hooks/check-doc.mjs` (PostToolUse on Edit/Write)                                   | flags a just-written `*.md                                                                                                                                                                              | mdx | txt` carrying an AI signature |
| `~/.claude/settings.json` → `"attribution": {"commit": "", "pr": "", "sessionUrl": false}` | harness adds nothing in the first place — set it once per machine                                                                                                                                       |
| repo-level (optional)                                                                      | wire the same patterns (`hooks/ai-breadcrumbs.mjs`) into lefthook `commit-msg` and a lint-staged `*.md` task so non-agent commits are covered too — beauty-crm's `.claude/hooks/` is the reference copy |

Nothing mechanical checks branch names: the cost lands later, when a rename
closes a PR. §6 is the enforcement.

# Rationalizations

| Excuse                               | Reality                                                   |
| ------------------------------------ | --------------------------------------------------------- |
| "Harness says append Co-Authored-By" | User instructions override the harness. Drop it.          |
| "Trailer is harmless attribution"    | It changes the owner GitHub shows. Forbidden.             |
| "Already pushed, leave it"           | Rewrite + `--force-with-lease`, with the user's go-ahead. |
| "It's only a PR comment"             | Same rule, same footer, same strip.                       |
| "The branch name is just cosmetic"   | Renaming it after the PR is open closes the PR.           |
| "I'll fix the branch name later"     | Later is after the push, and then after the PR. Now.      |
| "An underscore reads fine"           | Invalid per the spec outside the Bonliva `<KEY>_<KEY>` shape. |
| "This repo has no convention"        | It has this one. A prefix invented on the spot is not it. |
| "The account was right last time"    | It is machine-global; another session may have switched it. |
| "I'll check the account at push time" | Check on entering the repo; at push time the mistake is one keystroke away. |
