---
description: Analyze disk usage on macOS — find runaway logs, deleted-but-open files, and cache candidates, then clean the safe ones
---

# /bond:disk-analyze

Find out where the disk went, and reclaim it **without breaking anything that is
still running**. macOS only.

The mechanics live in `${CLAUDE_PLUGIN_ROOT}/scripts/disk-analyze.sh`; this
command is the judgment on top of its output.

Why a script instead of `ncdu`: `ncdu` is a TUI and cannot be driven by an agent
(and `sudo ncdu` blocks on a password prompt that Claude cannot answer). The
script is line-oriented, unprivileged, and reports the two things a raw `du`
never tells you: **who holds a file open**, and **which caches are in use**.

## Input

`$ARGUMENTS` — optional subcommand. Defaults to `scan`.

| Subcommand      | Effect                                                                    |
| --------------- | ------------------------------------------------------------------------- |
| `scan` (default)| Capacity, largest dirs, runaway files + holders, deleted-but-open, caches. |
| `capacity`      | `df` plus a low-space warning.                                            |
| `top`           | Largest directories (firmlink mirrors excluded).                          |
| `runaways`      | Files ≥ 1G, each with the processes holding it open.                      |
| `open-deleted`  | Deleted-but-still-open files — space `du` and `find` cannot see.          |
| `caches`        | Cache candidates, sized, each marked `safe` or `BLOCKED` with the reason. |
| `clean <key>`   | Clean named caches; refuses blocked ones. `clean safe` = all unblocked.   |

Env: `BOND_DISK_BIG_FILE` (default `1G`), `BOND_DISK_TOP_N` (default `25`).

## Steps

### 1. Run the scan

```sh
"${CLAUDE_PLUGIN_ROOT}/scripts/disk-analyze.sh" <subcommand>
```

Read-only for every subcommand except `clean`.

### 2. Find the actual problem before reciting the list

A near-full disk is usually **one runaway file**, not the sum of the caches.
Check `runaways` and `open-deleted` first — caches are the boring tail. Report
the single biggest cause first and lead with it.

For any runaway file, before recommending deletion:

- **Name the holder.** The script runs `lsof` for you. If a process holds the
  file open, `rm` frees **nothing** until that pid exits — the kernel keeps
  unlinked-but-open files allocated. Recommending a bare `rm` there is wrong and
  the user will see no space come back.
- **Find the bug that made it.** `tail -c 3000 <file>` — a runaway log is
  usually one line repeated a few hundred million times. Read that line, find
  the code that emits it, and report the fix. Deleting the file without fixing
  the loop just schedules the same incident.
- **Check whether it is still growing:** compare `stat -f %z` a few seconds
  apart, or read the mtime.

### 3. Interpret the numbers honestly

- **Firmlink mirrors** — `/System/Volumes/Data/Users` *is* `/Users`, not a copy.
  The script skips the mirror; if the user ever runs a raw `du /`, expect the
  total to roughly double. Never report the mirrored total as real usage.
- **`du` vs `df` disagreement** — if `df` says the disk is full but `du` cannot
  find the bytes, that is `open-deleted`: a process is holding deleted files.
  Also suspect APFS local Time Machine snapshots (`tmutil listlocalsnapshots /`).

### 4. Clean only what is safe

```sh
"${CLAUDE_PLUGIN_ROOT}/scripts/disk-analyze.sh" clean safe
```

The script probes each cache and refuses the ones in use. Do not override those
probes — the common blockers, and why forcing them is a bad trade:

| Cache          | Typical blocker                                                | Why not force                                                        |
| -------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| `uv`           | `~/.cache/uv/.lock` held by long-lived `uv tool uvx` MCP servers | `--force` yanks the cache from running servers — including Claude's own MCP tools. Needs Claude Code quit first. |
| `npm`          | root-owned files from a stray `sudo npm`                        | Needs `sudo chown` — a password Claude cannot type. Relay the command. |
| `chrome-debug` | Chrome running on that `--user-data-dir`                        | Deleting a live profile corrupts it and kills the user's logged-in session (see `/bond:chrome-debug`). |
| `gradle`       | Gradle daemon running                                           | Corrupts in-flight builds.                                           |

When a cache is blocked, **hand the user the exact command** to run themselves
(a `sudo …` line, or "quit X first, then …") rather than working around it.

### 5. Things that need the user's call — ask, don't assume

- **iOS simulator runtimes** (often 8–16 GB) — redownloadable, but that is a
  multi-GB download before their next simulator run. List them
  (`xcrun simctl runtime list`) and let the user pick which, if any.
- **Database dumps, `.sql` files, project archives** — these look like cache and
  are not. Never delete them; surface and ask.
- **Killing a process to free a held file** — say which process, how long it has
  run, and whether it is orphaned (`PPID 1`), then let the user decide.

### 6. Report

Lead with the single biggest reclaimable item and the before/after free space.
Then: what was cleaned, what was skipped and why, and the exact commands the
user must run themselves. If a runaway file came from a bug, include the fix.

## Do NOT

- Do not run `ncdu` interactively, and do not reach for `sudo` — it prompts for a
  password Claude cannot answer, and the unprivileged scan finds the culprit
  anyway (the big stuff is almost always user-owned).
- Do not recommend `rm` on a file some process holds open without also naming the
  process to stop. It frees nothing and looks like the tool lied.
- Do not force a cache clean past its in-use probe.
- Do not delete database dumps, project archives, or simulator runtimes on your
  own initiative — ask.
- Do not report the `/System/Volumes/Data` mirror as additional usage.

## Notes

- Everything except `clean` is read-only.
- The script is bash 3.2 compatible (macOS system bash) — no associative arrays.
- Under ~10 GiB free, macOS starts failing builds and stalling Time Machine; the
  script warns at that line.
