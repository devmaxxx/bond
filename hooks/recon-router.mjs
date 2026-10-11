#!/usr/bin/env node
/**
 * PreToolUse hook on Agent — one word about who should answer a recon question.
 * "Where is X", "what calls Y", "which file holds Z" have one cheap answer and
 * one expensive one: `repo-scout` reads the graph and hands back a kilobyte,
 * while the general-purpose agent runs the search and returns everything it
 * read. The dispatch is where that choice is still free to make.
 *
 * The unnamed and the general-purpose agent are pointed at the reader. A
 * dispatch that already names a reader has made that choice; it hears only
 * about the model, when it names none — a lookup's answer is a few lines, and
 * `haiku` writes them for a fraction of what the session's model charges.
 *
 * Any failure exits 0 with nothing printed — a missed nudge is a slightly worse
 * session, a hook that throws is a broken tool call. The rule lives in `route`,
 * where it is unit-tested; everything below it is the I/O around that.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const GENERAL = new Set(["", "general-purpose", "general"]);

const READERS = new Set(["Explore", "repo-scout", "caveman:cavecrew-investigator"]);

const RECON =
  /\b(where (is|does|do|are)|what calls|who calls|which files?|find (all|the|where|every)|list all uses|how is .* wired)\b/i;

const BUILDS =
  /\b(implement|add|write|refactor|fix|update|create|migrate|edit)\b/i;

const NUDGE = {
  scout:
    'recon question — `repo-scout` with `model: "haiku"` answers it from the graph in ~1 KB; general-purpose pays the search in full and returns it all.',
  explore:
    'recon question — the `Explore` agent with `model: "haiku"` and a breadth ("medium"/"very thorough") returns the conclusion, not the file dumps.',
  haiku:
    'recon dispatch with no model — pass `model: "haiku"`: a lookup needs no more, and the session\'s model costs several times as much for the same answer.',
};

export function route(toolInput, hasRepoScout) {
  const agent = toolInput?.subagent_type ?? "";
  const prompt = toolInput?.prompt;
  if (READERS.has(agent)) {
    return toolInput?.model ? null : NUDGE.haiku;
  }
  if (!GENERAL.has(agent) || typeof prompt !== "string") {
    return null;
  }
  if (!RECON.test(prompt)) {
    return null;
  }
  // A prompt that also asks for the change is not recon, however it words the
  // question: the agent that writes the code reads it on the way there, so
  // routing the question to a reader that cannot edit buys a second dispatch
  // rather than a cheaper answer.
  if (BUILDS.test(prompt)) {
    return null;
  }
  return hasRepoScout ? NUDGE.scout : NUDGE.explore;
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return;
  }
  const cwd = payload?.cwd ?? process.cwd();
  const message = route(
    payload?.tool_input,
    existsSync(join(cwd, ".claude/agents/repo-scout.md")),
  );
  if (message !== null) {
    // Context only, never a permissionDecision: this hook has an opinion about
    // who should answer the question, not about whether the agent may run.
    // `updatedInput` needs a decision to go with it, and the only decision that
    // would carry a rewrite is "allow" — which would approve a dispatch nobody
    // has seen.
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
    // main() returns quietly on the failures it anticipates; this is for the
    // ones it does not. An uncaught throw exits nonzero and the session reports
    // a hook error, and a nudge that cannot be made is worth no more noise than
    // silence. Falling off the end exits 0 once stdout has drained; an explicit
    // exit here could cut a write mid-flush.
  }
}
