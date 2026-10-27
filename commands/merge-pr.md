---
description: Merge one PR — the current branch's or a named one — once it is green, push first if needed, squash-merge, then delete its branch and worktree
---

# /bond:merge-pr

**Ask first.** Before the first write, one `AskUserQuestion` with every decision `$ARGUMENTS` leaves open — none when they settle it all (standing rule *Commands ask first*). "merge" or "merge if green" typed as the whole request settles the merge itself; a push it would need is named in the question unless the words said "push and merge".

`/bond:sweep-pr --merge` for one PR. It applies that command's **5. Merge**
gate and host calls and its **6. Clean up merged PRs** in full — read both from
`${CLAUDE_PLUGIN_ROOT}/commands/sweep-pr.md`, not from the summary below — plus
`bond:pr-status` for every read and `bond:pr-watch` for the wait.

**Standing instructions win.** "Don't merge #12" given earlier in the session
stops here.

## Usage

```
/bond:merge-pr [<pr number|url>] [--no-wait]
```

No argument ⇒ the open PR whose head is the current branch.

## Steps

1. **Resolve** the PR and its profile (`${CLAUDE_PLUGIN_ROOT}/shared/project-profile.md`).
   No PR on the current branch ⇒ say so and stop; opening one is `/bond:open-pr`.
2. **Read** it once through `bond:pr-status`. Not open, or a draft ⇒ stop:
   marking ready is the author's call. Uncommitted changes in its checkout ⇒
   stop and list them; this command does not commit.
3. **Push what is local.** The current branch is the PR's head and has commits
   the remote does not ⇒ push them (account per the standing rule *GitHub
   account*). A push moves the head: CI read before it says nothing about the
   new sha, so the wait below is mandatory, even if the old head was green.
4. **Wait for the head's own CI.** CI still running, or a push just made ⇒ hand
   the wait to a background `bond:pr-watch` agent with the PR's worktree and
   the head sha, and go on only when it reports checks finished **on that
   sha**. `--no-wait` ⇒ report the state and stop. Red on the branch's own code
   ⇒ the watch agent fixes it; red on infrastructure or a human-owned cause ⇒
   stop with that cause.
5. **Review** the head by **Review a PR**
   (`${CLAUDE_PLUGIN_ROOT}/shared/pr-review-flow.md`) unless that exact sha was
   already reviewed this session; a blocking finding stops the merge.
6. **Merge** after one fresh `bond:pr-status` read, only when every condition
   of sweep-pr's step 5 holds — not a draft, CI passed on this head (`none` only
   in a repo with no CI), mergeable and not behind, the review decision, no
   unhandled comments, no blocking review finding, no standing instruction
   against it. GitHub: `gh pr merge <n> --squash --match-head-commit <sha just
   read>`. Bitbucket: `merge_pull_request` with squash and
   `close_source_branch` as step 5 sets it; the tool missing ⇒ report *merge
   by hand*. A refused merge is reported with the host's reason, never retried
   around.
7. **Clean up** by sweep-pr's step 6: the worktree through `/bond:worktree
   close`, the remote and local branch, a dependent PR retargeted.
8. **Report** in one line: `#<n> merged @<sha> — branch and worktree removed`,
   or what stopped it and why.

## Do NOT

- Do not merge a draft, a red head, or a head other than the one just checked.
- Do not bypass branch protection (`--admin`) or retry a refused merge another way.
- Do not run a wait loop in the session — the wait is `bond:pr-watch`'s.
