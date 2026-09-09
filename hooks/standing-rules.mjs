#!/usr/bin/env node
/**
 * SessionStart hook — prints shared/standing-rules.md so the plugin carries the
 * rules that used to sit in a personal ~/.claude/CLAUDE.md. A plugin has no
 * declarative way to ship always-on instructions (skills and agents load on
 * demand; there is no auto-loaded plugin CLAUDE.md), so a hook writing them to
 * stdout is the only mechanism, and stdout on exit 0 lands in context verbatim.
 *
 * Registered with no matcher, so it runs on every start reason — startup,
 * resume, clear, compact, fork. Rules that do not survive a compaction quietly
 * stop applying halfway through a long session.
 *
 * Any failure exits 0 with nothing printed — a session that starts without the
 * rules is a worse session, but a session that will not start is a broken tool.
 * The rendering itself lives in render-rules.mjs, where it is unit-tested.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { pickName, renderRules } from "./render-rules.mjs";

const RULES = join(
  process.env.CLAUDE_PLUGIN_ROOT ??
    join(dirname(fileURLToPath(import.meta.url)), ".."),
  "shared",
  "standing-rules.md",
);

function gitUserName() {
  try {
    return execFileSync("git", ["config", "user.name"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

try {
  const name = pickName(process.env.BOND_USER_NAME, gitUserName());
  // Never process.exit() after this: stdout is a pipe, so an explicit exit can
  // cut the write off mid-flush and deliver a truncated ruleset. Falling off the
  // end exits 0 once the buffer has drained.
  process.stdout.write(renderRules(readFileSync(RULES, "utf8"), name));
} catch {
  // Nothing to say; a missing or unreadable rules file must not block the session.
}
