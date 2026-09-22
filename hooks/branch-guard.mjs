#!/usr/bin/env node
/**
 * SessionStart + UserPromptSubmit hook — records the branch a session opened on
 * and, once, tells the session when the working tree has moved to another one.
 * A session that outlives its branch keeps paying for the first branch's files
 * on every turn spent on the second, and nothing in the transcript says so.
 *
 * The nudge fires once per session: a repeated reminder costs the very tokens
 * it is trying to save, and the second time it is no longer news.
 *
 * Any failure exits 0 with nothing printed — a missed nudge is a worse session,
 * a hook that throws is a broken prompt. The decision lives in `decide`, where
 * it is unit-tested; everything below it is the I/O around that.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const NOTHING = {
  message: null,
  record: null,
  markNudged: false,
  resetNudged: false,
};

/**
 * `current` is null for a detached HEAD or a directory that is not a git tree:
 * there is no branch to record, and nothing a later turn could differ from.
 */
export function decide({ event, recorded, current, nudged }) {
  if (!current) {
    return NOTHING;
  }
  if (event === "SessionStart") {
    // A start re-arms the nudge along with the baseline it records: resume and
    // compact reuse the session id, so a session nudged before a compaction
    // would otherwise never mention its next drift.
    return {
      message: null,
      record: current,
      markNudged: false,
      resetNudged: true,
    };
  }
  // No record means the session started before this hook could write one, or
  // tmp is unwritable — either way "the branch moved" cannot be established.
  if (!recorded || recorded === current || nudged) {
    return NOTHING;
  }
  return {
    message: `branch changed since this session started (${recorded} → ${current}) — /clear and reopen in that worktree: a session that carries two branches pays the first one on every turn of the second.`,
    record: null,
    markNudged: true,
    resetNudged: false,
  };
}

function currentBranch(cwd) {
  try {
    const branch = execFileSync(
      "git",
      ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"],
      {
        encoding: "utf8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    // A detached checkout answers with the literal word HEAD.
    if (branch === "HEAD" || branch === "") {
      return null;
    }
    return branch;
  } catch {
    return null;
  }
}

function read(path) {
  try {
    return readFileSync(path, "utf8").trim() || null;
  } catch {
    return null;
  }
}

function write(path, text) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  } catch {
    // An unwritable tmp costs a nudge, or repeats one. Neither is worth a throw.
  }
}

function remove(path) {
  try {
    rmSync(path, { force: true });
  } catch {
    // The marker outlives the start that meant to clear it; the session keeps
    // the nudge it already had rather than losing the prompt.
  }
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return;
  }
  const session = payload?.session_id;
  if (!session) {
    return;
  }

  const state = join(tmpdir(), "bond", `${session}.branch`);
  const nudgedAt = `${state}.nudged`;
  const { message, record, markNudged, resetNudged } = decide({
    event: payload.hook_event_name,
    recorded: read(state),
    current: currentBranch(payload.cwd ?? process.cwd()),
    nudged: existsSync(nudgedAt),
  });

  // The two state files degrade in opposite directions, and that is deliberate.
  // A baseline that cannot be written leaves nothing to compare a later branch
  // against, so the session stays silent rather than guessing. The marker below
  // is the half that degrades to saying it every time: if it cannot be written,
  // every drifted turn nudges again, which is noisy but never wrong.
  if (record !== null) {
    write(state, `${record}\n`);
  }
  if (resetNudged) {
    remove(nudgedAt);
  }
  if (markNudged) {
    write(nudgedAt, "");
  }
  if (message !== null) {
    // Never process.exit() after this: stdout is a pipe, and an explicit exit
    // can cut the write off mid-flush.
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: payload.hook_event_name,
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
    // main() returns quietly on the failures it anticipates; this is for the
    // ones it does not. An uncaught throw exits nonzero and the session reports
    // a hook error, and a nudge that cannot be made is worth no more noise than
    // silence. Falling off the end exits 0 once stdout has drained; an explicit
    // exit here could cut a write mid-flush.
  }
}
