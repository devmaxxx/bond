#!/usr/bin/env node
/**
 * SessionStart and UserPromptSubmit hook, run async — when the home volume has
 * less than 5 GiB free, cleans the package-manager caches that rebuild
 * themselves and says what it got back on the next turn.
 *
 * Under a few GiB macOS starts failing in ways that do not look like a full
 * disk: a build dies mid-write, a transcript stops saving, a turn ends on a
 * tool error nobody can explain. Caches are rarely the cause, but they are the
 * one part that can be cleared with no judgement, so the hook clears them and
 * leaves the rest — runaway logs, deleted-but-open files — to
 * /bond:disk-analyze, which needs a human to read its findings.
 *
 * The cleaning goes through scripts/disk-analyze.sh, which refuses a cache a
 * running process holds. The Trash and the Chrome debug profile are never in
 * the list: one holds what the user moved there to keep recoverable, the other
 * holds sign-ins.
 *
 * Once a clean has run, the next one waits an hour — across every session,
 * since they share one disk. Any failure exits 0 with nothing printed.
 */

import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, statSync, statfsSync, utimesSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GIB = 1024 ** 3;
export const MIN_FREE_BYTES = Number(process.env.BOND_DISK_MIN_FREE_GB || 5) * GIB;
const CLEAN_EVERY_MS = 60 * 60 * 1000;
const CLEAN_TIMEOUT_MS = 10 * 60 * 1000;
export const AUTO_CLEAN_KEYS = ["pnpm", "npm", "yarn", "uv", "pip", "go", "gradle", "xcode-di"];

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "disk-analyze.sh");
const STAMP = join(homedir(), ".claude", "bond", "disk-guard.stamp");

export function freeBytes(path = homedir()) {
  const { bavail, bsize } = statfsSync(path);
  return bavail * bsize;
}

export function gib(bytes) {
  return `${(bytes / GIB).toFixed(1)} GiB`;
}

/**
 * The note for the next turn. `cleaned` is the script's report lines, or null
 * when no clean ran (another platform, or one ran within the hour).
 */
export function report({ before, after, cleaned, platform }) {
  const lines = [`Disk: ${gib(before)} free on the home volume, under ${gib(MIN_FREE_BYTES)}.`];
  if (platform !== "darwin") {
    lines.push("Free space before long builds or installs; the cache cleaner is macOS-only.");
    return lines.join(" ");
  }
  if (cleaned === null) {
    lines.push("Caches were auto-cleaned within the last hour; what is left is not cache.");
  } else {
    const done = cleaned.filter((line) => /^(CLEAN|SKIP)/.test(line));
    lines.push(
      `Auto-cleaned caches (${done.length > 0 ? done.join("; ") : "nothing to clean"}). Now ${gib(after)} free.`,
    );
  }
  if (after < MIN_FREE_BYTES) {
    lines.push(
      "Still low — tell the user and run /bond:disk-analyze scan to find the real cause (usually one runaway file).",
    );
  }
  return lines.join(" ");
}

// The stamp's mtime is the last clean; creating it with `wx` is the lock, so
// two sessions that start together do not both run the cleaner.
function claimClean(now) {
  mkdirSync(dirname(STAMP), { recursive: true });
  try {
    closeSync(openSync(STAMP, "wx"));
    return true;
  } catch {
    if (now - statSync(STAMP).mtimeMs < CLEAN_EVERY_MS) {
      return false;
    }
    utimesSync(STAMP, now / 1000, now / 1000);
    return true;
  }
}

function clean() {
  const run = spawnSync(SCRIPT, ["clean", ...AUTO_CLEAN_KEYS], {
    encoding: "utf8",
    timeout: CLEAN_TIMEOUT_MS,
  });
  // The script exits 1 when it skipped a busy or absent cache; its lines still
  // say what it did.
  return (run.stdout ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
}

function main() {
  const payload = readPayload();
  const before = freeBytes();
  if (before >= MIN_FREE_BYTES) {
    return;
  }
  const platform = process.platform;
  const cleaned = platform === "darwin" && claimClean(Date.now()) ? clean() : null;
  const message = report({ before, after: freeBytes(), cleaned, platform });
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: payload?.hook_event_name ?? "UserPromptSubmit",
        additionalContext: message,
      },
    })}\n`,
  );
}

function readPayload() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch {
    // A full disk is exactly when a write here can fail; silence beats a hook
    // error on top of it. Falling off the end lets stdout drain.
  }
}
