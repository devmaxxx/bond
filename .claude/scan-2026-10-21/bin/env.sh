# Source at the top of every Bash block of the scan: . <RUN>/bin/env.sh
# RUN is the folder above this file; REPO is the clone that holds it. Override with SCAN_RUN / SCAN_REPO.
export MSYS_NO_PATHCONV=1
_scan_here=$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && { pwd -W 2>/dev/null || pwd; })
RUN=${SCAN_RUN:-$_scan_here}
REPO=${SCAN_REPO:-$(git -C "$RUN" rev-parse --show-toplevel)}
WT=$REPO/.claude/worktrees/scan-2026-10-21
SANDBOX=$REPO/.claude/worktrees/scan-2026-10-21-sandbox
[ -f "$RUN/context/sha.txt" ] && SHA=$(cat "$RUN/context/sha.txt")
unset _scan_here
