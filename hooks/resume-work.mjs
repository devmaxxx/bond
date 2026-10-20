#!/usr/bin/env node
/**
 * SessionStart (resume) and UserPromptSubmit hook — when the last turn was cut
 * off by something outside the work, and that something has since cleared,
 * tells the model to pick the task up where it stopped.
 *
 * Three things end a turn mid-task without anyone deciding to stop: a usage
 * limit, an API failure (lost connection, the laptop sleeping, an expired
 * login), and a full disk. Coming back after them, the user types "continue"
 * or just resumes the session, and the model — seeing an error as the last
 * thing in the conversation — tends to summarise, apologise or ask what next.
 * The hook reads the transcript's last turn, names what stopped it and why it
 * no longer applies, and says to continue.
 *
 * A turn the user stopped with Esc is not resumed: that stop was a decision.
 * A disk still under the floor is reported instead of resumed — continuing
 * would hit the same wall.
 *
 * Each pause is announced once per session, so a resume followed by the first
 * prompt does not say it twice. Any failure exits 0 with nothing printed.
 */

import { closeSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { MIN_FREE_BYTES, freeBytes, gib } from "./disk-guard.mjs";

// The last turn is all that matters, and a transcript can run to hundreds of
// megabytes; a tail this size holds any one turn's ending.
const TAIL_BYTES = 512 * 1024;
const HARNESS_WRAPPED = /^\s*<[a-z]+(?:-[a-z]+)+[\s>]/;
const INTERRUPT_MARKER = /^\[Request interrupted by user/;
const DISK_FULL = /No space left on device|ENOSPC/;
// API errors that a retry walks straight back into: the request itself, the
// model or the account is what failed, not the connection.
const WILL_NOT_CLEAR = new Set(["invalid_request", "model_not_found", "billing_error", "account_on_hold", "oauth_org_not_allowed"]);

function texts(content) {
  if (typeof content === "string") {
    return [content];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  return content.flatMap((block) => {
    if (block?.type === "text") {
      return [block.text];
    }
    if (block?.type === "tool_result") {
      return texts(block.content);
    }
    return [];
  });
}

function failedOutput(entry) {
  const blocks = Array.isArray(entry.message?.content) ? entry.message.content : [];
  return blocks.filter((block) => block?.type === "tool_result" && block.is_error === true).flatMap((block) => texts(block.content));
}

function isToolResult(entry) {
  return Array.isArray(entry.message?.content) && entry.message.content.some((block) => block?.type === "tool_result");
}

function isPrompt(entry) {
  if (entry.type !== "user" || entry.isMeta || entry.isCompactSummary || isToolResult(entry) || isInterrupt(entry)) {
    return false;
  }
  return texts(entry.message?.content).some((text) => !HARNESS_WRAPPED.test(text) && text.trim() !== "");
}

function isInterrupt(entry) {
  return entry.type === "user" && texts(entry.message?.content).some((text) => INTERRUPT_MARKER.test(text));
}

/**
 * The turn to judge: the one after the newest prompt — or, when that prompt is
 * the one being submitted right now and nothing follows it yet, the turn
 * before it.
 */
function lastTurn(entries) {
  const prompts = entries.flatMap((entry, at) => (isPrompt(entry) ? [at] : []));
  // No prompt in view means the tail starts inside one long turn: that turn is
  // the whole tail.
  let start = prompts.at(-1) ?? -1;
  let end = entries.length;
  if (start >= 0 && start === entries.length - 1) {
    end = start;
    start = prompts.at(-2) ?? -1;
  }
  return entries.slice(start + 1, end);
}

/**
 * What cut the last turn off, or null when it ended on its own or by the
 * user's hand. `lines` are transcript JSONL lines, oldest first.
 */
export function findPause(lines) {
  const entries = lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((entry) => entry && !entry.isSidechain)
    // Hook output and other harness text arrive as user entries of their own;
    // they neither start a turn nor end one.
    .filter((entry) => entry.type === "assistant" || isPrompt(entry) || isToolResult(entry) || isInterrupt(entry));
  const turn = lastTurn(entries);
  if (turn.length === 0 || turn.some(isInterrupt)) {
    return null;
  }
  const last = turn.at(-1);
  if (last.type === "assistant" && last.isApiErrorMessage) {
    const message = texts(last.message?.content).join(" ").trim();
    if (last.error === "rate_limit") {
      return { kind: "limit", id: last.uuid, message };
    }
    if (WILL_NOT_CLEAR.has(last.error)) {
      return null;
    }
    return { kind: "api", id: last.uuid, message };
  }
  // Only a failed tool call counts: a grep or a log that merely mentions ENOSPC
  // is not a full disk.
  const lastResult = turn.findLast(isToolResult);
  const output = lastResult ? failedOutput(lastResult).join("\n") : "";
  if (DISK_FULL.test(output)) {
    return { kind: "disk", id: lastResult.uuid, message: output.match(/.*(?:No space left on device|ENOSPC).*/)[0].trim() };
  }
  return null;
}

/** The line to inject for a pause, given the world as it is now. */
export function advise(pause, { free, event }) {
  const stopped = `Your previous turn was cut off before the task was done — ${pause.message || pause.kind}.`;
  const resume =
    "Continue the unfinished task from where it stopped, without waiting to be told: re-check the state first (git status, the todo list, the last tool output) rather than redoing finished steps, and do not re-ask questions already answered. A new instruction from the user in this prompt takes precedence.";
  if (pause.kind === "limit") {
    // The window's reset time is not the last word: extra usage or another
    // account lifts a limit early, and a prompt that is running proves it
    // lifted. A resume alone proves nothing.
    if (event === "SessionStart") {
      return `${stopped} Once the limit has lifted, on the user's next message: ${resume}`;
    }
    return `${stopped} The limit has lifted. ${resume}`;
  }
  if (pause.kind === "disk") {
    if (free < MIN_FREE_BYTES) {
      return `${stopped} The disk is still low (${gib(free)} free). Tell the user, free space first (/bond:disk-analyze), then continue the task.`;
    }
    return `${stopped} The disk has room again (${gib(free)} free). ${resume}`;
  }
  return `${stopped} That was a transient failure, not the task's. ${resume}`;
}

function tail(path) {
  const size = statSync(path).size;
  const length = Math.min(size, TAIL_BYTES);
  const buffer = Buffer.alloc(length);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buffer, 0, length, size - length);
  } finally {
    closeSync(fd);
  }
  const lines = buffer.toString("utf8").split("\n");
  // A tail cut mid-file starts mid-line; that fragment is dropped.
  return length < size ? lines.slice(1) : lines;
}

function announcedPath(session) {
  return join(tmpdir(), "bond", `${session}.resumed`);
}

function alreadyAnnounced(session, id) {
  try {
    return readFileSync(announcedPath(session), "utf8") === id;
  } catch {
    return false;
  }
}

function main() {
  const payload = JSON.parse(readFileSync(0, "utf8"));
  const { transcript_path: transcript, session_id: session, hook_event_name: event, source } = payload;
  if (!transcript || !session || (event === "SessionStart" && source !== "resume")) {
    return;
  }
  const pause = findPause(tail(transcript));
  const key = pause?.id ?? pause?.message ?? "";
  if (pause === null || alreadyAnnounced(session, key)) {
    return;
  }
  const message = advise(pause, { free: pause.kind === "disk" ? freeBytes() : Infinity, event });
  mkdirSync(dirname(announcedPath(session)), { recursive: true });
  writeFileSync(announcedPath(session), key);
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: { hookEventName: event, additionalContext: message },
    })}\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch {
    // A missed nudge is a worse resume; a hook error on the first prompt back
    // is a broken one. Falling off the end lets stdout drain.
  }
}
