#!/usr/bin/env node
/**
 * PreToolUse hook on Bash — enforces skills/oleg-skills on `git commit` and
 * `gh pr …` commands before they run: no AI signature anywhere in the message
 * (inline, heredoc or -F/--body-file), and a Conventional Commits subject
 * when the subject can be read out of the command. Exit 2 blocks the call and
 * hands the reasons back to the agent; anything unparseable exits 0 so a hook
 * bug never blocks unrelated shell work.
 */

import { existsSync, readFileSync } from "node:fs";
import { findAiBreadcrumbs } from "./ai-breadcrumbs.mjs";

const TYPES = "feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert";
const SUBJECT = new RegExp(`^(${TYPES})(\\([a-z0-9][a-z0-9._/-]*\\))?!?: \\S`);
const PASSTHROUGH = /^(Merge |fixup! |squash! |Revert ")/;

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
const cmd = payload?.tool_input?.command ?? "";
const isCommit = /\bgit\b[^\n;&|]*\bcommit\b/.test(cmd);
const isPr = /\bgh\s+pr\s+(create|edit|comment|review|merge)\b/.test(cmd);
if (!isCommit && !isPr) {
  process.exit(0);
}

const fileArgs = [
  ...cmd.matchAll(/(?:^|\s)(?:-F|--file|--body-file)[=\s]+["']?([^\s"']+)/g),
].map((m) => m[1]);
const fileTexts = fileArgs
  .filter((f) => existsSync(f))
  .map((f) => readFileSync(f, "utf8"));

const firstLine = (text) =>
  text.split("\n").find((l) => l.trim() !== "" && !l.startsWith("#")) ?? null;
function extractSubject() {
  if (fileTexts.length > 0) {
    return firstLine(fileTexts[0]);
  }
  const heredoc = cmd.match(/<<-?\s*["']?(\w+)["']?\s*\n([\s\S]*?)\n\s*\1\b/);
  if (heredoc) {
    return firstLine(heredoc[2]);
  }
  const inline = cmd.match(
    /(?:^|\s)(?:-m|--message)[=\s]+(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+))/,
  );
  if (inline) {
    return firstLine(inline[1] ?? inline[2] ?? inline[3] ?? "");
  }
  return null;
}

const errors = findAiBreadcrumbs([cmd, ...fileTexts].join("\n")).map(
  ({ text }) => `AI breadcrumb: "${text}"`,
);
if (isCommit) {
  const subject = extractSubject();
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

if (errors.length > 0) {
  process.stderr.write(
    `bond:oleg-skills rejected this command:\n  - ${errors.join("\n  - ")}\nFix the message (no AI trailers or session links; Conventional Commits subject) and retry.\n`,
  );
  process.exit(2);
}
