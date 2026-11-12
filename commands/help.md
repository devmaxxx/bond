---
description: List all bond plugin commands with their descriptions
---

# /bond:help

Print a table of all commands provided by the `bond` plugin, then those of its companion plugins, with a one-line description of each.

## Steps

### 1. List commands

Output the following table verbatim:

| Command                | Purpose                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `/bond:help`           | List all bond plugin commands with their descriptions                                           |
| `/bond:fix-ci`         | Fix a failed pipeline from its URL, a PR, or `--mine`: diagnose, fix, push, watch the re-run      |
| `/bond:disk-analyze`   | Analyze disk usage: runaway logs, deleted-but-open files, caches; clean the safe ones           |
| `/bond:implement-batch`| Implement many tickets in parallel worktrees, scheduled so no two touch the same files           |
| `/bond:implement`      | Take a Jira ticket or a free-text task, create a typed branch, plan, and code                    |
| `/bond:investigate`    | Investigate a deployed failure to a proven root cause and write the investigation doc           |
| `/bond:linkedin`       | Write a LinkedIn post or article from the source, numbers checked, with an optional cover-image prompt |
| `/bond:linkedin-draft` | Put an approved post or article into LinkedIn through Chrome as a draft, never published         |
| `/bond:jira`           | Create, edit, assign, comment on, or transition a Jira issue (assigned to you by default)       |
| `/bond:open-pr`        | Open a PR for the current branch (GitHub or Bitbucket; draft in Bonliva repos)                   |
| `/bond:merge-pr`       | Merge one PR once it is green: push first, squash-merge, remove its branch and worktree         |
| `/bond:sweep-pr`       | Sweep open PRs: retarget, rebase, restart infra CI, merge the green ones under `--merge`          |
| `/bond:review-pr`      | Review a PR like a senior reviewer and write it up as one comment, figures from read-only prod data |
| `/bond:rebase`         | Rebase (or merge) a branch on its base, resolve conflicts, re-test, push with lease               |
| `/bond:ship-pr`        | After implement: browser-test the PR, tick its test plan, mark ready, loop review → fix → CI |
| `/bond:worktree`       | Open a worktree for a branch, ticket or PR; close it; prune merged and stale ones                  |
| `/bond:start`          | Check out a fresh typed branch — creating the Jira issue first where there is a tracker          |

Then output this second table verbatim — these need `bond-oss@devmaxxx` enabled (globally, or in each library repo):

| Command | Purpose |
| --- | --- |
| `/bond-oss:new-lib` | Create an npm library: free-name check, house-stack scaffold, GitHub repo, CI/release workflows, README, examples |
| `/bond-oss:audit`   | Audit a library against the stack and its alternatives (license, package, CI, README, examples) and fix the drift in one PR |
| `/bond-oss:demo`    | Add or refresh examples checked in CI, a Pages/Expo demo, and README GIFs made by scripts |
| `/bond-oss:release` | Release PR, merge on green, tag, one watched publish run, npm + GitHub release verified; first release bootstraps trusted publishing |

### 2. Done

Do not perform any other action.
