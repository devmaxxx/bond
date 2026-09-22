# Target

Precedence, first that holds:

1. the target the user named in this conversation
2. `pr #n` — `gh` resolves an open PR for this branch, `HEAD` equals its `headRefOid`, and the tree is clean
3. `branch` — `<base>...HEAD` plus whatever the working tree still holds
4. `tree` — there is no base yet
5. `path <p>` — one leg of a split run

A PR number reviews only what is pushed, which is why an unpushed fix or a dirty tree drops the target to the branch. Bitbucket PRs are always `branch`: the fork fetches a PR through `gh`, and that is GitHub only.

**Split.** `files ≥ 20` and the answer is `high` or `max` ⇒ one run per module among the changed paths, each at the routed level, because the 15-finding cap is per run and a 31-file diff spends it before it reaches the third module. Each run waits for its own report before the next starts. The first such run verifies that a directory target actually scopes the diff; if it does not, one run, and `(cap 15, unsplit)` in the route line.

# Flags

`--fix` is a property of the target, not of the level: on when the diff is this conversation's own work, off when the target is a PR or branch this conversation did not write, or the user said review-only. Fixes land in the working tree, which is not their branch.

`--comment` writes on a PR other people read. Only on the user's word in this conversation, once per PR. Expect the bond `check-commit` hook to block the fork's `gh pr comment` if its footer carries a signature — that is the hook working; never lift it for a review.

`--post` speaks as the user's GitHub account and exists only on `ultra`, which this skill never launches. Never pass it. The printed ultra line mentions it as the user's choice.

Never `--fix` together with `--comment`.

# Asking

Any max predicate the task did not settle ⇒ one `AskUserQuestion` right after the scan, before any other tool call, quoting the card fields that fired. One question per review, not per predicate.

Options: the level the card argues for first, marked `(Recommended)` — `ultra` when `files ≥ 20`, else `max`; `high --fix` always offered; `ultra` offered whenever any max predicate fired, worded as the exact line for the user to type. Every option says, from the card, what it buys on this diff and what it costs — the concrete miss the extra coverage catches, or what the default leaves to chance. An option that names no card field is a coin toss.

The answer is a named override for the rest of the task. Cannot ask — non-interactive, a hook or cron turn, `/implement` in `auto` mode, or you are already a subagent — then `high`, with `(escalation not asked)` in the route line. Answer `ultra` ⇒ print the line, launch nothing, and apply the findings when the user's run reports back.
