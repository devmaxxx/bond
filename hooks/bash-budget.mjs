#!/usr/bin/env node
/**
 * PreToolUse hook on Bash — two nudges about what a call costs the context,
 * and silence otherwise. Measured over thirty days in one repo: 6481 Bash
 * calls averaging 1.6 KB of output. The output is not the price; re-reading
 * the whole conversation on every one of those calls is. So a row of ten calls
 * that each carry a single command is worth one word about chaining them, and
 * a call whose output has no bound is worth one word about bounding it.
 *
 * Nothing here decides anything: the command runs either way. Any failure
 * exits 0 with nothing printed — a missed nudge is a slightly worse session, a
 * hook that throws is a broken tool call. The rule lives in `judge`, where it
 * is unit-tested; everything below it is the I/O around that.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const BATCH_AT = 10;

const NUDGE = {
  batch:
    "10 Bash calls in a row, one command each — every call re-reads the whole context. Chain the next ones with && or ; in one call, or hand the loop to a subagent.",
  gitLog: "git log without a bound — add -n 20 or --oneline.",
  cat: "cat of a whole file — sed -n 'a,bp' the range you need.",
  listing: "unbounded listing — add -maxdepth or | head -50.",
  testRun:
    "test run without a terse reporter — --reporter=dot, or hand it to TestRunner.",
};

const SEPARATORS = ["&&", "||", ";", "|", "\n"];
const HEREDOC_OPEN = /^<<-?\s*(["']?)([A-Za-z_]\w*)\1/;

const GIT_LOG = /^git\s+log\b/;
const GIT_LOG_BOUND = /(?:^|\s)(?:-n\d*\b|--max-count|--oneline|-\d+\b)/;
const CAT_ONE_PATH = /^cat\s+[^\s<>-]\S*$/;
const LS = /^ls\b/;
const LS_RECURSIVE = /(?:^|\s)-\w*R/;
const FIND = /^find\b/;
const MAXDEPTH = /(?:^|\s)-maxdepth\b/;
const TEST_RUN = /^(?:vitest\b|pnpm\s+test\b|pnpm\s+turbo\s+run\s+test\b)/;
const REPORTER = /(?:^|\s)--reporter\b/;
const PIPED_TO_HEAD = /^\s*head\b/;

/**
 * An unbalanced quote makes the rest of the command data: better to read one
 * command that ends at the string's end than to find separators in text the
 * shell would never run.
 */
function endOfQuote(command, start) {
  const quote = command[start];
  for (let i = start + 1; i < command.length; i += 1) {
    if (quote === '"' && command[i] === "\\") {
      i += 1;
    } else if (command[i] === quote) {
      return i + 1;
    }
  }
  return command.length;
}

function endOfHeredoc(command, from, delimiter) {
  const terminator = new RegExp(`^[ \\t]*${delimiter}[ \\t]*$`, "m");
  const match = terminator.exec(command.slice(from));
  if (match === null) {
    return command.length;
  }
  return from + match.index + match[0].length;
}

function separatorAt(command, i) {
  return (
    SEPARATORS.find((separator) => command.startsWith(separator, i)) ?? null
  );
}

/**
 * The command up to its first separator, the separator itself, and what
 * follows — enough for both questions this hook asks, and no more. Quotes,
 * heredoc bodies and `$(…)` substitutions are part of the one command that
 * spells them, so separators inside them do not count.
 */
function split(command) {
  let pending = null;
  let depth = 0;
  let i = 0;
  while (i < command.length) {
    const char = command[i];
    if (char === "\\") {
      i += 2;
    } else if (char === "'" || char === '"') {
      i = endOfQuote(command, i);
    } else if (char === "$" && command[i + 1] === "(") {
      depth += 1;
      i += 2;
    } else if (depth > 0 && (char === "(" || char === ")")) {
      depth += char === "(" ? 1 : -1;
      i += 1;
    } else if (char === "\n" && pending !== null) {
      i = endOfHeredoc(command, i + 1, pending);
      pending = null;
    } else if (command.startsWith("<<", i)) {
      const opened = HEREDOC_OPEN.exec(command.slice(i));
      pending = opened === null ? pending : opened[2];
      i += opened === null ? 2 : opened[0].length;
    } else {
      const separator = depth === 0 ? separatorAt(command, i) : null;
      if (separator !== null) {
        return {
          head: command.slice(0, i),
          separator,
          rest: command.slice(i + separator.length),
        };
      }
      i += 1;
    }
  }
  return { head: command, separator: null, rest: "" };
}

function isUnboundedListing(segment) {
  if (LS.test(segment)) {
    return LS_RECURSIVE.test(segment);
  }
  return FIND.test(segment) && !MAXDEPTH.test(segment);
}

/**
 * Read off the first pipeline segment: a flag in a later one bounds that
 * command's output, not this one's. `| head` is the exception, because it
 * bounds whatever it is fed.
 */
function shapeNudge({ head, separator, rest }) {
  const segment = head.trim();
  const bounded = separator === "|" && PIPED_TO_HEAD.test(rest);
  if (GIT_LOG.test(segment)) {
    return GIT_LOG_BOUND.test(segment) || bounded ? null : NUDGE.gitLog;
  }
  if (CAT_ONE_PATH.test(segment)) {
    // A pipe hands the bytes to the next command rather than to the
    // transcript, whatever that command is, so nothing here needs bounding.
    return separator === "|" ? null : NUDGE.cat;
  }
  if (isUnboundedListing(segment)) {
    return bounded ? null : NUDGE.listing;
  }
  if (TEST_RUN.test(segment) && !REPORTER.test(segment)) {
    return NUDGE.testRun;
  }
  return null;
}

/**
 * `singles` is how many calls in a row have each carried one command. The
 * batch nudge wins over a shape nudge on the same call: it is the larger of
 * the two costs, and two lines of advice at once is one line too many.
 */
export function judge(command, singles) {
  const parts = split(command);
  const next = parts.separator === null ? singles + 1 : 0;
  if (next >= BATCH_AT) {
    return { message: NUDGE.batch, singles: 0 };
  }
  return { message: shapeNudge(parts), singles: next };
}

function readCount(path) {
  try {
    const count = Number.parseInt(readFileSync(path, "utf8"), 10);
    return Number.isInteger(count) ? count : 0;
  } catch {
    // A counter that cannot be read costs the batch nudge and nothing else —
    // the shape nudges never look at it.
    return 0;
  }
}

function writeCount(path, count) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${count}\n`);
  } catch {
    // An unwritable tmp pins the row at one, so the batch nudge never fires.
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
  const command = payload?.tool_input?.command;
  if (!session || typeof command !== "string") {
    return;
  }

  const state = join(tmpdir(), "bond", `${session}.bash-singles`);
  const { message, singles } = judge(command, readCount(state));
  writeCount(state, singles);
  if (message !== null) {
    // Context only, never a permissionDecision: this hook has an opinion about
    // the shape of a command, not about whether it may run. `updatedInput`
    // needs a decision to go with it, and the only decision that would carry a
    // rewrite is "allow" — which would approve a command nobody has seen.
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
  main();
}
