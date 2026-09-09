#!/usr/bin/env node
/**
 * SessionStart hook — prints shared/standing-rules.md so the plugin carries the
 * rules that used to sit in a personal ~/.claude/CLAUDE.md. A plugin has no
 * declarative way to ship always-on instructions (skills and agents load on
 * demand; there is no auto-loaded plugin CLAUDE.md), so a hook writing them to
 * stdout is the only mechanism, and stdout on exit 0 lands in context verbatim.
 *
 * Runs on startup, resume, clear and compact: the rules have to survive a
 * compaction, or a long session quietly reverts to default behaviour.
 *
 * Any failure exits 0 with nothing printed — a session that starts without the
 * rules is a worse session, but a session that will not start is a broken tool.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RULES = join(
  process.env.CLAUDE_PLUGIN_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), ".."),
  "shared",
  "standing-rules.md",
);

/** The name is per-person, so it never ships in the file itself. */
function userName() {
  const configured = process.env.BOND_USER_NAME?.trim();
  if (configured) {
    return configured;
  }
  try {
    return execFileSync("git", ["config", "user.name"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

try {
  const name = userName();
  const file = readFileSync(RULES, "utf8");
  // The file opens with a note to whoever reads it in the repo. That is not an
  // instruction to the session, so context starts at the first rule heading.
  const firstRule = file.search(/^## /m);
  const rules = firstRule === -1 ? file : file.slice(firstRule);
  // Without a name the greeting rule is noise, so drop that section instead of
  // printing an instruction to address the user as nobody.
  const body = name
    ? rules.replaceAll("{{NAME}}", name)
    : rules.replace(/^## Name\n[\s\S]*?(?=^## )/m, "");
  // Never process.exit() after this: stdout is a pipe, so an explicit exit can
  // cut the write off mid-flush and deliver a truncated ruleset. Falling off the
  // end exits 0 once the buffer has drained.
  process.stdout.write(`${body.trim()}\n`);
} catch {
  // Nothing to say; a missing or unreadable rules file must not block the session.
}
