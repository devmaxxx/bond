#!/usr/bin/env bash
# bond :: disk-analyze
#
# Read-only disk usage analysis for macOS, plus *guarded* cache cleanup.
#
# Design notes (learned the hard way):
#   - ncdu is a TUI and cannot be driven by an agent; everything here is
#     non-interactive and line-oriented.
#   - On macOS, /System/Volumes/Data firmlinks mirror /Users, /Applications,
#     /private, /opt ... so a naive scan double-counts them. We scan explicit
#     roots and skip the mirror.
#   - Deleting a file that a process still holds open frees ZERO bytes until
#     that process exits. Any big-file report must name the holder, so
#     `runaways` and `open-deleted` both go through lsof.
#   - Caches are only "safe" when nothing is using them. Each cache carries its
#     own in-use probe and `clean` refuses blocked ones instead of forcing.
#
# bash 3.2 compatible (macOS system bash): no associative arrays.

set -uo pipefail

SELF="$(basename "$0")"
BIG_FILE_THRESHOLD="${BOND_DISK_BIG_FILE:-1G}"
TOP_N="${BOND_DISK_TOP_N:-25}"

# Roots worth scanning. /System/Volumes/Data is deliberately absent: it is a
# firmlink mirror of these same paths and would double every number.
SCAN_ROOTS="
$HOME
/Applications
/Library
/opt
/private/tmp
/private/var
/usr/local
"

# Where runaway logs and scratch files pile up.
RUNAWAY_ROOTS="
$HOME
/private/tmp
/private/var/tmp
/private/var/log
"

