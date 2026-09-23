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
| `/bond:chrome-debug`   | Fallback browser path: set up/open a debuggable Chrome (LaunchAgent) and install the chrome-devtools MCP pointed at it, when claude-in-chrome can't be used |
| `/bond:disk-analyze`   | Analyze disk usage: runaway logs, deleted-but-open files, caches; clean the safe ones           |
| `/bond:fix-pr`         | Diagnose why a PR's CI failed (Bitbucket or GitHub), fix the root causes, and push               |
| `/bond:implement`      | Take a Jira ticket or a free-text task, create a typed branch, plan, and code                    |
| `/bond:investigate`    | Investigate a deployed failure to a proven root cause and write the investigation doc           |
| `/bond:jira`           | Create, edit, assign, comment on, or transition a Jira issue (assigned to you by default)       |
| `/bond:open-pr`        | Open a PR for the current branch (GitHub or Bitbucket; draft in Bonliva repos)                   |
| `/bond:finish-pr`      | After implement/fix-qa: browser-test the PR, tick its test plan, mark ready, loop review → fix → CI |
| `/bond:start`          | Check out a fresh typed branch — creating the Jira issue first where there is a tracker          |

Then output this second table verbatim — these need `bond-bonliva@devmaxxx` enabled in the repo's `.claude/settings.local.json`:

| Command | Purpose |
| --- | --- |
| `/bond-bonliva:babysit-prs`    | Sweep every open PR you authored — review comments, red CI, stale branches — fix and report     |
| `/bond-bonliva:fix-qa`         | Re-run implementation against QA feedback — from a Jira ticket, or given as free text           |
| `/bond-bonliva:log-plan`       | Generate a day/week/month time-log plan                                                         |
| `/bond-bonliva:publish-timelog`| Publish an existing time-log md to Jira + Clockify (1 entry/day) and reconcile the totals        |
| `/bond-bonliva:projects`       | Manage the projects tracked by `/log-plan` (add, remove, discover, clear)                       |
| `/bond-bonliva:request-review` | Post a Teams card inviting reviewers to review a PR                                             |
| `/bond-bonliva:set-reviewers`  | Set or change the default reviewers added to PRs                                                |
| `/bond-bonliva:setup-plugin`   | Set up the bond-bonliva plugin: install MCP servers and configure env vars                              |
| `/bond-bonliva:teams-post`     | Post a message to a Teams channel via a Workflow webhook                                        |

### 2. Done

Do not perform any other action.
