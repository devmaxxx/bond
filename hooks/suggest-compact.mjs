#!/usr/bin/env node
/**
 * PreToolUse hook on every tool — counts the calls a session has made and,
 * at 50 and every 25 after, says one line about compacting.
 *
 * Auto-compaction fires when the window is full, which is wherever the work
 * happens to be: mid-edit, half a plan in flight. A compaction chosen at a
 * boundary — the plan is written, the PR is open, the bug is found — keeps
 * what the next phase needs and drops what it does not. Only the model can see
 * the boundary, so the hook does not compact; it reminds, and the count is the
 * cheapest signal that a reminder is due.
 *
 * `reset` runs on PreCompact: after a compaction the count starts over.
 *
 * Any failure exits 0 with nothing printed. Adapted from the strategic-compact
 * hook of everything-claude-code (Affaan Mustafa, MIT).
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const FIRST_AT = 50;
const EVERY = 25;

/** The call count after this call, and the line to say, or null. */
export function judge(previous) {
  const calls = previous + 1;
  const due = calls >= FIRST_AT && (calls - FIRST_AT) % EVERY === 0;
  return {
    calls,
    message: due
      ? `${calls} tool calls since the last compaction. If a phase just ended — plan written, PR opened, root cause found — /compact now keeps the next phase cheap. Mid-task, carry on.`
      : null,
  };
}

function statePath(session) {
  return join(tmpdir(), "bond", `${session}.tool-calls`);
}

function readCount(path) {
  try {
    const count = Number.parseInt(readFileSync(path, "utf8"), 10);
    return Number.isFinite(count) && count >= 0 ? count : 0;
  } catch {
    return 0;
  }
}

function main() {
  const payload = JSON.parse(readFileSync(0, "utf8"));
  const session = payload?.session_id;
  if (!session) {
    return;
  }
  const path = statePath(session);
  if (process.argv[2] === "reset") {
    rmSync(path, { force: true });
    return;
  }
  const { calls, message } = judge(readCount(path));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${calls}\n`);
  if (message !== null) {
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: message,
        },
      })}\n`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch {
    // A reminder that cannot be made is worth no more noise than silence.
  }
}
