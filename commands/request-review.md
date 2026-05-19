---
description: Post a Teams card inviting reviewers to review a Bitbucket pull request
---

# /bond:request-review

Posts a formatted Adaptive Card to the Teams channel webhook that invites a pull
request's pending reviewers to review it. Reviewers are **@mentioned** when their
Teams identity is known.

It combines three bond pieces:
- `mcp__bond-bitbucket__get_pull_request` — PR details and reviewer list
- `${CLAUDE_PLUGIN_ROOT}/data/teams-users.json` — display name → Teams email (mention id)
- `${CLAUDE_PLUGIN_ROOT}/data/pr-review-card.json` — the Adaptive Card template
- `${CLAUDE_PLUGIN_ROOT}/scripts/teams-post.sh --raw` — posts the prebuilt payload

## Input

`$ARGUMENTS` — a PR number (e.g. `444`) or a full Bitbucket PR URL
(`https://bitbucket.org/<ws>/<repo>/pull-requests/<id>`). If empty, ask the user
which PR before doing anything else.

## Steps

### 1. Check the webhook is configured

If `BOND_TEAMS_WEBHOOK_URL` is not set, stop and tell the user to create a
Workflow webhook (README → "Teams channel webhook") and export its URL.

### 2. Resolve the PR coordinates

- **Full URL** — parse `workspace`, `repo_slug`, and `pull_request_id` from it.
- **Bare number** — `workspace` is `bonliva`; derive `repo_slug` from
  `git remote get-url origin` of the current repo; `pull_request_id` is the number.

### 3. Fetch PR details

Call `mcp__bond-bitbucket__get_pull_request` with the resolved coordinates.
Extract: `title`, `state`, `author`, `source_branch`, `destination_branch`,
`reviewers` (each with `display_name` and `approved`).

- Extract a Jira key from the title with `[A-Z]+-\d+`. If found, the Jira URL is
  `https://bonliva.atlassian.net/browse/<KEY>`.
- If `state` is `MERGED` or `DECLINED`, **warn the user** ("PR #<id> is already
  <state> — still send a review invite?") and wait for confirmation before continuing.

### 4. Resolve reviewer mentions

The invite targets **pending reviewers** — reviewers whose `approved` is not `true`.
If every reviewer has approved (or there are no reviewers), tell the user and ask
whom to invite instead.

For each pending reviewer, match `display_name` against
`${CLAUDE_PLUGIN_ROOT}/data/teams-users.json`:

- **Matched** — build a mention entity and use an `<at>` tag for that name:
  ```json
  { "type": "mention", "text": "<at>Full Name</at>", "mentioned": { "id": "<email>", "name": "Full Name" } }
  ```
- **Unmatched** — use the plain display name in the greeting (no `<at>` tag, no entity).

**Always include Daniel Khoroshko** (tech lead) in the mention list, even if he has
already approved or is not listed as a reviewer on the PR — resolve his mention
entity from `data/teams-users.json` the same way. Do not duplicate him if he is
already among the pending reviewers.

Never mention the PR author.

### 5. Build the greeting

A very short invitation. For example:

> Honourable `<at>Daniel Khoroshko</at>`, `<at>Denys Postyka</at>` and `<at>Volodymyr Komiachko</at>` — review please 🎩

### 6. Fill the template

Read `${CLAUDE_PLUGIN_ROOT}/data/pr-review-card.json` and substitute every `{{TOKEN}}`:

| Token | Value |
|-------|-------|
| `{{PR_TITLE}}` | PR title |
| `{{REPO}}` | `<workspace>/<repo_slug>` |
| `{{AUTHOR}}` | PR author |
| `{{SOURCE_BRANCH}}` / `{{DEST_BRANCH}}` | branches |
| `{{PR_URL}}` | the Bitbucket PR URL |
| `{{JIRA_KEY}}` / `{{JIRA_URL}}` | Jira key and browse URL |
| `{{GREETING}}` | the sentence from step 5 (with `<at>` tags) |

Replace the string `"{{MENTION_ENTITIES}}"` with the JSON array of mention entities
from step 4 (use `[]` if there are none). If the PR has **no Jira key**, delete the
Jira `Action.OpenUrl` object from `actions` entirely.

Write the finished payload to a temp file (e.g. `/tmp/bond-review-<PR_ID>.json`).

### 7. Show before sending

Print a readable preview of the card (PR title, facts, greeting, buttons)
and the resolved mentions. **Ask the user to confirm before posting.** If they
request changes, adjust and show again.

### 8. Post

On confirmation:

```sh
"${CLAUDE_PLUGIN_ROOT}/scripts/teams-post.sh" --raw /tmp/bond-review-<PR_ID>.json
```

### 9. Report

Relay the script's delivery line (HTTP status). Note that @mentions only resolve
if the Power Automate flow forwards the `msteams` block — they fall back to plain
text otherwise.
