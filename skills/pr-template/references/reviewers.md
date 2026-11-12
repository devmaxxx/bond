# Reviewers

Apply the template's **Reviewers** section: the `reviewers` list in the repo's
`.bond/project.json` first, then the repo's configured reviewers or `CODEOWNERS`
on GitHub. Pass them as `--reviewer` flags on `gh pr create`. This applies to
manual calls too, not just `/bond:open-pr`.
