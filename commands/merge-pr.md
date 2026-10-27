---
description: Merge one PR — the current branch's or a named one — once it is green, push first if needed, squash-merge, then delete its branch and worktree
---

# /bond:merge-pr

**Ask first.** Before the first write, one `AskUserQuestion` with every decision `$ARGUMENTS` leaves open — none when they settle it all (standing rule *Commands ask first*). "merge" or "merge if green" typed by the user settles the merge itself.

`/bond:sweep-pr --merge` for one PR. It reuses that command's **5. Merge**
gate and **6. Clean up merged PRs** verbatim — read them from
`${CLAUDE_PLUGIN_ROOT}/commands/sweep-pr.md` — plus `bond:pr-status` for every
read and `bond:pr-watch` for the wait.

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
2. **Push what is local.** The current branch is the PR's head and has commits
   the remote does not ⇒ push them first (account per the standing rule
   *GitHub account*). Uncommitted changes ⇒ stop and list them; this command
   does not commit.
3. **Read** it once through `bond:pr-status`.
   - A draft ⇒ stop: marking ready is the author's call.
   - CI still running ⇒ hand the wait to a background `bond:pr-watch` agent
     with the PR's worktree, and merge when it reports green. `--no-wait` ⇒
     report the state and stop.
   - CI red on the branch's own code ⇒ the watch agent fixes it; red on
     infrastructure or a human-owned cause ⇒ stop with that cause.
4. **Merge** by sweep-pr's step 5 gate — draft, CI on the head being merged,
   mergeable, review decision, unhandled comments — and its host calls, the
   GitHub merge pinned with `--match-head-commit` to the head just read. A
   refused merge is reported with the host's reason, never retried around.
5. **Clean up** by sweep-pr's step 6: the worktree through `/bond:worktree
   close`, the remote and local branch, a dependent PR retargeted.
6. **Report** in one line: `#<n> merged @<sha> — branch and worktree removed`,
   or what stopped it and why.

## Do NOT

- Do not merge a draft, a red head, or a head other than the one just checked.
- Do not bypass branch protection (`--admin`) or retry a refused merge another way.
- Do not run a wait loop in the session — the wait is `bond:pr-watch`'s.
