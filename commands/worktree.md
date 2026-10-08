---
description: Open a branch, ticket or PR in its own worktree (env files + deps ready), close one safely, prune merged or abandoned ones across repos, or list them
---

# /bond:worktree

One place for the worktree chores that otherwise get done by hand, one `git
worktree` call at a time: open a branch somewhere it cannot disturb the main
checkout, close it without losing work, and sweep out the ones whose PR is long
merged.

Worktrees live where `/bond:implement` puts them — the **Set up the branch**
procedure in `${CLAUDE_PLUGIN_ROOT}/shared/implement-flow.md` owns the path
convention (`../worktrees/<repo>-<slug>`); this command never invents another.
Host, base branch and tracker come from the project profile,
`${CLAUDE_PLUGIN_ROOT}/shared/project-profile.md`.

Runs autonomously per the **Autonomy** note in `implement-flow.md`: with several
candidates, pick the best, act, and say which. The one exception is losing work
— that is never a judgement call, it is a refusal.

## Usage

```
/bond:worktree open <branch | TICKET | PR url>
/bond:worktree close [<name>]
/bond:worktree prune [--all-repos]
/bond:worktree list [--all-repos]
```

- `<name>` — a worktree path, its folder name, its branch, or a ticket key in the
  branch. Omitted ⇒ the worktree this session is in.
- `--all-repos` — scan every git repo directly under `~/Documents/projects/`
  (a directory whose `.git` is a directory — linked worktrees have a `.git`
  file and are reached through their main repo), skipping `worktrees/`.

A bare branch, ticket or PR with no subcommand ⇒ `open`; no arguments ⇒ `list`.

## Live-session check

Run before `close` or `prune` removes anything. A worktree with a live process
inside it — another Claude session, a dev server, an editor's shell — is in use:
removing it pulls the directory out from under that process, and a Claude
session there keeps committing into a path that no longer exists.

`lsof +D` walks the whole tree, `node_modules` included, and takes minutes. Ask
for process working directories instead — one cheap call for all worktrees:

```sh
wt=$(cd "<worktree>" && pwd -P)
self=" "; p=$$; while [ "${p:-1}" -gt 1 ]; do self="$self$p "; p=$(ps -o ppid= -p "$p" | tr -d ' '); done
lsof -nP -d cwd -Fpn 2>/dev/null | awk -v wt="$wt" -v self="$self" '
  /^p/ { pid = substr($0, 2) }
  /^n/ { n = substr($0, 2)
         if ((n == wt || index(n, wt "/") == 1) && index(self, " " pid " ") == 0) print pid }'
```

`pwd -P` matters on macOS: `/tmp` is `/private/tmp`, and lsof reports the real
path. `self` is this session's own process chain, so the shell running the
check does not count as a tenant. Name each hit with `ps -o pid=,etime=,command=
-p <pid>` — a `claude` process is another session.

## Steps

### open

1. **Resolve the target to a branch.** Resolve the profile, then `git fetch
   origin --prune`.
   - **PR URL or number** — **Resolve PR coordinates**, then **PR details and
     CI status** for `headRefName` / `source_branch`. A URL for another repo ⇒
     find its checkout under `~/Documents/projects/` and run there, or stop and
     name the missing repo. `MERGED` / `CLOSED` ⇒ say so and stop.
   - **Ticket key** (`^[A-Z]+-\d+$`, any case) — every branch containing it,
     local and remote, case-insensitively (branches are `feat/erp-390` as often
     as `feat/ERP-390`):
     ```sh
     git for-each-ref --format='%(refname:short) %(committerdate:unix)' refs/heads refs/remotes/origin | grep -iE '(^|[^0-9A-Za-z])<KEY>([^0-9]|$)'
     ```
     The digit boundary matters: a bare `grep -i ERP-39` also matches `erp-390`.
     Several ⇒ prefer one with an open PR, then the newest commit; record the
     choice in the report. None ⇒ stop: *no branch for `<KEY>` — `/bond:implement
     <KEY>` starts one*.
   - **Branch name** — `origin/` prefix stripped. Exists neither locally nor on
     `origin` ⇒ stop. This command opens existing work; it does not start new
     work.
