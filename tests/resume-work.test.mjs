import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { advise, findPause } from "../hooks/resume-work.mjs";
import { MIN_FREE_BYTES } from "../hooks/disk-guard.mjs";

const prompt = (text, uuid = "p") => ({ type: "user", uuid, message: { role: "user", content: text } });
const said = (text, uuid = "a") => ({ type: "assistant", uuid, message: { content: [{ type: "text", text }] } });
const toolUse = (uuid = "t") => ({ type: "assistant", uuid, message: { content: [{ type: "tool_use", name: "Bash", input: {} }] } });
const toolResult = (text, uuid = "r", isError = false) => ({
  type: "user",
  uuid,
  message: { content: [{ type: "tool_result", content: text, is_error: isError }] },
});
const limitHit = (resetsAt) => ({
  type: "assistant",
  uuid: "limit",
  isApiErrorMessage: true,
  error: "rate_limit",
  quotaLimits: { resetsAt },
  message: { content: [{ type: "text", text: "You've hit your weekly limit · resets 12pm" }] },
});
const apiError = {
  type: "assistant",
  uuid: "lost",
  isApiErrorMessage: true,
  error: "server_error",
  message: { content: [{ type: "text", text: "API Error: Connection lost mid-response." }] },
};
const lines = (...entries) => entries.map((entry) => JSON.stringify(entry));

describe("which endings count as a pause", () => {
  it("finds a usage limit", () => {
    const pause = findPause(lines(prompt("build it"), toolUse(), toolResult("ok"), limitHit(1000)));
    assert.deepEqual(pause, { kind: "limit", id: "limit", message: "You've hit your weekly limit · resets 12pm" });
  });

  it("leaves alone an API error a retry would hit again", () => {
    const rejected = { ...apiError, uuid: "bad", error: "invalid_request" };
    assert.equal(findPause(lines(prompt("build it"), toolUse(), rejected)), null);
  });

  it("finds an API failure", () => {
    assert.equal(findPause(lines(prompt("build it"), toolUse(), apiError)).kind, "api");
  });

  it("finds a full disk in the turn's last tool output", () => {
    const pause = findPause(lines(prompt("build it"), toolUse(), toolResult("write: No space left on device", "r1", true), said("Disk is full.")));
    assert.equal(pause.kind, "disk");
    assert.equal(pause.id, "r1");
  });

  it("ignores a full disk the turn got past", () => {
    assert.equal(
      findPause(lines(prompt("build it"), toolUse(), toolResult("ENOSPC", "r0", true), toolUse("t2"), toolResult("ok", "r2"), said("Done."))),
      null,
    );
  });

  it("ignores ENOSPC in the output of a call that did not fail", () => {
    assert.equal(findPause(lines(prompt("build it"), toolUse(), toolResult("src/io.js: ENOSPC handled"), said("Done."))), null);
  });

  it("finds a pause in a turn whose prompt fell outside the tail", () => {
    assert.equal(findPause(lines(toolUse(), toolResult("ok"), apiError)).kind, "api");
    assert.equal(findPause(lines(toolUse(), apiError, prompt("continue", "p2"))).kind, "api");
  });

  it("does not resume a turn the user stopped with Esc", () => {
    assert.equal(findPause(lines(prompt("build it"), toolUse(), apiError, prompt("[Request interrupted by user]"))), null);
  });

  it("says nothing about a turn that finished", () => {
    assert.equal(findPause(lines(prompt("build it"), said("Done."))), null);
  });

  it("judges the previous turn when the newest prompt has nothing after it yet", () => {
    assert.equal(findPause(lines(prompt("build it"), toolUse(), apiError, prompt("continue", "p2"))).kind, "api");
  });

  it("judges only the newest turn once it has started", () => {
    assert.equal(findPause(lines(prompt("build it"), apiError, prompt("continue", "p2"), said("Done."))), null);
  });

  it("does not take harness-wrapped text for a prompt", () => {
    const reminder = prompt("<system-reminder>hook said</system-reminder>", "sr");
    assert.equal(findPause(lines(prompt("build it"), toolUse(), apiError, reminder)).kind, "api");
  });
});

describe("what a pause turns into now", () => {
  it("continues after a usage limit", () => {
    assert.match(advise({ kind: "limit", message: "limit" }, {}), /The limit has lifted\. Continue/);
  });

  it("does not promise a lifted limit on a bare resume", () => {
    const line = advise({ kind: "limit", message: "limit" }, { event: "SessionStart" });
    assert.match(line, /Once the limit has lifted/);
    assert.doesNotMatch(line, /The limit has lifted\./);
  });

  it("continues after a transient API failure", () => {
    assert.match(advise({ kind: "api", message: "API Error" }, {}), /transient failure.*Continue the unfinished task/);
  });

  it("asks for space first while the disk is still low", () => {
    const line = advise({ kind: "disk", message: "ENOSPC" }, { free: MIN_FREE_BYTES - 1 });
    assert.match(line, /still low/);
    assert.doesNotMatch(line, /without waiting/);
  });

  it("continues once the disk has room", () => {
    assert.match(advise({ kind: "disk", message: "ENOSPC" }, { free: MIN_FREE_BYTES }), /has room again.*Continue/);
  });
});
