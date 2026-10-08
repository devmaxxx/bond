import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findAiBreadcrumbs } from "../hooks/ai-breadcrumbs.mjs";

describe("AI signatures", () => {
  for (const line of [
    "Co-Authored-By: Claude <noreply@anthropic.com>",
    "Co-authored-by: Claude Opus 5.5",
    "Generated-By: Claude Code",
    "Assisted-By: GPT-5",
    "Made-With: Cursor",
    "Made with Claude Code",
    "Built using an AI assistant",
  ]) {
    it(`flags «${line}»`, () => {
      assert.equal(findAiBreadcrumbs(line).length, 1);
    });
  }

  for (const line of [
    "Co-authored-by: Anna Nowak <anna@example.com>",
    "Reviewed-By: Max",
    "Refs: #12",
    "docs(claude): tidy the .claude/ folder",
  ]) {
    it(`leaves «${line}»`, () => {
      assert.deepEqual(findAiBreadcrumbs(line), []);
    });
  }
});