2. **Already open?** `git worktree list --porcelain` — the branch checked out in
   a linked worktree ⇒ report that path and stop (`git worktree add` refuses a
   branch checked out twice). Checked out in the **main** checkout ⇒ stop and say
   so: moving it would switch the main checkout's branch under whoever is there.
3. **Set up the branch** with `BRANCH_NAME` from step 1, `BRANCH_SOURCE=existing`,
   `WORKTREE_SUFFIX=` (empty), worktree mode.
4. **Prepare the worktree** (below), from the original repo into the new path.
5. Report: path, branch, short SHA, behind/ahead of `origin/<branch>`, the PR
   (number, state) when there is one, env files copied, install result. Then
   `cd` into it for the rest of the session's work.

### Prepare the worktree

A fresh worktree has the tracked files and nothing else: no env files, no
dependencies, so the first test run fails for reasons that are not the code.
`implement-flow.md` copies only `.claude/settings.local.json`; this procedure
does the rest. Inputs: the original repo dir, the worktree path.

1. **Env files.** Every untracked `.env*` file in the original checkout, at any
   depth (monorepos keep one per app), copied to the same relative path:
   ```sh
   cd "<original>" && find . -name node_modules -prune -o -name .git -prune -o -name '.env*' -type f -print |
     while read -r f; do git ls-files --error-unmatch "$f" >/dev/null 2>&1 || { [ -e "<wt>/$f" ] || { mkdir -p "<wt>/$(dirname "$f")"; cp "$f" "<wt>/$f"; echo "$f"; }; }; done
   ```
   Tracked files (`.env.example`) are already there; an existing target is
   never overwritten. Copy with `cp` — never `cat` or print one: the values
   would land in the transcript.
2. **Dependencies**, with the repo's own package manager, read off the
   worktree root — `packageManager` in `package.json` wins, else the lockfile:

   | Lockfile | Install |
   | --- | --- |
   | `pnpm-lock.yaml` | `pnpm install --frozen-lockfile` |
   | `yarn.lock` | `yarn install --immutable` (Berry) / `--frozen-lockfile` (v1) |
   | `bun.lock` / `bun.lockb` | `bun install --frozen-lockfile` |
   | `package-lock.json` | `npm ci` |
   | `uv.lock` / `poetry.lock` | `uv sync` / `poetry install` |
   | `Gemfile.lock` | `bundle install` |

   None of these ⇒ nothing to install (Cargo and Go fetch on build). Run it
   through the `bond:test-runner` agent so only a failure comes back. A 401/403
   is registry auth, not the code — report it, keep the worktree.

### close

1. **Find it.** `<name>` matched against `git worktree list --porcelain` — path,
   folder name, branch, or a ticket key in the branch (case-insensitive). No
   `<name>` ⇒ the linked worktree containing the current directory. Nothing
   matches, or the current directory is the main checkout ⇒ print **list** and
   stop: guessing which worktree to delete is the one choice this command does
   not make.
2. **Refuse on work that exists nowhere else**, and show it:
   - `git -C <wt> status --porcelain` — any line ⇒ refuse, print the lines.
   - unpushed commits — `git -C <wt> log --oneline @{u}..` when `git -C <wt>
     rev-parse --verify -q @{u}` resolves, `git -C <wt> log --oneline HEAD --not
     --remotes` without an upstream **or with a `[gone]` one** (the tracking ref
     is pruned, so `@{u}` is a fatal error and every local commit is unpushed). Any ⇒ refuse,
     print them, unless the branch's PR is `MERGED` and the local tip is that PR's
     head commit or its ancestor (a squash merge leaves the commits "unpushed"
     once the remote branch is deleted, but their content is on the base).
   - **Live-session check** — a hit other than this session ⇒ refuse, name the
     process.
