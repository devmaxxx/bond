import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decide } from "../hooks/branch-guard.mjs";

/**
 * Threads each decision back into the next one, the way the wrapper's state
 * files do, so a sequence of events plays against the real contract.
 */
function session() {
  let recorded = null;
  let nudged = false;
  return function turn(event, current) {
    const out = decide({ event, recorded, current, nudged });
    if (out.record !== null) {
      recorded = out.record;
    }
    if (out.resetNudged) {
      nudged = false;
    }
    if (out.markNudged) {
      nudged = true;
    }
    return out.message;
  };
}

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

  it("clears an earlier nudge when it records a new baseline", () => {
    const out = decide({
      event: "SessionStart",
      recorded: "feat/a",
      current: "feat/b",
      nudged: true,
    });
    assert.equal(out.record, "feat/b");
    assert.equal(out.resetNudged, true);
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
    assert.equal(out.resetNudged, false);
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

describe("a session that starts again mid-flight", () => {
  it("nudges once per baseline, and again after a new start moves it", () => {
    // resume and compact reuse the session id, so without a re-arm the second
    // drift of a long session would go unmentioned.
    const turn = session();
    turn("SessionStart", "feat/a");
    assert.match(turn("UserPromptSubmit", "feat/b"), /feat\/a/);
    assert.equal(turn("UserPromptSubmit", "feat/b"), null);

    turn("SessionStart", "feat/b");
    assert.equal(turn("UserPromptSubmit", "feat/b"), null);

    const second = turn("UserPromptSubmit", "feat/c");
    assert.match(second, /feat\/b/);
    assert.match(second, /feat\/c/);
  });

  it("keeps quiet across a start that does not move the baseline", () => {
    const turn = session();
    turn("SessionStart", "feat/a");
    assert.equal(turn("UserPromptSubmit", "feat/a"), null);
    turn("SessionStart", "feat/a");
    assert.equal(turn("UserPromptSubmit", "feat/a"), null);
  });
});
