# CI slot and sibling sessions

> **Not an invocable command.** How a beauty-crm session shares the forge with
> the sibling sessions running beside it. Read before pushing a PR, merging, or
> starting a batch in a new worktree.

The repo owns the mechanism; this file only adds what sessions kept getting
wrong around it. The source of truth is the repo's `.claude/CLAUDE.md` (rule 5,
one code PR on the forge at a time) and `.claude/skills/pull-request/SKILL.md`
§2 — read those, not a memory of them.

## The slot in one paragraph

The runners are the owner's own machine, so CI is serial. The slot is the
`ci-slot` **label on a PR**, taken by the `changes` job's "Take the serial
slot" step in `.github/workflows/ci.yml` on the first run that finds it free,
and held until that PR merges or closes — a red run and the fix pushed after it
keep their place. Any other PR's run fails within seconds naming the holder. A
draft never holds it: "Park a draft" drops the label and fails the run, so a
draft cannot merge either.

## What a session does

- **Every `gh` call carries its own token** —
  `GH_TOKEN=$(gh auth token -u <gh_user>) gh …`, `gh_user` from
  `.claude/task-sync.local.json`. Never `gh auth switch`: sibling sessions share
  the machine-global account.
- **Before pushing a PR, read the holder**:
  `gh pr list --label ci-slot --state open --json number,title,headRefName`.
  Held by another PR ⇒ push and open anyway only when the owner wants the PR
  visible; otherwise hand the wait to a background agent that polls the holder
  (`gh pr view <holder> --json state`) every ~5 min with a deadline, then rebase
  on fresh `main`, renumber migrations and contract versions, and push.
- **Never move the slot on your own.** Taking it from another PR
  (`gh pr edit <holder> --remove-label ci-slot`, `--add-label` on yours) is the
  owner's call — ask, naming both PRs. "add ci slot to #N" / "remove ci slot
  from this PR" are that call.
- **"just push, no slot"** means push the branch and open no PR: no run starts,
  the slot is untouched.
- **After a merge**, remove the label from the merged PR if the host left it
  (`gh pr edit <n> --remove-label ci-slot`) and say the slot is free.
- **Fix only the branch that holds the slot or your own** — a push to a
  sibling's branch restarts their run under them.

## Sibling sessions

- Claim before editing: `pnpm tasks claim <n>` (repo rule 4) — the claim, not a
  message, is what siblings see. A daily `stale-claims` job frees untouched ones.
- Work in your own `.claude/worktrees/<name>`; another session's worktree is
  never touched, read or removed.
- Choosing work beside a sibling: read their open PRs' files
  (`gh pr diff <n> --name-only`) and their worktrees' branches, and skip cards
  that edit the same files or take the next migration or contract number.
- Cross-session messages are not reliable — recipients can hold or refuse them.
  Send one, do not resend, and re-check claims and the slot label at the moment
  you act.
