import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { judge } from "../hooks/suggest-compact.mjs";

describe("when a compaction reminder is due", () => {
  it("counts one more call each time", () => {
    assert.equal(judge(0).calls, 1);
    assert.equal(judge(41).calls, 42);
  });

  it("stays quiet before the fiftieth call", () => {
    for (let previous = 0; previous < 49; previous += 1) {
      assert.equal(judge(previous).message, null);
    }
  });

  it("speaks at 50 and every 25 after, and nowhere between", () => {
    assert.match(judge(49).message, /^50 tool calls/);
    assert.equal(judge(50).message, null);
    assert.match(judge(74).message, /^75 tool calls/);
    assert.match(judge(99).message, /^100 tool calls/);
  });
});
