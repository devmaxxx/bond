---
name: verification-loop
description: Use before claiming a change works — before the code-review step, before opening or publishing a PR, after a refactor or a merge — and when the user says "verify", "проверь", "does it build". Runs the repo's own build, typecheck, lint and tests, scans the diff for secrets and debug leftovers, and reports one READY / NOT READY line with the evidence.
---

# Verification loop

## Contract

"Done" is a claim; this skill turns it into evidence. Each gate runs the command the
repo itself uses — never one guessed from the stack — and its verdict is the exit code,
not a reading of the output. A gate the repo does not have is `n/a`, never `PASS`.

## Find the commands

Read, in order, and stop at the first that names the gate: the CI config
(`.github/workflows/*`, `bitbucket-pipelines.yml`, `.woodpecker*`), then `package.json`
scripts (`build`, `typecheck`/`tsc`, `lint`, `test`), then `Makefile`, `justfile`,
`pyproject.toml`. CI wins because it is what will judge the PR. In a monorepo, scope each
command to the packages the diff touches (`turbo run … --filter`, `nx affected`).

## Gates

1. **Build** — fails ⇒ stop; nothing after it means anything.
2. **Types** — `tsc --noEmit` or the repo's script.
3. **Lint** — on the changed files when the linter allows it.
4. **Tests** — through the `TestRunner` agent, so only failures come back.
5. **Diff scan** — added lines only (`git diff <base>...HEAD -U0 | grep '^+'`): keys and
   tokens (`sk-`, `AKIA`, `ghp_`, `-----BEGIN`, `password\s*=`), stray `console.log`,
   `debugger`, `.only(`, `TODO` added by this branch, and committed `.env` files.
6. **Diff shape** — `git diff --stat <base>...HEAD`: a file nobody meant to touch is a
   finding, not noise.

Run independent gates in one message. A failing gate gets fixed and the loop re-runs from
that gate; three failures on one gate ⇒ stop and report the cause, not a fourth guess.

## Report

```
verify: build=PASS types=PASS lint=n/a tests=PASS (212) scan=1 diff=4 files → NOT READY
- src/api.ts:31 console.log added
```

One line, then one bullet per finding with `file:line`. `READY` only when every gate is
`PASS` or `n/a` and the scan is empty.

## Where it sits

Before `bond:finishing-with-code-review` — the review reads a diff that already builds.
Inside `/bond:ship-pr`, CI is the authority; run this loop locally only to reproduce a red
CI gate.

Adapted from the verification-loop skill of everything-claude-code (Affaan Mustafa, MIT).
