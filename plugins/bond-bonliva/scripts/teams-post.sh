#!/usr/bin/env bash
# Post a message to a Microsoft Teams channel via a Power Automate
# "Post to a channel when a webhook request is received" Workflow webhook.
#
# Usage:
#   teams-post.sh "message text"
#   teams-post.sh --title "Deploy" "message text"
#   teams-post.sh --raw payload.json          # POST a prebuilt Teams message payload
#   echo "message text" | teams-post.sh
#
# Requires:
#   BOND_TEAMS_WEBHOOK_URL — the Workflow's HTTP POST URL (treat it as a secret).
set -euo pipefail

title=""
raw_file=""
if [[ "${1:-}" == "--raw" ]]; then
  raw_file="${2:-}"
  shift 2
elif [[ "${1:-}" == "--title" ]]; then
  title="${2:-}"
  shift 2
fi

if [[ -z "${BOND_TEAMS_WEBHOOK_URL:-}" ]]; then
  echo "teams-post: BOND_TEAMS_WEBHOOK_URL is not set" >&2
  exit 2
fi

if [[ -n "${raw_file}" ]]; then
  # --raw mode: POST a prebuilt Teams message payload verbatim.
  if [[ ! -f "${raw_file}" ]]; then
    echo "teams-post: payload file not found: ${raw_file}" >&2
    exit 2
  fi
  if ! jq empty "${raw_file}" 2>/dev/null; then
    echo "teams-post: payload file is not valid JSON: ${raw_file}" >&2
    exit 2
  fi
  payload="$(cat "${raw_file}")"
else
# Build the Adaptive Card payload — the format the Workflow webhook expects.
# An optional bold title TextBlock, then the message text.
text="${*:-}"
if [[ -z "${text}" ]] && [[ ! -t 0 ]]; then
  text="$(cat)"
fi

if [[ -z "${text}" ]]; then
  echo "teams-post: no message text given" >&2
  exit 2
fi

payload="$(jq -n --arg title "${title}" --arg text "${text}" '
  {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          type: "AdaptiveCard",
          "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
          version: "1.5",
          body: (
            (if $title == "" then []
             else [{ type: "TextBlock", text: $title, weight: "Bolder", size: "Medium", wrap: true }]
             end)
            + [{ type: "TextBlock", text: $text, wrap: true }]
          )
        }
      }
    ]
  }')"
fi

set +e
http_code="$(curl -sS -o /dev/null -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  -d "${payload}" \
  "${BOND_TEAMS_WEBHOOK_URL}" 2>/dev/null)"
curl_rc=$?
set -e

if [[ ${curl_rc} -ne 0 ]]; then
  echo "teams-post: could not reach the webhook (curl exit ${curl_rc})" >&2
  exit 1
fi

if [[ "${http_code}" =~ ^2 ]]; then
  echo "teams-post: delivered (HTTP ${http_code})"
else
  echo "teams-post: failed (HTTP ${http_code})" >&2
  exit 1
fi