3. `cd` to the original repo, then `git worktree remove <wt>` — never `--force`;
   if git still refuses, show why and stop.
4. **The branch.** Merged ⇒ `git branch -D` the local branch, but only once
   that is proven: `git merge-base --is-ancestor <branch> origin/<BASE_BRANCH>`
   holds, or step 2's squash-merge check passed. (`-d` would check a gone
   upstream or `HEAD`, not the base.) Not merged ⇒ keep
   it, and say it is kept and why. Never delete the remote branch.
5. `git worktree prune`. Report: removed path, branch deleted or kept.
6. **Shared hooks.** Worktrees share one `.git/hooks`, and a hook manager's
   postinstall (lefthook, husky) writes absolute paths into it — so a
   dependency install inside the removed worktree may have left the hooks
   pointing at it. `grep -l "<wt>" "$(git rev-parse --git-common-dir)/hooks/"*`
   finds them; reinstall from the main checkout (`pnpm exec lefthook install`,
   or the repo's equivalent).

A repo-local CLI that resolves its root from its own script path acts on the
checkout the script lives in, not on the current directory. Inside a worktree
run the worktree's copy of the script — calling the main checkout's copy edits
the main checkout's files.

### prune

1. **Repos** — the current repo, or every repo under `--all-repos`. Per repo:
   resolve the profile, `git fetch origin --prune` once, `git worktree prune`.
2. **PR states, one call per repo** — GitHub: `gh pr list --state all --limit
   200 --json number,headRefName,state,headRefOid`; Bitbucket:
   `mcp__bond-bitbucket__get_pull_requests` for each state. Newest PR per head
   branch wins.
3. **Classify every linked worktree** (never the main checkout; skip `locked`
   ones and the one this session is in). It is a **candidate** when any of:
   - `pr-merged` / `pr-closed` — its branch's newest PR is merged, or closed
     unmerged;
   - `merged` — the tip is an ancestor of `origin/<BASE_BRANCH>` **and** the
     branch has an upstream. Without one, a branch sitting on the base tip is
     work about to start, not work finished;
   - `gone` — the upstream is configured but deleted
     (`git for-each-ref --format='%(refname:short) %(upstream:track)'` reads
     `[gone]`).

   Detached-HEAD worktrees are listed, never removed.
4. **Run close's step 2 checks on every candidate.** Dirty, unpushed or busy ⇒
   `keep` with the reason; otherwise `remove`.
5. **Table first**, then act:

   ```
   repo          worktree                       branch            reason      state            action
   bonliva-erp   worktrees/bonliva-erp-feat-…   feat/ERP-370      pr-merged   clean            remove + branch
   bonliva-erp   worktrees/bonliva-erp-fix-…    fix/ERP-402       gone        2 unpushed       keep
   bonliva-crm   worktrees/bonliva-crm-feat-…   feat/CRMDEV-7037  pr-closed   busy: claude 41m keep
   ```

6. Remove each `remove` row by close's steps 3–5; a closed-unmerged PR's branch
   is kept. Report counts per repo and every `keep` with its reason.

### list

`git worktree list --porcelain` per repo (all repos with `--all-repos`), with
step 2's single PR call, the dirty count, ahead/behind upstream, and the
live-session check — the same table as prune, with an empty action column.

## Do NOT

- Do not `git worktree remove --force`, `git branch -D` a branch whose work is
  not provably on the base, or delete a remote branch.
- Do not remove a worktree with uncommitted changes, unpushed commits, or a live
  process inside it — refuse and show it, whatever the request said.
- Do not touch the main checkout: never switch its branch, never remove it.
- Do not use `lsof +D` — it walks `node_modules`.
- Do not print or `cat` an env file, and do not overwrite one already in the
  worktree.
- Do not create a branch here — a ticket with no branch is `/bond:implement`'s.
