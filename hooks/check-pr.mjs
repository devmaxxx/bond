#!/usr/bin/env node
/**
 * PreToolUse hook — enforces skills/pr-template on every path that opens a pull
 * request: `gh pr create` on Bash, and the Bitbucket MCP create calls. The
 * skill alone is advisory and a PR opened without reading it silently skips the
 * shared shape, so the check lives here instead. Exit 2 blocks the call and
 * hands the reasons back to the agent; anything unparseable exits 0, so a hook
 * bug never blocks unrelated shell work.
 */

import { existsSync, readFileSync } from "node:fs";

const TICKET = /\b[A-Z]+-\d+\b/;
const MCP_CREATE = /^mcp__bond-bitbucket__create_(draft_)?pull_request$/;

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const toolName = payload?.tool_name ?? "";
const errors = MCP_CREATE.test(toolName)
  ? checkMcp(payload?.tool_input ?? {}, toolName)
  : checkBash(payload?.tool_input?.command ?? "");

if (errors === null || errors.length === 0) {
  process.exit(0);
}

process.stderr.write(
  `bond:pr-template rejected this pull request:\n  - ${errors.join("\n  - ")}\n` +
    `Read ${process.env.CLAUDE_PLUGIN_ROOT ?? "the bond plugin"}/shared/pr-template.md and rebuild the title and body from it.\n`,
);
process.exit(2);

/**
 * Returns null when the command is not a PR creation, or when the body cannot
 * be read out of it — an unreadable body is not evidence of a missing template.
 */
function checkBash(cmd) {
  if (!/\bgh\s+pr\s+create\b/.test(cmd)) {
    return null;
  }
  // --web hands authoring to the browser, where the human writes the body.
  if (/(?:^|\s)(?:-w|--web)(?:\s|$)/.test(cmd)) {
    return null;
  }

  const problems = [];
  if (/(?:^|\s)--fill(?:-first|-verbose)?(?:\s|$)/.test(cmd)) {
    problems.push(
      "--fill builds the body from commit messages and skips the template; pass --body-file with the built description instead",
    );
  }
  if (!/(?:^|\s)(?:-d|--draft)(?:\s|=|$)/.test(cmd)) {
    problems.push(
      "every PR opens as a draft — add --draft (the author publishes when ready)",
    );
  }

  const body = bodyFromCommand(cmd);
  if (body === null) {
    return problems.length > 0 ? problems : null;
  }
  return [...problems, ...missingSections(body, `${cmd}\n${body}`)];
}

function checkMcp(input, toolName) {
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
    .filter((v) => typeof v === "string")
    .join("\n");
  return missingSections(body, haystack);
}

/**
 * `haystack` is where a ticket id may appear (command line, title, branch) —
 * the Jira section is only required when the work actually has a ticket.
 */
function missingSections(body, haystack) {
  const problems = [];
  if (!/^##\s+Summary\s*$/m.test(body)) {
    problems.push("description is missing its `## Summary` section");
  }
  if (!/^##\s+Test plan\s*$/m.test(body)) {
    problems.push("description is missing its `## Test plan` section");
  }
  if (TICKET.test(haystack) && !/^##\s+Jira\s*$/m.test(body)) {
    problems.push(
      "a ticket id is in play but the description has no `## Jira` section",
    );
  }
  return problems;
}

function bodyFromCommand(cmd) {
  const fileArg = cmd.match(
    /(?:^|\s)(?:-F|--body-file)[=\s]+["']?([^\s"']+)/,
  )?.[1];
  if (fileArg !== undefined) {
    // "-" reads stdin, which the hook cannot see.
    return fileArg !== "-" && existsSync(fileArg)
      ? readFileSync(fileArg, "utf8")
      : null;
  }
  const heredoc = cmd.match(/<<-?\s*["']?(\w+)["']?\s*\n([\s\S]*?)\n\s*\1\b/);
  if (heredoc) {
    return heredoc[2];
  }
  const inline = cmd.match(
    /(?:^|\s)(?:-b|--body)[=\s]+(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+))/,
  );
  if (inline) {
    return inline[1] ?? inline[2] ?? inline[3] ?? "";
  }
  return null;
}
