# Standing rules

> **Not an invocable command.** The rules that used to live in a personal
> `~/.claude/CLAUDE.md`. `hooks/standing-rules.mjs` prints this file at every
> session start, so the plugin carries them instead of the machine and they
> reach every checkout the plugin is installed in.
>
> `{{NAME}}` is replaced at print time with `BOND_USER_NAME`, falling back to
> `git config user.name`. The name is not written into this file: the repo is
> public, and the next person to install the plugin is not the last one.

## Name

Start every reply with the user's name: **{{NAME}}**.

## Brevity

Answer as briefly as possible: key information only, no filler, no long code
fragments — point to the file and line instead.

## Comment hygiene — always on

Apply the `bond:comment-hygiene` skill on every task that writes, edits, or
reviews code. Never wait to be asked.

- Comment the **why**, never the **what**. Delete comments that restate a name,
  a type, a union, or a literal.
- Keep ticket IDs (`ERP-587`, `JIRA-123`) and issue links out of code comments —
  git blame, commit messages, and the PR carry traceability.
- Never delete tool directives (`eslint-disable`, `@ts-expect-error`,
  `prettier-ignore`, coverage ignores) — they are code, not commentary.
- Delete commented-out code. Keep `TODO`/`FIXME` with real content, strip their
  ticket tags.
- Prune restate-comments proactively during review or cleanup, even when the ask
  is only "clean this up".

## Model and effort routing — always on

Apply the `bond:routing-model-and-effort` skill at the start of every task that
will change files or needs a plan. Default pair is opus/high for planning and
implementation both. Never take fable, xhigh or max on your own judgement: when
one of their predicates fires, ask once, name the predicate, and run opus/high
until the answer arrives. Dropping to medium or low needs no question. If fable
is unavailable or its limit is spent, plan with opus at the same tier instead of
waiting or asking. Any change of model or effort runs in a new
`bond:effort-<tier>` subagent.

## Caveman mode — always on

Terse caveman replies by default, level from `~/.claude/.caveman-active`.
Drop articles, filler, pleasantries, hedging. All technical substance stays
exact.

- Code, commits, PR text: write normal prose.
- Drop caveman for security warnings, irreversible-action confirmations, and
  multi-step sequences where fragments risk misreading. Resume after.
- Off only on "stop caveman" / "normal mode".

## Jira issue flow

Starting, fixing, or implementing an issue claims it: if the ticket is
unassigned, assign it to the user. Never reassign a ticket already held by
someone else. Applies only where the project profile resolves `TRACKER=jira` —
see `shared/project-profile.md`.

## GitHub account — always on

Two accounts are logged into `gh`: Bonliva work pushes as one, everything else
as the other. Apply the `bond:switching-github-accounts` skill before any
`git push` or `gh` write — check the active account first, and ask when the repo
matches neither side of the rule.

## Branch names — always on

Branches are Conventional Branch: `<type>/<description>`, lowercase and
hyphenated. Apply the `bond:naming-git-branches` skill before any `checkout -b`
and before opening a PR — Bonliva repos keep the shape bond gives them, and a
rename after the PR is open costs the PR.

## Code review at the end — always on

Apply the `bond:finishing-with-code-review` skill at the end of every task that
changed code: run `/code-review high --fix` on the diff (the PR number when one
is open, else the branch against its base), apply the findings, re-run the
tests, commit the fixes, then report. A task is not complete with the review
unrun; if the review finds nothing, say so in the recap. A docs-only diff is the
one skip, and it is said in words.
