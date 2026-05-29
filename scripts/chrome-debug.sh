#!/usr/bin/env bash
#
# bond chrome-debug — manage an always-on, debuggable Chrome for the
# chrome-devtools MCP (or any CDP client).
#
# It installs a per-user macOS LaunchAgent that launches Google Chrome with a
# remote-debugging port and a DEDICATED profile dir. A dedicated profile is
# required: Chrome 136+ refuses --remote-debugging-port on the default profile,
# and it keeps your everyday Chrome untouched and running side by side.
#
# Subcommands:
#   setup            Install/refresh the LaunchAgent, (re)start it, and install
#                    the bond-chrome-devtools MCP server pointed at the port.
#   open [URL]       Ensure it's running, open URL (default about:blank), focus.
#   status           Show plist path, load state, port reachability, version.
#   install-mcp      Install/update the bond-chrome-devtools user-scope MCP
#                    server (npx chrome-devtools-mcp --browserUrl=…:PORT).
#   stop             Unload the LaunchAgent (Chrome stays quit until next login).
#   restart          Reload the LaunchAgent and wait for the port.
#   uninstall        Stop and delete the LaunchAgent plist.
#
# Config (env overrides):
#   BOND_CHROME_DEBUG_PORT       default 9222
#   BOND_CHROME_DEBUG_PROFILE    default ~/.chrome-debug
#   BOND_CHROME_BIN              default /Applications/Google Chrome.app/...
#   BOND_CHROME_DEBUG_KEEPALIVE  "1" => relaunch on quit (un-quittable); default off
#   BOND_CHROME_MCP_NAME         user-scope MCP server name; default bond-chrome-devtools
#
set -euo pipefail

LABEL="com.chrome.debug"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
PORT="${BOND_CHROME_DEBUG_PORT:-9222}"
PROFILE="${BOND_CHROME_DEBUG_PROFILE:-$HOME/.chrome-debug}"
CHROME="${BOND_CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
KEEPALIVE="${BOND_CHROME_DEBUG_KEEPALIVE:-0}"
MCP_NAME="${BOND_CHROME_MCP_NAME:-bond-chrome-devtools}"
GUI="gui/$(id -u)"

die() {
  echo "chrome-debug: $*" >&2
  exit 1
}

require_macos() {
  [ "$(uname -s)" = "Darwin" ] || die "this command is macOS-only (uses launchd)."
}

require_chrome() {
  [ -x "$CHROME" ] || die "Chrome not found at: $CHROME (set BOND_CHROME_BIN)."
}

is_up() {
  curl -s -m 2 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1
}

version_line() {
  curl -s -m 2 "http://127.0.0.1:${PORT}/json/version" 2>/dev/null \
    | /usr/bin/python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["Browser"], "-", d["webSocketDebuggerUrl"])' 2>/dev/null
}

write_plist() {
  local keepalive_xml="<false/>"
  [ "$KEEPALIVE" = "1" ] && keepalive_xml="<true/>"
  mkdir -p "$(dirname "$PLIST")"
  cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${CHROME}</string>
        <string>--remote-debugging-port=${PORT}</string>
        <string>--remote-allow-origins=*</string>
        <string>--user-data-dir=${PROFILE}</string>
        <string>--no-first-run</string>
        <string>--no-default-browser-check</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    ${keepalive_xml}
    <key>ProcessType</key>
    <string>Interactive</string>
    <key>StandardOutPath</key>
    <string>/tmp/chrome-debug.out.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/chrome-debug.err.log</string>
</dict>
</plist>
PLIST
}

reload_agent() {
  launchctl bootout "$GUI/$LABEL" >/dev/null 2>&1 || true
  launchctl bootstrap "$GUI" "$PLIST"
}

wait_up() {
  local i
  for i in $(seq 1 30); do
    is_up && return 0
    sleep 0.5
  done
  return 1
}

open_url() {
  local url="${1:-about:blank}"
  curl -s -m 3 -X PUT "http://127.0.0.1:${PORT}/json/new?${url}" >/dev/null 2>&1 || true
  osascript -e 'tell application "Google Chrome" to activate' >/dev/null 2>&1 || true
}

