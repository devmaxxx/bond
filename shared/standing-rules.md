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

The rule is *why*, never *what* — and **the skill owns the exceptions**, which
are the whole difficulty: what a public doc comment states, which identifiers are
tags to strip and which are names to keep, and which comments are actually tool
directives. Read it rather than pruning from a summary.

What this paragraph is for is the trigger, not the rule: apply the skill on
every task that writes, edits or reviews code, prune in passing during a review
or cleanup, and never wait to be asked.

## Model and effort routing — always on

Apply the `bond:routing-model-and-effort` skill at the start of every task that
will change files or needs a plan. **The skill owns the tier table, the scan and
the spawn rule.** The default pair is opus/high.

The one thing worth repeating here, because it is a standing instruction to *me*
rather than a routing detail: never take fable, xhigh or max on your own
judgement. A predicate firing buys a question, not a tier — ask once, name the
predicate, and run opus/high until the answer arrives. Dropping to medium or low
needs no question.

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
changed code. **The skill owns the procedure** — the target, the launch, the
apply-and-prove, the commit, and what the recap must name. Do not run a review
from memory of this paragraph.

In particular the level is not set here: `bond:routing-code-review` reads it off
the diff, and a level written into a standing rule is a guess that outranks the
router on every task it is wrong about.

A task reported done with the review unrun is not done. The router's card names
the one skip — a docs-only or comment-only diff — and a skip is said in words,
as is a review that found nothing.
