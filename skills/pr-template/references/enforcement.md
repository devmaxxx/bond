# This is enforced, not advisory

`hooks/check-pr.mjs` runs as a `PreToolUse` hook on `gh pr create` and on the
Bitbucket MCP create calls. It blocks a description missing `## Summary` or
`## Test plan`, a ticket-bearing PR with no `## Jira` section, a non-draft
create where `DRAFT` resolves, and `--fill`. `hooks/check-commit.mjs` separately blocks AI breadcrumbs
in `gh pr …`. Fix the call rather than working around the hook.
