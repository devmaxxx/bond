/**
 * The rule enforced by check-pr.mjs, kept importable so the two decisions that
 * gate it can be unit-tested: is this Bash command really opening a pull
 * request, and does the work actually carry a Jira ticket. Both were once
 * substring guesses, and both blocked work that opened no PR at all.
 */

import { existsSync, readFileSync } from "node:fs";

const DEFAULT_JIRA_PROJECTS = ["ERP", "CRMDEV"];

// $3 is the rest of the header line, kept because a `&& gh …` can live there.
const HEREDOC = /<<-?\s*(["']?)(\w+)\1([^\n]*)\n(?:[\s\S]*?\n)?[ \t]*\2(?![\w])/g;
const DOUBLE_QUOTED = /"(?:[^"\\]|\\[\s\S])*"/g;
const SINGLE_QUOTED = /'[^']*'/g;
const COMMENT = /(^|\s)#[^\n]*/g;
const LINE_CONTINUATION = /\\\n/g;

const SEGMENT_BREAK = /[\n;&|(){}`]+/;
const GH_PR_CREATE =
  /^\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(?:(?:command|builtin|exec|nohup|time)\s+)*(?:[\w./~-]*\/)?gh\s+pr\s+create(?![\w-])/;

const WEB = /(?:^|\s)(?:-w|--web)(?:\s|$)/;
const FILL = /(?:^|\s)--fill(?:-first|-verbose)?(?:\s|$)/;
const DRAFT = /(?:^|\s)(?:-d|--draft)(?:\s|=|$)/;

/**
 * Project keys, not a generic `[A-Z]+-\d+`: that shape also spells UTF-8,
 * SHA-256, ISO-8601 and RFC-822, and a PR was once rejected for the word
 * "UTF-8" in its description. The keys are enumerable, so they are enumerated;
 * `BOND_JIRA_PROJECTS` (comma- or space-separated) replaces the list when
 * Bonliva adds a project. An unlisted key means no `## Jira` section is
 * demanded — a missed reminder, never a blocked PR.
 */
export function jiraProjects() {
  const configured = (process.env.BOND_JIRA_PROJECTS ?? "")
    .split(/[\s,]+/)
    .map((key) => key.toUpperCase())
    .filter((key) => /^[A-Z][A-Z0-9]+$/.test(key));
  return configured.length > 0 ? configured : DEFAULT_JIRA_PROJECTS;
}

/**
 * The boundaries are hand-rolled because `\b` gets both ends wrong here: it
 * refuses the `ERP-135_ERP-136` a multi-ticket branch carries, and it accepts
 * the `ERP` tail of a longer word.
 */
export function hasTicket(text) {
  const keys = jiraProjects().join("|");
  return new RegExp(`(?<![A-Za-z0-9])(?:${keys})-\\d+(?![0-9])`).test(text);
}

/**
 * Blanks out every stretch of a command line that the shell would treat as data
 * rather than code — heredoc bodies, quoted strings, comments — so that flags
 * and command names are matched only where they are really flags and command
 * names. A diagnostic that merely prints "gh pr create" is not a PR.
 *
 * Best effort by design: unbalanced quotes leave a mangled string that matches
 * nothing, and the hook's contract is that an unreadable command blocks nobody.
 */
export function scrubShell(cmd) {
  return cmd
    .replace(HEREDOC, "<<HEREDOC$3")
    .replace(DOUBLE_QUOTED, '""')
    .replace(SINGLE_QUOTED, "''")
    .replace(COMMENT, "$1")
    .replace(LINE_CONTINUATION, " ");
}

/** True when a scrubbed command runs `gh pr create` at a command position. */
export function isGhPrCreate(scrubbed) {
  return scrubbed
    .split(SEGMENT_BREAK)
    .some((segment) => GH_PR_CREATE.test(segment));
}

/**
 * Returns null when the command is not a PR creation, or when the body cannot
 * be read out of it — an unreadable body is not evidence of a missing template.
 */
export function checkBash(cmd) {
  const scrubbed = scrubShell(cmd);
  if (!isGhPrCreate(scrubbed)) {
    return null;
  }
  // --web hands authoring to the browser, where the human writes the body.
  if (WEB.test(scrubbed)) {
    return null;
  }

  const problems = [];
  if (FILL.test(scrubbed)) {
    problems.push(
      "--fill builds the body from commit messages and skips the template; pass --body-file with the built description instead",
    );
  }
  if (!DRAFT.test(scrubbed)) {
    problems.push(
      "every PR opens as a draft — add --draft (the author publishes when ready)",
    );
  }

  const body = bodyFromCommand(cmd);
  if (body === null) {
    return problems.length > 0 ? problems : null;
  }
  // Flag values come from the raw command: scrubbing deleted their quoted text.
  const haystack = [
    flagValue(cmd, "-t|--title"),
    flagValue(cmd, "-H|--head"),
    body,
  ]
    .filter((value) => value !== null)
    .join("\n");
  return [...problems, ...missingSections(body, haystack)];
}

export function checkMcp(input, toolName) {
  if (toolName === "mcp__bond-bitbucket__create_pull_request") {
    return [
      "every PR opens as a draft — use create_draft_pull_request (the author publishes when ready)",
    ];
  }
  const body = typeof input.description === "string" ? input.description : null;
  if (body === null) {
    return null;
  }
  const haystack = [input.title, input.source_branch, body]
    .filter((value) => typeof value === "string")
    .join("\n");
  return missingSections(body, haystack);
}

/**
 * `haystack` is where a ticket id may appear (title, branch, body) — the Jira
 * section is only required when the work actually has a ticket.
 */
export function missingSections(body, haystack) {
  const problems = [];
  if (!/^##\s+Summary\s*$/m.test(body)) {
    problems.push("description is missing its `## Summary` section");
  }
  if (!/^##\s+Test plan\s*$/m.test(body)) {
    problems.push("description is missing its `## Test plan` section");
  }
  if (hasTicket(haystack) && !/^##\s+Jira\s*$/m.test(body)) {
    problems.push(
      "a ticket id is in play but the description has no `## Jira` section",
    );
  }
  return problems;
}

export function bodyFromCommand(cmd) {
  const fileArg = flagValue(cmd, "-F|--body-file");
  if (fileArg !== null) {
    // "-" reads stdin, which the hook cannot see.
    return fileArg !== "-" && existsSync(fileArg)
      ? readFileSync(fileArg, "utf8")
      : null;
  }
  const heredoc = cmd.match(/<<-?\s*["']?(\w+)["']?\s*\n([\s\S]*?)\n\s*\1\b/);
  if (heredoc) {
    return heredoc[2];
  }
  return flagValue(cmd, "-b|--body");
}

function flagValue(cmd, flags) {
  const match = cmd.match(
    new RegExp(
      `(?:^|\\s)(?:${flags})[=\\s]+(?:"((?:[^"\\\\]|\\\\[\\s\\S])*)"|'([^']*)'|([^\\s"']+))`,
    ),
  );
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null;
}
