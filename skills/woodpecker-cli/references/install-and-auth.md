# Before anything: check what is installed

Woodpecker renamed and reshuffled commands between v1 → v2 → v3. Flags in this
skill are the stable core; **when a flag or subcommand is uncertain, run
`--help` rather than guessing** — a wrong flag silently targets the wrong repo
on some subcommands.

```sh
command -v woodpecker-cli || command -v woodpecker
woodpecker-cli --version
```

Older installs expose the binary as `woodpecker`; v2+ ships it as
`woodpecker-cli`. Use whichever resolves.

If it is missing, install it:

```sh
brew install woodpecker-cli                                     # macOS
go install go.woodpecker-ci.org/woodpecker/v3/cmd/cli@latest    # any platform
```

# Auth

Two credentials, both required:

| Variable | Value |
| --- | --- |
| `WOODPECKER_SERVER` | Server base URL, e.g. `https://ci.example.com` — no trailing slash, no `/api` suffix |
| `WOODPECKER_TOKEN` | Personal access token from the server UI, under user settings / "CLI usage" |

Resolution order, highest first:

1. Explicit flags — `--server` / `-s`, `--token` / `-t`.
2. Environment — `WOODPECKER_SERVER`, `WOODPECKER_TOKEN`.
3. Config file — `~/.config/woodpecker/config.json`, written by
   `woodpecker-cli login`.

In a bond setup the two variables live in `~/.claude/settings.json` under `env`
(written by `/bond-bonliva:setup-plugin`), so they are already exported for Bash tool
calls. `woodpecker-cli login` is the interactive alternative — it opens a
browser and persists the token to the config file, which survives outside
Claude Code sessions.

Verify auth with one call — it is the cheapest round-trip:

```sh
woodpecker-cli info
```

Failure to authenticate shows as `401`/`Unauthorized`, not as an empty list.
Treat an empty `repo ls` as "token has no repo access", not as "no repos exist".
