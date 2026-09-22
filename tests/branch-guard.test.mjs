import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decide } from "../hooks/branch-guard.mjs";

describe("recording the branch a session started on", () => {
  it("records the branch the session opened in", () => {
    const out = decide({
      event: "SessionStart",
      recorded: null,
      current: "feat/context-cost-hooks",
      nudged: false,
    });
    assert.equal(out.record, "feat/context-cost-hooks");
    assert.equal(out.message, null);
    assert.equal(out.markNudged, false);
  });

  it("records nothing when there is no branch to record", () => {
    const out = decide({
      event: "SessionStart",
      recorded: null,
      current: null,
      nudged: false,
    });
    assert.equal(out.record, null);
    assert.equal(out.message, null);
  });
});

describe("nudging when the branch moves under a session", () => {
  it("stays quiet while the session is still on the branch it recorded", () => {
    const out = decide({
      event: "UserPromptSubmit",
      recorded: "main",
      current: "main",
      nudged: false,
    });
    assert.equal(out.message, null);
    assert.equal(out.markNudged, false);
  });

  it("names both branches and the way out when the branch changed", () => {
    const out = decide({
      event: "UserPromptSubmit",
      recorded: "feat/a",
      current: "feat/b",
      nudged: false,
    });
    assert.match(out.message, /feat\/a/);
    assert.match(out.message, /feat\/b/);
    assert.match(out.message, /\/clear/);
    assert.equal(out.markNudged, true);
    assert.equal(out.record, null);
  });

  it("stays quiet once the session has been nudged", () => {
    const out = decide({
      event: "UserPromptSubmit",
      recorded: "feat/a",
      current: "feat/b",
      nudged: true,
    });
    assert.equal(out.message, null);
    assert.equal(out.markNudged, false);
  });

  it("stays quiet when the session start recorded nothing", () => {
    // An unwritable tmp leaves no record, and "the branch moved" is then
    // unknowable — better silent than nudging every session on its first turn.
    const out = decide({
      event: "UserPromptSubmit",
      recorded: null,
      current: "feat/b",
      nudged: false,
    });
    assert.equal(out.message, null);
    assert.equal(out.markNudged, false);
  });

  it("stays quiet when the tree names no branch", () => {
    const out = decide({
      event: "UserPromptSubmit",
      recorded: "feat/a",
      current: null,
      nudged: false,
    });
    assert.equal(out.message, null);
    assert.equal(out.markNudged, false);
  });
});