# key|label|path|clean command
CACHE_DEFS="
pnpm|pnpm store|$HOME/Library/pnpm/store|pnpm store prune
npm|npm cache|$HOME/.npm|npm cache clean --force
uv|uv cache|$HOME/.cache/uv|uv cache clean
yarn|yarn cache|$HOME/Library/Caches/Yarn|yarn cache clean
go|go module cache|$HOME/go/pkg/mod|go clean -modcache
cargo|cargo registry|$HOME/.cargo/registry|rm -rf $HOME/.cargo/registry
pip|pip cache|$HOME/Library/Caches/pip|pip cache purge
nuget|NuGet packages|$HOME/.nuget/packages|rm -rf $HOME/.nuget/packages
gradle|Gradle caches|$HOME/.gradle/caches|rm -rf $HOME/.gradle/caches
xcode-di|Xcode DerivedData|$HOME/Library/Developer/Xcode/DerivedData|rm -rf $HOME/Library/Developer/Xcode/DerivedData
chrome-debug|Chrome debug profile|$HOME/.chrome-debug|rm -rf $HOME/.chrome-debug
trash|Trash|$HOME/.Trash|rm -rf $HOME/.Trash/*
"

hr() { printf '%s\n' "------------------------------------------------------------"; }
has() { command -v "$1" >/dev/null 2>&1; }

# --- in-use probes -----------------------------------------------------------
# Each echoes a reason when the cache is NOT safe to clean; silence = safe.

busy_reason() {
  local key="$1" path="$2"
  case "$key" in
    uv)
      # `uv cache clean` blocks on ~/.cache/uv/.lock. Long-lived `uv tool uvx`
      # MCP servers hold it for the whole session; --force would yank the cache
      # out from under them.
      local holders
      holders="$(lsof -- "$path/.lock" 2>/dev/null | awk 'NR>1 {print $2}' | sort -u | tr '\n' ' ')"
      [ -n "$holders" ] && echo "lock held by running uv process(es): ${holders% } (likely uvx/MCP servers — quit them first)"
      ;;
    npm)
      # A stray `sudo npm` leaves root-owned files; npm then aborts mid-clean.
      local foreign
      foreign="$(find "$path" ! -user "$(id -un)" 2>/dev/null | wc -l | tr -d ' ')"
      [ "${foreign:-0}" -gt 0 ] && echo "$foreign file(s) not owned by $(id -un) (a sudo npm ran once) — needs: sudo chown -R $(id -u):$(id -g) $path"
      ;;
    chrome-debug)
      local pids
      pids="$(pgrep -f -- "--user-data-dir=$path" 2>/dev/null | tr '\n' ' ')"
      [ -n "$pids" ] && echo "Chrome is running on this profile (pids: ${pids% }) — deleting it now corrupts the profile and kills the session"
      ;;
    gradle)
      pgrep -f GradleDaemon >/dev/null 2>&1 && echo "Gradle daemon running — stop it first (./gradlew --stop)"
      ;;
    xcode-di)
      pgrep -x Xcode >/dev/null 2>&1 && echo "Xcode is running — quit it first"
      ;;
  esac
}

cache_rows() {
  printf '%s\n' "$CACHE_DEFS" | while IFS='|' read -r key label path cmd; do
    [ -z "${key:-}" ] && continue
    [ -e "$path" ] || continue
    printf '%s|%s|%s|%s\n' "$key" "$label" "$path" "$cmd"
  done
}

# --- subcommands -------------------------------------------------------------

cmd_capacity() {
  echo "## Capacity"
  df -h / /System/Volumes/Data 2>/dev/null | sed -n '1p;/disk/p'
  local avail
  avail="$(df -g /System/Volumes/Data 2>/dev/null | awk 'NR==2 {print $4}')"
  if [ -n "${avail:-}" ] && [ "$avail" -lt 10 ]; then
    echo
    echo "!! ${avail}GiB free — under 10GiB. macOS misbehaves here (builds fail, Time Machine stalls)."
  fi
}

cmd_top() {
  echo "## Largest directories (depth 2, mirrors excluded)"
  local root
  for root in $SCAN_ROOTS; do
    [ -d "$root" ] || continue
    du -x -d 2 "$root" 2>/dev/null
  done | sort -rn | head -"$TOP_N" | awk '{
    size=$1; $1=""; sub(/^ /,"")
    unit="K"
    if (size>=1048576) { size=size/1048576; unit="G" }
    else if (size>=1024) { size=size/1024; unit="M" }
    printf "%8.1f%s  %s\n", size, unit, $0
  }'
}

cmd_runaways() {
  echo "## Files >= $BIG_FILE_THRESHOLD (holders resolved)"
  echo "   A file with a holder does NOT free space on rm until that pid exits."
  local root f
  for root in $RUNAWAY_ROOTS; do
    [ -d "$root" ] || continue
    find "$root" -type f -size "+$BIG_FILE_THRESHOLD" 2>/dev/null
  done | sort -u | while read -r f; do
    local sz holders
    sz="$(du -h "$f" 2>/dev/null | awk '{print $1}')"
    holders="$(lsof -- "$f" 2>/dev/null | awk 'NR>1 {print $1"("$2")"}' | sort -u | tr '\n' ' ')"
    printf '%8s  %s\n' "${sz:-?}" "$f"
    if [ -n "$holders" ]; then
      printf '          held by: %s\n' "${holders% }"
      printf '          -> kill the holder before rm, or the space stays allocated\n'
    fi
  done
}

cmd_open_deleted() {
  echo "## Deleted-but-open files (space allocated, invisible to du/find)"
  echo "   These free themselves the moment the holding process exits."
  lsof -nP +L1 2>/dev/null \
    | awk 'NR==1 || ($0 ~ /\(deleted\)/ || $NF ~ /deleted/)' \
    | head -40
}

cmd_caches() {
  echo "## Cache candidates"
  local key label path cmd sz reason
  cache_rows | while IFS='|' read -r key label path cmd; do
    sz="$(du -sh -x "$path" 2>/dev/null | awk '{print $1}')"
    reason="$(busy_reason "$key" "$path")"
    if [ -n "$reason" ]; then
      printf '%8s  %-22s %-12s BLOCKED: %s\n' "${sz:-?}" "$label" "[$key]" "$reason"
    else
      printf '%8s  %-22s %-12s safe    (%s)\n' "${sz:-?}" "$label" "[$key]" "$cmd"
    fi
  done
  echo
  echo "## Simulator runtimes (redownloadable, but a multi-GB redownload)"
  if has xcrun; then
    xcrun simctl runtime list 2>/dev/null | sed 's/^/   /'
    echo "   delete with: xcrun simctl runtime delete <identifier>"
  else
    echo "   (xcrun not present)"
  fi
}

cmd_clean() {
  if [ $# -eq 0 ]; then
    echo "usage: $SELF clean <key> [key...]   (keys from \`$SELF caches\`; 'safe' = every unblocked cache)" >&2
    return 2
  fi

  local want="$*" key label path cmd reason sz
  if [ "$want" = "safe" ]; then
    want="$(cache_rows | while IFS='|' read -r key label path cmd; do
      [ -z "$(busy_reason "$key" "$path")" ] && printf '%s ' "$key"
    done)"
    echo "Cleaning every unblocked cache: ${want:-<none>}"
    echo
  fi

  local k found rc=0
  for k in $want; do
    found=0
    while IFS='|' read -r key label path cmd; do
      [ "$key" = "$k" ] || continue
      found=1
      sz="$(du -sh -x "$path" 2>/dev/null | awk '{print $1}')"
      reason="$(busy_reason "$key" "$path")"
      if [ -n "$reason" ]; then
        echo "SKIP  $label ($sz) — $reason"
        rc=1
        continue
      fi
      echo "CLEAN $label ($sz) — $cmd"
      if eval "$cmd" >/dev/null 2>&1; then
        echo "      ok, now $(du -sh -x "$path" 2>/dev/null | awk '{print $1}' || echo gone)"
      else
        echo "      FAILED — run it by hand to see the error: $cmd"
        rc=1
      fi
    done <<EOF
$(cache_rows)
EOF
    [ "$found" -eq 0 ] && { echo "?     unknown or absent cache key: $k"; rc=1; }
  done
  return $rc
}

cmd_scan() {
  cmd_capacity; echo; hr
  cmd_top;      echo; hr
  cmd_runaways; echo; hr
  cmd_open_deleted; echo; hr
  cmd_caches
}

case "${1:-scan}" in
  scan)         cmd_scan ;;
  capacity)     cmd_capacity ;;
  top)          cmd_top ;;
  runaways)     cmd_runaways ;;
  open-deleted) cmd_open_deleted ;;
  caches)       cmd_caches ;;
  clean)        shift; cmd_clean "$@" ;;
  -h|--help|help)
    cat <<EOF
$SELF <subcommand>

  scan          everything below, in order (default)
  capacity      df + low-space warning
  top           largest directories (firmlink mirrors excluded)
  runaways      files >= $BIG_FILE_THRESHOLD, with the processes holding them open
  open-deleted  deleted-but-still-open files (space du cannot see)
  caches        cache candidates, sized, each marked safe or BLOCKED
  clean <key>   clean named caches; refuses blocked ones. 'clean safe' = all unblocked

env: BOND_DISK_BIG_FILE (default 1G), BOND_DISK_TOP_N (default 25)
EOF
    ;;
  *) echo "unknown subcommand: $1 (try: $SELF --help)" >&2; exit 2 ;;
esac
