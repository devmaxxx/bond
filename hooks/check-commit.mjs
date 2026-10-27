#!/usr/bin/env node
/**
 * PreToolUse hook on Bash — enforces skills/authorship-conventions on `git commit` and
 * `gh pr …` commands before they run: no AI signature anywhere in the message
 * (inline, heredoc or -F/--body-file), and a Conventional Commits subject
 * when the subject can be read out of the command. A block hands the reasons
 * back to the agent.
 *
 * Runs on agent-base-kit, which fails closed: a payload it cannot read or a
 * check that throws blocks the call, since any exit but 2 lets it run unchecked.
 */

import { readFileSync } from "node:fs";
import { findAiBreadcrumbs } from "./ai-breadcrumbs.mjs";
import { runsCommand, scrubShell } from "./shell.mjs";
import { defineHook, readStdin, runHook } from "./vendor/agent-base-kit.mjs";

const TYPES = "feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert";
const SUBJECT = new RegExp(`^(${TYPES})(\\([a-z0-9][a-z0-9._/-]*\\))?!?: \\S`);
const PASSTHROUGH = /^(Merge |fixup! |squash! |Revert ")/;

const firstLine = (text) =>
  text.split("\n").find((l) => l.trim() !== "" && !l.startsWith("#")) ?? null;

// The flag pattern also catches other tools in the same command line, such as
// `ls -F hooks` or `grep -F src`, whose "file" is a directory or nothing at
// all: the hook would fail closed on every such call. Only a readable file can
// hold a message.
function readMessageFile(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function extractSubject(cmd, fileTexts) {
  if (fileTexts.length > 0) {
    return firstLine(fileTexts[0]);
  }
  // A heredoc is the message only when it feeds git: `-F -` reading stdin, or
  // `-m "$(cat <<EOF`. Any other heredoc in the same command — a script run
  // after the commit — is data, and its first line is no subject. The
  // heredoc must immediately follow one of those two markers — checking the
  // marker and the heredoc as two independent facts (rather than tying the
  // marker to the specific heredoc it introduces) misattributes an unrelated
  // earlier heredoc when a command contains more than one.
  const heredocMessage = cmd.match(
    /(?:(?:^|\s)(?:-F|--file)[=\s]+["']?-["']?\s*|(?:^|\s)(?:-m|--message)[=\s]+"\$\(cat\s+)<<-?\s*["']?(\w+)["']?\s*\n([\s\S]*?)\n\s*\1\b/,
  );
  if (heredocMessage) {
    return firstLine(heredocMessage[2]);
  }
  // `-am` bundles `-m`; missing it made a later `-m <body>` read as the subject.
  const inline = cmd.match(
    /(?:^|\s)(?:-[A-Za-z]*m|--message)[=\s]+(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+))/,
  );
  if (inline) {
    return firstLine(inline[1] ?? inline[2] ?? inline[3] ?? "");
  }
  return null;
}

const checkCommit = defineHook({
  name: "check-commit",
  kinds: ["shell"],
  check({ command: cmd }) {
    // Detection reads the scrubbed command, so the words spelled inside a heredoc
    // body, a quoted string or a comment are data, not an invocation. Message
    // extraction below still reads the raw command — that is where the body lives.
    const scrubbed = scrubShell(cmd);
    // `-C <path>` / `-c <name=value>` take a value, so a bare `-\S+` repetition
    // would stop at the path and miss `git -C /repo commit` entirely.
    const isCommit = runsCommand(
      scrubbed,
      "git(?:\\s+(?:-[Cc]\\s+\\S+|--?\\S+))*\\s+commit",
    );
    const isPr = runsCommand(
      scrubbed,
      "gh\\s+pr\\s+(?:create|edit|comment|review|merge)",
    );
    if (!isCommit && !isPr) {
      return { block: false };
    }

    const fileTexts = [
      ...cmd.matchAll(/(?:^|\s)(?:-F|--file|--body-file)[=\s]+["']?([^\s"']+)/g),
    ]
      .map((m) => readMessageFile(m[1]))
      .filter((text) => text !== null);

    const errors = findAiBreadcrumbs([cmd, ...fileTexts].join("\n")).map(
      ({ text }) => `AI breadcrumb: "${text}"`,
    );
    if (isCommit) {
      const subject = extractSubject(cmd, fileTexts);
      if (
        subject !== null &&
        !PASSTHROUGH.test(subject) &&
        !SUBJECT.test(subject)
      ) {
        errors.push(
          `subject "${subject}" must be "<type>(<scope>)!: <description>" with type in {${TYPES}}`,
        );
      }
    }

    if (errors.length === 0) {
      return { block: false };
    }
    return {
      block: true,
      reason: `bond:authorship-conventions rejected this command:\n  - ${errors.join("\n  - ")}\nFix the message (no AI trailers or session links; Conventional Commits subject) and retry.\n`,
    };
  },
});

process.exitCode = await runHook(checkCommit, await readStdin());
