---
description: List all bond plugin commands with their descriptions
---

# /bond:help

Print a table of all commands provided by the `bond` plugin, then the Bonliva-only commands of its companion `bond-bonliva` plugin, with a one-line description of each.

## Steps

### 1. List commands

Output the following table verbatim:

| Command                | Purpose                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `/bond:help`           | List all bond plugin commands with their descriptions                                           |
| `/bond:checkpoint`     | Save, compare against, list or restore named snapshots of the working tree without committing    |
| `/bond:chrome-debug`   | Fallback browser path: set up/open a debuggable Chrome (LaunchAgent) and install the chrome-devtools MCP pointed at it, when claude-in-chrome can't be used |
| `/bond:fix-ci`         | Fix a failed pipeline from its URL, a PR, or `--mine`: diagnose, fix, push, watch the re-run      |
| `/bond:disk-analyze`   | Analyze disk usage: runaway logs, deleted-but-open files, caches; clean the safe ones           |
| `/bond:implement-batch`| Implement many tickets in parallel worktrees, scheduled so no two touch the same files           |
| `/bond:implement`      | Take a Jira ticket or a free-text task, create a typed branch, plan, and code                    |
| `/bond:investigate`    | Investigate a deployed failure to a proven root cause and write the investigation doc           |
| `/bond:jira`           | Create, edit, assign, comment on, or transition a Jira issue (assigned to you by default)       |
| `/bond:open-pr`        | Open a PR for the current branch (GitHub or Bitbucket; draft in Bonliva repos)                   |
| `/bond:pr-sweep`       | Sweep open PRs: retarget, rebase, restart infra CI, merge the green ones under `--merge`          |
| `/bond:rebase`         | Rebase (or merge) a branch on its base, resolve conflicts, re-test, push with lease               |
| `/bond:ship-pr`        | After implement/fix-qa: browser-test the PR, tick its test plan, mark ready, loop review → fix → CI |
| `/bond:worktree`       | Open a worktree for a branch, ticket or PR; close it; prune merged and stale ones                  |
| `/bond:start`          | Check out a fresh typed branch — creating the Jira issue first where there is a tracker          |

Then output this second table verbatim — these need `bond-bonliva@devmaxxx` enabled in the repo's `.claude/settings.local.json`:

| Command | Purpose |
| --- | --- |
| `/bond-bonliva:fix-qa`         | Re-run implementation against QA feedback — from a Jira ticket, or given as free text           |
| `/bond-bonliva:jira-sync`      | Move tickets of merged PRs to QA (fixVersion), open PRs to In Review, post QA test plans        |
| `/bond-bonliva:log-plan`       | Generate a day/week/month time-log plan                                                         |
| `/bond-bonliva:publish-timelog`| Publish an existing time-log md to Jira + Clockify (1 entry/day) and reconcile the totals        |
| `/bond-bonliva:projects`       | Manage the projects tracked by `/log-plan` (add, remove, discover, clear)                       |
| `/bond-bonliva:publish-doc`    | Publish a markdown doc to Outline, keeping its id and hash in the frontmatter                   |
| `/bond-bonliva:request-review` | Post a Teams card inviting reviewers to review a PR                                             |
| `/bond-bonliva:set-reviewers`  | Set or change the default reviewers added to PRs                                                |
| `/bond-bonliva:setup-plugin`   | Set up the bond-bonliva plugin: install MCP servers and configure env vars                              |
| `/bond-bonliva:teams-post`     | Post a message to a Teams channel via a Workflow webhook                                        |

### 2. Done

Do not perform any other action.
