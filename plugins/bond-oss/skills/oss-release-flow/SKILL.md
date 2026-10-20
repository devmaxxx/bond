---
name: oss-release-flow
description: Use when planning, cutting or finishing a release of an open-source library or CLI — choosing the next version, writing the CHANGELOG or release notes, a release PR, tagging `vX.Y.Z`, a milestone, "what's left before release", "bump", "merge and release when green", "dont publish", "one release". Holds the order of a release, the consent lines, and the checks that each cost a run once.
---

# OSS release flow

## Contract

Two separate consents: **merge**, and **tag** — which is the publish, since CI
publishes on the tag. "Bump and merge, dont publish" stops before the tag;
"merge and release when green" grants both; a bare "release" grants the tag.
Never infer the tag from the merge. One version per release: fold late fixes into the untagged
version rather than cutting two ("one release").

## Order

1. **Scope** — the milestone `X.Y.Z`: every open issue in it is fixed, moved or
   closed with evidence; "what's left before release" lists the rest and the
   steps only the user can do. Planning detail: references/planning.md.
2. **Gate** — the repo's lint/typecheck/test/build green on `main`, a review
   (`/code-review high`) over everything since the last tag, and for a
   performance tool a bench against the previous tag.
3. **Dry run** (first release, or a changed workflow) — `gh workflow run
   release.yml --ref <branch>`; read the packed file list.
4. **Release PR** `chore/release-X.Y.Z` — bump every version source (`package.json`
   + lockfile; `Cargo.toml` + `Cargo.lock`; docs status lines — `grep -rn '"<old>"'`),
   move `## [Unreleased]` to `## [X.Y.Z] — YYYY-MM-DD`, title
   `chore(release): X.Y.Z` (or `Release X.Y.Z: <headline>`), `Closes #n` lines.
5. **Merge** on green, squash with a **written** subject and body.
6. **Tag** the merge SHA on `main`, annotated, from the `OWNER` account:
   `git tag -a vX.Y.Z -m "<name> X.Y.Z" <sha> && git push origin vX.Y.Z`. Never move
   or reuse a tag.
7. **Watch exactly one run** — hand it to a background agent (`bond:pr-watch`
   style poll on `gh run list --workflow release.yml`); a red publish goes to
   the `npm-publishing` traps table first. A re-run reuses the commit, so it
   only helps a cause outside the repo; a cause in the repo ships as the next
   patch.
8. **Verify** — `npm-publishing` "After every publish"; GitHub release exists
   with the notes; close the milestone.

## Versions

SemVer. `0.x`: minor for features and breaking changes, patch for fixes and
docs. `1.0.0` when the API is promised, with an "Upgrading from 0.x" section.
A README-only change still needs a patch to reach npmjs.com. Notes and
CHANGELOG format: references/notes.md.