install_mcp() {
  # Install/update the chrome-devtools MCP at user scope, attached to our port.
  # Goes through the `claude` CLI — never edits ~/.claude.json by hand.
  if ! command -v claude >/dev/null 2>&1; then
    echo "chrome-debug: 'claude' CLI not on PATH — skipping MCP install."
    echo "  Add it manually as a user-scope server:"
    echo "    claude mcp add-json ${MCP_NAME} '{\"type\":\"stdio\",\"command\":\"npx\",\"args\":[\"-y\",\"chrome-devtools-mcp@latest\",\"--browserUrl=http://127.0.0.1:${PORT}\"]}' --scope user"
    return 1
  fi
  local json
  json='{"type":"stdio","command":"npx","args":["-y","chrome-devtools-mcp@latest","--browserUrl=http://127.0.0.1:'"${PORT}"'"]}'
  # add-json overwrites a server of the same name, so this is idempotent.
  claude mcp add-json "${MCP_NAME}" "$json" --scope user >/dev/null 2>&1 \
    && echo "chrome-debug: installed user-scope MCP '${MCP_NAME}' -> http://127.0.0.1:${PORT}" \
    || die "failed to install MCP server '${MCP_NAME}' via claude CLI."
}

cmd_install_mcp() {
  install_mcp
  echo "  Reconnect it in Claude Code (/mcp -> ${MCP_NAME} -> Reconnect) or restart."
}

cmd_setup() {
  require_macos
  require_chrome
  write_plist
  reload_agent
  if ! wait_up; then
    die "started the agent but port ${PORT} never came up. Check /tmp/chrome-debug.err.log"
  fi
  echo "chrome-debug: ready on port ${PORT}  ($(version_line))"
  echo "  plist:   ${PLIST}"
  echo "  profile: ${PROFILE}"
  echo "  keepalive: $([ "$KEEPALIVE" = 1 ] && echo on || echo off)"
  echo
  install_mcp || true
  echo
  echo "Next: reconnect the MCP in Claude Code (/mcp -> ${MCP_NAME} -> Reconnect),"
  echo "or restart Claude Code, then it attaches to this debug Chrome."
}

cmd_open() {
  require_macos
  require_chrome
  if ! is_up; then
    [ -f "$PLIST" ] || write_plist
    launchctl kickstart -k "$GUI/$LABEL" >/dev/null 2>&1 || reload_agent
    wait_up || die "port ${PORT} did not come up. Try: chrome-debug setup"
  fi
  open_url "${1:-}"
  echo "chrome-debug: open on port ${PORT}  ($(version_line))"
}

cmd_status() {
  echo "label:   ${LABEL}"
  echo "plist:   ${PLIST} $([ -f "$PLIST" ] && echo '(present)' || echo '(MISSING)')"
  echo "port:    ${PORT}"
  echo "profile: ${PROFILE}"
  if launchctl print "$GUI/$LABEL" >/dev/null 2>&1; then
    echo "agent:   loaded"
  else
    echo "agent:   not loaded"
  fi
  if is_up; then
    echo "chrome:  UP  ($(version_line))"
  else
    echo "chrome:  DOWN / unreachable"
  fi
}

cmd_stop() {
  launchctl bootout "$GUI/$LABEL" >/dev/null 2>&1 \
    && echo "chrome-debug: stopped (agent unloaded)" \
    || echo "chrome-debug: agent was not loaded"
}

cmd_restart() {
  require_macos
  [ -f "$PLIST" ] || die "no plist at ${PLIST}; run: chrome-debug setup"
  reload_agent
  wait_up && echo "chrome-debug: restarted, UP on port ${PORT}" \
    || die "restarted but port ${PORT} never came up."
}

cmd_uninstall() {
  launchctl bootout "$GUI/$LABEL" >/dev/null 2>&1 || true
  rm -f "$PLIST"
  echo "chrome-debug: uninstalled (removed ${PLIST}). Profile ${PROFILE} kept."
}

main() {
  local sub="${1:-open}"
  shift || true
  case "$sub" in
    setup) cmd_setup "$@" ;;
    open | start) cmd_open "$@" ;;
    status) cmd_status "$@" ;;
    install-mcp) cmd_install_mcp "$@" ;;
    stop) cmd_stop "$@" ;;
    restart) cmd_restart "$@" ;;
    uninstall) cmd_uninstall "$@" ;;
    *) die "unknown subcommand '$sub'. Use: setup | open [URL] | status | install-mcp | stop | restart | uninstall" ;;
  esac
}

main "$@"
