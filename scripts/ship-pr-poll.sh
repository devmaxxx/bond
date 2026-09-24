#!/usr/bin/env bash
# bond :: ship-pr-poll
#
# Blocks until a GitHub PR's CI and review have both settled, polling every
# POLL_INTERVAL seconds (default 5), then prints one line and exits 0:
#
#   settled checks=<n> failed=<names|-> new=<n> age=<s>s
#
# Usage: ship-pr-poll.sh [--once] <pr> <owner/repo> <ledger.json> <review-timeout-min> <skip-review 0|1>
#   --once  poll a single time; exit 0 if settled, 1 if not. For tests.
#
# Learned from failed runs:
#   - The JSON goes to a file for jq. zsh's `echo "$json"` expands the \n
#     escapes inside comment bodies and every parse fails.
#   - statusCheckRollup mixes check runs (status + conclusion) with commit
#     statuses (state only). Reading .status alone counts every commit status
#     as pending forever.
#   - An empty rollup right after a push means the checks have not registered
#     yet, not that none are pending. Only after NO_CI_AFTER seconds with zero
#     checks is there no CI.
#   - At 5s this costs ~720 GraphQL points an hour of the 5000 budget; one
#     loop per PR, never two.

set -uo pipefail

once=0
if [ "${1:-}" = "--once" ]; then
  once=1
  shift
fi
if [ $# -ne 5 ]; then
  sed -n 9,10p "$0" >&2
  exit 64
fi

pr=$1 repo=$2 ledger=$3 review_timeout=$(($4 * 60)) skip_review=$5
interval=${POLL_INTERVAL:-5}
no_ci_after=${NO_CI_AFTER:-300}
gh=${GH:-gh}

poll=$(mktemp)
trap 'rm -f "$poll"' EXIT
[ -s "$ledger" ] || ledger=/dev/null

summarize() {
  jq -r --slurpfile led "$ledger" '
    ($led[0].handledCommentIds // [] | map(tostring)) as $seen
    | .author.login as $me
    | [.statusCheckRollup[] | {
        done: ((.status // "COMPLETED") == "COMPLETED"
               and ((.state // "SUCCESS") | IN("PENDING", "EXPECTED") | not)),
        bad: (((.conclusion // "") | IN("FAILURE", "CANCELLED", "TIMED_OUT", "STARTUP_FAILURE", "ACTION_REQUIRED"))
              or ((.state // "") | IN("FAILURE", "ERROR"))),
        name: (.name // .context)
      }] as $checks
    | [ ($checks | length),
        ($checks | map(select(.done | not)) | length),
        ($checks | map(select(.bad) | .name) | join(",") | if . == "" then "-" else . end),
        ([(.comments[], .reviews[]) | select(.author.login != $me) | .id | tostring
          | select(IN($seen[]) | not)] | length) ]
    | @tsv' "$poll"
}

started=$(date +%s)
while :; do
  if "$gh" pr view "$pr" --repo "$repo" \
      --json author,statusCheckRollup,reviews,comments >"$poll" 2>/dev/null \
    && IFS=$'\t' read -r total pending failed new < <(summarize); then
    age=$(($(date +%s) - started))

    ci_done=0
    if [ "$total" -gt 0 ] && [ "$pending" -eq 0 ]; then
      ci_done=1
    elif [ "$total" -eq 0 ] && [ "$age" -ge "$no_ci_after" ]; then
      ci_done=1
    fi

    review_done=0
    if [ "$skip_review" -eq 1 ] || [ "$new" -gt 0 ] || [ "$age" -ge "$review_timeout" ]; then
      review_done=1
    fi

    if [ "$ci_done" -eq 1 ] && [ "$review_done" -eq 1 ]; then
      echo "settled checks=$total failed=$failed new=$new age=${age}s"
      exit 0
    fi
  fi

  [ "$once" -eq 1 ] && exit 1
  sleep "$interval"
done
