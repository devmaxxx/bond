#!/usr/bin/env node
/**
 * PostToolUse hook on Edit|Write|MultiEdit — scans a just-written prose file
 * (md, mdx, txt) for AI signatures and exits 2 with the offending lines so the
 * agent removes them before the file is committed. Files that define the rule
 * (skills/oleg-skills, hooks folders) are exempt: they quote what they forbid.
 */

import { readFileSync } from "node:fs";
import { findAiBreadcrumbs } from "./ai-breadcrumbs.mjs";

const EXEMPT = ["/skills/oleg-skills/", "/hooks/"];

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
const file =
  payload?.tool_response?.filePath ?? payload?.tool_input?.file_path ?? "";
if (
  !/\.(md|mdx|txt)$/i.test(file) ||
  EXEMPT.some((dir) => file.includes(dir))
) {
  process.exit(0);
}

let text;
try {
  text = readFileSync(file, "utf8");
} catch {
  process.exit(0);
}
const hits = findAiBreadcrumbs(text);
if (hits.length > 0) {
  const lines = hits
    .map(({ line, text }) => `${file}:${line}: ${text}`)
    .join("\n  ");
  process.stderr.write(
    `bond:oleg-skills — AI breadcrumb in a document, remove it:\n  ${lines}\n`,
  );
  process.exit(2);
}
