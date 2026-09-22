# Every host, every path

The rule is not Bitbucket-specific. It binds equally on:

- **GitHub** — `gh pr create`. Pass the built description with `--body-file`
  (a heredoc written to a temp file) or `--body`; never `--fill`, which builds
  the body out of commit subjects and skips the template entirely.
- **Bitbucket** — `mcp__bond-bitbucket__create_draft_pull_request` (or
  `create_pull_request` outside Bonliva), whether called by `/bond:open-pr` or
  by hand.
- **Commands** — `/bond:open-pr`, and the Ship + PR step that `/bond:implement`
  and `/bond-bonliva:fix-qa` run.

Resolve the host from `git remote get-url origin` before building the call.
