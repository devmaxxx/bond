import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const PAIR = ["pr-review", "security-review"];

function markdownUnder(dir) {
  return readdirSync(join(ROOT, dir), { recursive: true })
    .filter((f) => f.endsWith(".md"))
    .map((f) => join(dir, f));
}

/**
 * Code and security review run together, through shared/pr-review-flow.md;
 * a command or skill that names one agent alone has split the pair.
 */
describe("pr-review and security-review stay paired", () => {
  const files = ["commands", "skills", "plugins"].flatMap(markdownUnder);

  for (const file of files) {
    const text = readFileSync(join(ROOT, file), "utf8");
    const named = PAIR.filter((agent) => text.includes(`bond:${agent}`));

    if (named.length === 0) {
      continue;
    }

    it(file, () => {
      assert.deepEqual(
        named,
        PAIR,
        `${file} names ${named.join(", ")} without its pair — use shared/pr-review-flow.md`,
      );
    });
  }

  it("the shared flow names both", () => {
    const text = readFileSync(join(ROOT, "shared/pr-review-flow.md"), "utf8");
    for (const agent of PAIR) {
      assert.ok(text.includes(`bond:${agent}`), agent);
    }
  });
});
