---
description: List all bond plugin commands with their descriptions
---

# /bond:help

Print a table of all commands provided by the `bond` plugin, with a one-line description of each.

## Steps

### 1. List commands

Output the following table verbatim:

| Command                | Purpose                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `/bond:help`           | List all bond plugin commands with their descriptions                                           |
| `/bond:chrome-debug`   | Set up/open a debuggable Chrome (LaunchAgent) and install the chrome-devtools MCP pointed at it |
| `/bond:fix-qa`         | Read QA failure feedback from a Jira ticket and re-run implementation to fix it                 |
| `/bond:implement`      | Fetch a Jira ticket, create a typed branch, plan, and code                                      |
| `/bond:log-plan`       | Generate a day/week/month time-log plan                                                         |
| `/bond:open-pr`        | Open the Bitbucket PR creation page for the current branch                                      |
| `/bond:request-review` | Post a Teams card inviting reviewers to review a PR                                             |
| `/bond:set-reviewers`  | Set or change the default reviewers added to PRs                                                |
| `/bond:setup-plugin`   | Set up the bond plugin: install MCP servers and configure env vars                              |
| `/bond:teams-post`     | Post a message to a Teams channel via a Workflow webhook                                        |
| `/bond:track-pr`       | Watch a PR pipeline and push a desktop notification on finish                                   |

### 2. Done

Do not perform any other action.
