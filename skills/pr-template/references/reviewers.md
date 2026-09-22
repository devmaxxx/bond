# Reviewers

Apply the template's **Reviewers** section: resolve the reviewer list from
`$HOME/.bond/pr-reviewers.json` first, then fall back to the host's own default
reviewers (`mcp__bond-bitbucket__get_effective_default_reviewers` on Bitbucket,
the repo's configured reviewers or `CODEOWNERS` on GitHub). Pass them as the
`reviewers` array on a Bitbucket create call, or as `--reviewer` flags on `gh`.
This applies to manual calls too, not just `/bond:open-pr`.
