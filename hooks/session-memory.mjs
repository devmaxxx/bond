#!/usr/bin/env node
/**
 * Carries a short note from one session in a repo to the next one there.
 *
 * `save` runs on PreCompact and SessionEnd: it reads the transcript, keeps the
 * last few things the user asked for and the files the session edited, and
 * writes them to ~/.claude/bond/sessions/<repo>.json. `restore` runs on
 * SessionStart and prints that note — but only on a fresh start or a resume,
 * and only when it was left by a different session within the last week.
 * After a compaction the summary already carries the same facts, and printing
 * them again would be paying twice for one memory.
 *
 * The note is a pointer, not a transcript: a handful of prompts cut to one
 * line each and a list of paths, well under a kilobyte, because whatever
 * SessionStart prints is re-read on every turn of the new session.
 *
 * Any failure exits 0 with nothing printed — a session that starts without
 * the note is a slightly worse session; one that will not start is broken.
 *
 * Adapted from the memory-persistence hooks of everything-claude-code
 * (Affaan Mustafa, MIT).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";

const PROMPTS_KEPT = 5;
const PROMPT_CHARS = 160;
const FILES_KEPT = 15;
const NOTE_BYTES = 1024;
const FRESH_FOR_MS = 7 * 24 * 60 * 60 * 1000;
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

// Slash commands, hook output, artifact context and other harness-written text
// arrive inside user messages wrapped in a lowercase hyphenated tag
// (`<command-name>`, `<system-reminder>`, …); none of it is something the user
// asked for. The harness keeps adding tags, so the shape is matched rather than
// a list, and a prompt that opens with JSX or an HTML tag is still kept.
const HARNESS_WRAPPED = /^\s*<[a-z]+(?:-[a-z]+)+[\s>]/;
// The harness records an Esc as a user turn of its own; it is not an ask.
const INTERRUPT_MARKER = /^\[Request interrupted by user/;

function promptText(entry) {
  if (entry?.type !== "user" || entry.isMeta || entry.isCompactSummary) {
    return null;
  }
  const content = entry.message?.content;
  const texts =
    typeof content === "string"
      ? [content]
      : Array.isArray(content)
        ? content
            .filter((block) => block?.type === "text")
            .map((block) => block.text)
        : [];
  const line = texts
    .filter((text) => !HARNESS_WRAPPED.test(text))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (line === "" || INTERRUPT_MARKER.test(line)) {
    return null;
  }
  return line.length > PROMPT_CHARS
    ? `${line.slice(0, PROMPT_CHARS - 1)}…`
    : line;
}

function editedPaths(entry) {
  if (entry?.type !== "assistant" || !Array.isArray(entry.message?.content)) {
    return [];
  }
  return entry.message.content
    .filter((block) => block?.type === "tool_use" && EDIT_TOOLS.has(block.name))
    .map((block) => block.input?.file_path ?? block.input?.notebook_path)
    .filter((path) => typeof path === "string");
}

/**
 * What a transcript leaves behind: the last prompts in order, and the edited
 * files most-recent first, as paths relative to `cwd`.
 */
export function digest(lines, cwd) {
  const prompts = [];
  const files = [];
  let branch = null;
  for (const raw of lines) {
    let entry;
    try {
      entry = JSON.parse(raw);
    } catch {
      continue;
    }
    branch = entry?.gitBranch || branch;
    const prompt = promptText(entry);
    if (prompt !== null) {
      prompts.push(prompt);
    }
    for (const path of editedPaths(entry)) {
      const shown = cwd ? relative(cwd, path) : path;
      const at = files.indexOf(shown);
      if (at !== -1) {
        files.splice(at, 1);
      }
      files.unshift(shown);
    }
  }
  return {
    branch,
    prompts: prompts.slice(-PROMPTS_KEPT),
    files: files.slice(0, FILES_KEPT),
  };
}

function bytes(text) {
  return Buffer.byteLength(text, "utf8");
}

// Whatever SessionStart prints is re-read on every turn, so the file list
// gives way to the budget and says how much it left out.
function editedLine(files, budget) {
  for (let shown = files.length; shown > 0; shown -= 1) {
    const rest = files.length - shown;
    const line = `Edited: ${files.slice(0, shown).join(", ")}${rest > 0 ? ` +${rest} more` : ""}`;
    if (bytes(line) <= budget) {
      return line;
    }
  }
  return `Edited: ${files.length} files`;
}

/** The note to print at SessionStart, or null when there is nothing worth it. */
export function render(memory, { session, source, now }) {
  if (source === "compact" || source === "clear") {
    return null;
  }
  if (!memory || memory.session === session) {
    return null;
  }
  const age = now - Date.parse(memory.savedAt);
  if (!(age >= 0 && age < FRESH_FOR_MS)) {
    return null;
  }
  if (memory.prompts.length === 0 && memory.files.length === 0) {
    return null;
  }
  const lines = [
    `Previous session in this repo (${memory.savedAt.slice(0, 16).replace("T", " ")} UTC${memory.branch ? `, branch ${memory.branch}` : ""}) — background only; the user's request in this session decides what to do.`,
  ];
  if (memory.prompts.length > 0) {
    lines.push("Last asks:", ...memory.prompts.map((prompt) => `- ${prompt}`));
  }
  if (memory.files.length > 0) {
    lines.push(editedLine(memory.files, NOTE_BYTES - bytes(lines.join("\n"))));
  }
  return `${lines.join("\n")}\n`;
}

function storePath(cwd) {
  // One note per repo directory; the basename keeps the file findable by eye
  // and the full path, flattened, keeps two clones of one repo apart.
  const key = `${basename(cwd)}-${cwd.replace(/[^A-Za-z0-9]+/g, "-")}`.slice(
    0,
    200,
  );
  return join(homedir(), ".claude", "bond", "sessions", `${key}.json`);
}

function save(payload) {
  const { transcript_path: transcript, cwd, session_id: session } = payload;
  if (!transcript || !cwd) {
    return;
  }
  const lines = readFileSync(transcript, "utf8").split("\n");
  const memory = {
    session,
    savedAt: new Date().toISOString(),
    ...digest(lines, cwd),
  };
  if (memory.prompts.length === 0 && memory.files.length === 0) {
    // An empty session must not overwrite the note a real one left.
    return;
  }
  const path = storePath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(memory, null, 2)}\n`);
}

function restore(payload) {
  const { cwd, session_id: session, source } = payload;
  if (!cwd) {
    return;
  }
  let memory;
  try {
    memory = JSON.parse(readFileSync(storePath(cwd), "utf8"));
  } catch {
    return;
  }
  const note = render(memory, { session, source, now: Date.now() });
  if (note !== null) {
    process.stdout.write(note);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const payload = JSON.parse(readFileSync(0, "utf8"));
    if (process.argv[2] === "save") {
      save(payload);
    } else if (process.argv[2] === "restore") {
      restore(payload);
    }
  } catch {
    // Falling off the end exits 0 once stdout has drained; an explicit exit
    // could cut the note off mid-write.
  }
}
