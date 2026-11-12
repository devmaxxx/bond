#!/usr/bin/env node
/**
 * PreToolUse hook — enforces skills/pr-template on every path that opens a pull
 * request: `gh pr create` on Bash. The skill alone is advisory and a PR opened without reading it silently skips the
 * shared shape, so the check lives here instead. Exit 2 blocks the call and
 * hands the reasons back to the agent; anything unparseable exits 0, so a hook
 * bug never blocks unrelated shell work. The rule itself lives in
 * pr-template.mjs, where it is unit-tested.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { checkBash, resolveDraft, resolvePrTitle } from "./pr-template.mjs";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const cwd = payload?.cwd ?? process.cwd();
const at = (dir) => (dir ? resolve(cwd, dir.replace(/^~(?=\/|$)/, homedir())) : cwd);
const options = {
  requireDraft: (dir) => resolveDraft(at(dir)),
  titleStyle: (dir) => resolvePrTitle(at(dir)),
};
const errors = checkBash(payload?.tool_input?.command ?? "", options);

if (errors === null || errors.length === 0) {
  process.exit(0);
}

process.stderr.write(
  `bond:pr-template rejected this pull request:\n  - ${errors.join("\n  - ")}\n` +
    `Read ${process.env.CLAUDE_PLUGIN_ROOT ?? "the bond plugin"}/shared/pr-template.md and rebuild the title and body from it.\n`,
);
process.exit(2);
