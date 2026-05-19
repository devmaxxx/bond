---
description: Post a message to a Microsoft Teams channel via a Workflow webhook
---

# /bond:teams-post

Post a message to a Microsoft Teams **channel** using the bond webhook script at
`${CLAUDE_PLUGIN_ROOT}/scripts/teams-post.sh`, which POSTs an Adaptive Card to a
Power Automate "Post to a channel when a webhook request is received" Workflow.

This is the auth-light path: a Workflow webhook URL is a bearer secret, so it
needs no Microsoft Graph token and is unaffected by tenant device-compliance
policies. It posts to a **channel only** — not to 1:1 or group chats.

The channel's Workflow webhook URL must be in the `BOND_TEAMS_WEBHOOK_URL`
environment variable. See the README "Teams channel webhook" section for how to
create the Workflow and obtain its URL.

## Input

`$ARGUMENTS` is the message to post. If it is empty, ask the user what to send
before doing anything else.

## Steps

### 1. Check the webhook is configured

If `BOND_TEAMS_WEBHOOK_URL` is not set, stop and tell the user to create a
Workflow webhook (README → "Teams channel webhook") and export its URL. Do not
proceed.

### 2. Send the message

Run the script with the message as a single argument:

```sh
"${CLAUDE_PLUGIN_ROOT}/scripts/teams-post.sh" "<message>"
```

For a titled card, pass `--title "<title>"` before the message.

### 3. Report

Relay the script's delivery line (its HTTP status) to the user. On failure, show
the status and the likely cause — a wrong or revoked webhook URL is the usual
one.
