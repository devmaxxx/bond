---
description: Set up / open an always-on debuggable Chrome (LaunchAgent) and install the chrome-devtools MCP pointed at it
---

# /bond:chrome-debug

Manage an always-on, **debuggable** Chrome that the `chrome-devtools` MCP (and any
CDP client) can attach to, and install/point that MCP at it. This lets Claude
drive a **real, logged-in browser** — your SSO session persists in a dedicated
profile — instead of the MCP's throwaway browser.

It does two things:

1. **LaunchAgent** — installs a per-user macOS LaunchAgent
   (`~/Library/LaunchAgents/com.chrome.debug.plist`) that runs Google Chrome with
   `--remote-debugging-port` and a **dedicated** `--user-data-dir`. The dedicated
   profile is mandatory: Chrome 136+ refuses remote debugging on the default
   profile, and it keeps your everyday Chrome untouched and running side by side.
2. **MCP** — installs/updates a user-scope `bond-chrome-devtools` MCP server
   (`npx chrome-devtools-mcp@latest --browserUrl=http://127.0.0.1:<port>`) so the
   MCP **attaches** to that debug Chrome rather than launching its own.

Both are driven by `${CLAUDE_PLUGIN_ROOT}/scripts/chrome-debug.sh`. macOS only.

## Input

`$ARGUMENTS` — optional subcommand, then args. Defaults to `setup` when empty.

| Subcommand        | Effect                                                                 |
| ----------------- | ---------------------------------------------------------------------- |
| `setup` (default) | Install/refresh the LaunchAgent, start it, **and** install the MCP.    |
| `open [URL]`      | Ensure it's running, open `URL` (default `about:blank`), focus Chrome. |
| `status`          | Show plist path, load state, port reachability, Chrome version.        |
| `install-mcp`     | Only (re)install the `bond-chrome-devtools` user-scope MCP server.     |
| `restart`         | Reload the LaunchAgent and wait for the port.                          |
| `stop`            | Unload the LaunchAgent (Chrome stays quit until next login).           |
| `uninstall`       | Stop and delete the LaunchAgent plist (profile dir is kept).           |

Optional env overrides the user can export (the script reads them):
`BOND_CHROME_DEBUG_PORT` (default `9222`), `BOND_CHROME_DEBUG_PROFILE`
(default `~/.chrome-debug`), `BOND_CHROME_BIN`, `BOND_CHROME_DEBUG_KEEPALIVE`
(`1` = relaunch on quit), `BOND_CHROME_MCP_NAME` (default `bond-chrome-devtools`).

## Steps

### 1. Run the script

Run the script with the requested subcommand (default `setup`):

```sh
"${CLAUDE_PLUGIN_ROOT}/scripts/chrome-debug.sh" <subcommand> [args]
```

The script is idempotent: re-running `setup` rewrites the plist, reloads the
agent, and re-adds the MCP server (overwriting the same-named one). It needs the
`claude` CLI on PATH to install the MCP; if it is missing, it prints the exact
`claude mcp add-json …` command to run instead — relay that to the user.

### 2. Report

Relay the script's output: the port, whether Chrome came up, the plist/profile
paths, and whether the `bond-chrome-devtools` MCP server was installed.

### 3. Tell the user what's left to do

After `setup` or `install-mcp`, the MCP server change is **not live** until the
MCP is reconnected. Tell the user to either:

- run `/mcp` → select **bond-chrome-devtools** → **Reconnect**, or
- restart Claude Code.

Then a **one-time login**: the dedicated profile is fresh, so the first time they
open an authenticated URL (e.g. via `open <url>`) they must sign in once; the
session persists in `~/.chrome-debug` across restarts.

If `setup` reported the port never came up, point the user at
`/tmp/chrome-debug.err.log`.

## Do NOT

- Do not edit `~/.claude.json` directly — MCP install goes through the `claude`
  CLI inside the script (`claude mcp add-json … --scope user`).
- Do not enable remote debugging on the user's default Chrome profile — always use
  the dedicated profile dir (Chrome 136+ blocks the default profile anyway).
- Do not run on non-macOS — the script aborts there (it relies on `launchd`).
