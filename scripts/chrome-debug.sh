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
#   open [URL]       Ensure it's running; open URL in a new tab if given (else
#                    just focus the window), and bring Chrome to the front.
#   status           Show plist path, load state, port reachability, version.
#   install-mcp      Install/update the bond-chrome-devtools user-scope MCP
#                    server (npx chrome-devtools-mcp --browserUrl=…:PORT).
#   stop             Unload the LaunchAgent (Chrome stays quit until next login).
#   restart          Reload the LaunchAgent and wait for the port.
#   uninstall        Stop and delete the LaunchAgent plist.
#   desktop-icon     Drop a double-clickable "Chrome Debug.command" on the
#                    Desktop, with a Chrome+bug icon, that runs `open`.
#
# Config (env overrides):
#   BOND_CHROME_DEBUG_PORT       default 9222
#   BOND_CHROME_DEBUG_PROFILE    default ~/.chrome-debug
#   BOND_CHROME_BIN              default /Applications/Google Chrome.app/...
#   BOND_CHROME_DEBUG_KEEPALIVE  "1" => relaunch on quit (un-quittable); default off
#   BOND_CHROME_MCP_NAME         user-scope MCP server name; default bond-chrome-devtools
#   BOND_CHROME_DESKTOP_LAUNCHER desktop-icon target; default ~/Desktop/Chrome Debug.command
#
set -euo pipefail

SELF="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )/$( basename "${BASH_SOURCE[0]}" )"
LABEL="com.chrome.debug"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
DESKTOP_LAUNCHER="${BOND_CHROME_DESKTOP_LAUNCHER:-$HOME/Desktop/Chrome Debug.command}"
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
  local url="${1:-}"
  # Only spawn a tab when a URL is given; otherwise just focus the window.
  if [ -n "$url" ]; then
    curl -s -m 3 -X PUT "http://127.0.0.1:${PORT}/json/new?${url}" >/dev/null 2>&1 || true
  fi
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

# Drop a double-clickable launcher on the Desktop that runs `open`, and give it
# Chrome's icon. Must run in the user's own session (not a sandboxed/headless
# one) so it has macOS Desktop-folder (TCC) access.
cmd_desktop_icon() {
  require_macos
  require_chrome
  mkdir -p "$(dirname "$DESKTOP_LAUNCHER")" 2>/dev/null || \
    die "can't access $(dirname "$DESKTOP_LAUNCHER") — run this from your own Terminal so it has Desktop permission."
  # Quoted heredoc => nothing expands; __SELF__ is substituted afterward. The
  # close targets the window by its tty (titles escape the space) and runs
  # detached (&!) after the shell exits, so Terminal won't prompt about a
  # running process.
  cat >"$DESKTOP_LAUNCHER" <<'LAUNCHER'
#!/bin/zsh
# Double-clickable launcher for the always-on debuggable Chrome.
# Starts it if needed, opens a fresh New Tab, then closes this Terminal window.
"__SELF__" open "chrome://newtab/" >/dev/null 2>&1
TTY=$(tty)
( sleep 0.3; /usr/bin/osascript \
    -e 'tell application "Terminal"' \
    -e 'repeat with w in windows' \
    -e "if tty of selected tab of w is \"$TTY\" then close w" \
    -e 'end repeat' \
    -e 'end tell' ) >/dev/null 2>&1 &!
exit 0
LAUNCHER
  /usr/bin/sed -i '' "s|__SELF__|${SELF}|g" "$DESKTOP_LAUNCHER"
  chmod +x "$DESKTOP_LAUNCHER"

  # Set the launcher icon: Chrome's icon with a debug-bug badge composited on
  # (best-effort; needs swift). Falls back to the plain Chrome icon if drawing
  # fails. Done in-memory and applied via NSWorkspace.setIcon — no .icns file.
  local icns="${CHROME%/Contents/MacOS/*}/Contents/Resources/app.icns"
  if command -v swift >/dev/null 2>&1 && [ -f "$icns" ]; then
    local swiftsrc; swiftsrc="$(mktemp -t seticon).swift"
    cat >"$swiftsrc" <<'SWIFT'
import Cocoa
let a = CommandLine.arguments
guard let base = NSImage(contentsOfFile: a[1]) else { exit(1) }
let size = NSSize(width: 512, height: 512)
let out = NSImage(size: size)
out.lockFocus()
base.draw(in: NSRect(origin: .zero, size: size))
// Bottom-right badge: white disc + bug emoji.
let d: CGFloat = 240, pad: CGFloat = 6
let badge = NSRect(x: size.width - d - pad, y: pad, width: d, height: d)
NSColor.white.setFill()
NSBezierPath(ovalIn: badge).fill()
NSColor(white: 0, alpha: 0.12).setStroke()
let ring = NSBezierPath(ovalIn: badge.insetBy(dx: 1, dy: 1)); ring.lineWidth = 2; ring.stroke()
let emoji = "🐛" as NSString
let f = NSFont.systemFont(ofSize: d * 0.66)
let es = emoji.size(withAttributes: [.font: f])
emoji.draw(at: NSPoint(x: badge.midX - es.width/2, y: badge.midY - es.height/2),
           withAttributes: [.font: f])
out.unlockFocus()
exit(NSWorkspace.shared.setIcon(out, forFile: a[2], options: []) ? 0 : 1)
SWIFT
    if swift "$swiftsrc" "$icns" "$DESKTOP_LAUNCHER" >/dev/null 2>&1; then
      echo "chrome-debug: desktop launcher created with Chrome+bug icon:"
    else
      # Fall back to the plain Chrome icon.
      swift - "$icns" "$DESKTOP_LAUNCHER" >/dev/null 2>&1 <<'PLAIN' || true
import Cocoa
let a = CommandLine.arguments
if let img = NSImage(contentsOfFile: a[1]) { _ = NSWorkspace.shared.setIcon(img, forFile: a[2], options: []) }
PLAIN
      echo "chrome-debug: desktop launcher created (badge step failed, plain icon):"
    fi
    rm -f "$swiftsrc"
  else
    echo "chrome-debug: desktop launcher created (no icon — swift or app.icns missing):"
  fi
  echo "  ${DESKTOP_LAUNCHER}"
  echo "  Double-click it to open the debug Chrome."
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
    desktop-icon | desktop) cmd_desktop_icon "$@" ;;
    *) die "unknown subcommand '$sub'. Use: setup | open [URL] | status | install-mcp | stop | restart | uninstall | desktop-icon" ;;
  esac
}

main "$@"
