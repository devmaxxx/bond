---
description: Release an open-source library — milestone check, release PR with the bump and CHANGELOG, merge on green, tag, one watched publish run, npm and GitHub release verified; bootstraps npm trusted publishing on a first release
---

# /bond-oss:release

**Ask first.** Before the first write, one `AskUserQuestion` with every decision `$ARGUMENTS` leaves open — none when they settle it all (standing rule *Commands ask first*).

Usage: `/bond-oss:release [patch|minor|major|X.Y.Z|X.Y.Z-rc.N] [--no-publish] [--dry-run] [path]`

Questions this command can need — all in the one ask: the **version** (offer
the bump the commits since the last tag imply, `feat` ⇒ minor, `fix`/docs ⇒
patch, `!` ⇒ major, 0.x rules in `oss-release-flow`), and the **consents**,
each its own option: merge the release PR on green · push the tag (CI
publishes). `--no-publish` stops after the merge; `--dry-run` only dispatches
`release.yml` on the branch.

## Steps

### 1. Preconditions

Load `oss-release-flow` and `npm-publishing`; resolve `shared/oss-profile.md`.
On `main`, up to date (`git pull --ff-only`), tree clean. `release.yml` present
and shaped like the template (else run `/bond-oss:audit --only ci` first).
`gh auth status --active` names `OWNER`.

### 2. First release of the name?

`npm view <name> versions --json --prefer-online`. E404 ⇒ run
`npm-publishing` references/bootstrap.md now: print the placeholder command for
the user to run with `!` and their OTP, poll until it lists, then
`npm trust github … --allow-publish` and show `npm trust list`. Do not tag
until trust lists publish permission.

### 3. Scope and gate

Milestone `X.Y.Z` (if the repo uses milestones): open issues listed, each fixed,
moved or closed with evidence. Local gates of `oss-lib-stack`; `/code-review
high` over `vPREV..HEAD` when no review ran on those commits.

### 4. Release PR

Branch `chore/release-X.Y.Z`: bump every version source, CHANGELOG
`## [Unreleased]` → `## [X.Y.Z] — <today>` + compare link, docs status lines.
`/bond:open-pr`; hand CI to `bond:pr-watch`.

### 5. Merge (consent) and tag (consent)

Squash with a written subject/body (`chore(release): X.Y.Z (#N)`), check the
merge commit for skip markers, then `git tag -a vX.Y.Z -m "<name> X.Y.Z" <merge-sha>`
and push the tag. `--no-publish` ends here with the tag command printed.

### 6. Watch one run

A background agent polls `gh run list --workflow release.yml --event push -L 1`
for the tag's run (up to 5 min to appear; then `gh workflow run release.yml
--ref vX.Y.Z` once), watches it to the end, and returns the verdict and the
failing step's log tail. Red ⇒ match `npm-publishing` references/traps.md,
fix the cause, `gh run rerun <id> --failed` — never a new version for a re-run.

### 7. Verify and close

`npm-publishing` "After every publish" (registry poll, clean install, npm page),
`gh release view vX.Y.Z`, close the milestone. First release: remind the user to
set "Require 2FA and disallow tokens" on npmjs.com.

### 8. Report

`<name> X.Y.Z` published (npm URL, GitHub release URL), the notes, the run, and
anything skipped with the reason.
