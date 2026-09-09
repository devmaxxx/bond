#!/usr/bin/env node
/**
 * PreToolUse hook — enforces skills/pr-template on every path that opens a pull
 * request: `gh pr create` on Bash, and the Bitbucket MCP create calls. The
 * skill alone is advisory and a PR opened without reading it silently skips the
 * shared shape, so the check lives here instead. Exit 2 blocks the call and
 * hands the reasons back to the agent; anything unparseable exits 0, so a hook
 * bug never blocks unrelated shell work. The rule itself lives in
 * pr-template.mjs, where it is unit-tested.
 */

import { readFileSync } from "node:fs";
import { checkBash, checkMcp } from "./pr-template.mjs";

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
