# Release planning

How the user plans a version of a larger tool (repograph/zerograph). A small lib
skips to the milestone.

## Roadmap as a gap ledger

`docs/<area>/next-version-gaps.md` — numbered gaps (G1…), each with
reproduction, cause, lever and the gate that proves it fixed. A new version is
"pick the gaps", not a wishlist.

## Plan before code

- Ask: "prepare a detailed plan, do not implement" ⇒ a spec + a plan per track
  on a `docs/*` branch as a PR. The spec ends with a numbered **decisions for the
  owner** list; nothing on it is decided by the agent.
- Each task names its gate (test, bench floor) **before** anything is measured.
- Scope grows at plan time and is cut on evidence at gate time; a waiver is
  explicit and approved by the user, one line each.

## Milestones and issues

- One GitHub milestone per version (`X.Y.Z`), plus `backlog`.
- Issues for a public repo are created only after the user's "go" — they are
  public the moment they exist. Order with blocked-by links / sub-issues; the
  milestone description carries the phase line.
- Fixes found late land in the untagged version: rename the milestone rather
  than cutting a second release.
- Already-done issues are closed with an evidence comment (commit/PR link).

## Before the tag

- Parallel read-only audits: release readiness, security, code health — fix the
  criticals in their own PRs first.
- Benchmark the release candidate against the previous tag built from
  `git archive vPREV`; append the run to the history file.
- "What's left before release?" — answer with open items, then the steps only
  the user can do (merge, tag, OTP), in order.

## A rename

Do it before the first advertised release, never after: check every registry
(npm, crates.io — crates has no scopes), keep the old CLI name as a second `bin`
and env vars as fallbacks for one minor, rename the GitHub repo before changing
links, and `npm deprecate <old> "renamed to <new>"` once the new name is out.
