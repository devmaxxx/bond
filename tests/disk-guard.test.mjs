import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AUTO_CLEAN_KEYS, MIN_FREE_BYTES, report } from "../hooks/disk-guard.mjs";

const GIB = 1024 ** 3;

describe("what the disk guard reports", () => {
  it("names what it cleaned and the space after", () => {
    const line = report({
      before: 2 * GIB,
      after: 9 * GIB,
      cleaned: ["CLEAN npm cache (6G) — npm cache clean --force", "ok, now 0B"],
      platform: "darwin",
    });
    assert.match(line, /2\.0 GiB free/);
    assert.match(line, /CLEAN npm cache \(6G\)/);
    assert.match(line, /Now 9\.0 GiB free\./);
    assert.doesNotMatch(line, /Still low/);
  });

  it("points at disk-analyze when cleaning was not enough", () => {
    const line = report({ before: 1 * GIB, after: 2 * GIB, cleaned: [], platform: "darwin" });
    assert.match(line, /nothing to clean/);
    assert.match(line, /\/bond:disk-analyze/);
  });

  it("does not claim a clean it skipped for the hour", () => {
    const line = report({ before: 1 * GIB, after: 1 * GIB, cleaned: null, platform: "darwin" });
    assert.match(line, /within the last hour/);
  });

  it("only warns off macOS", () => {
    assert.match(report({ before: 1 * GIB, after: 1 * GIB, cleaned: null, platform: "linux" }), /macOS-only/);
  });

  it("defaults the floor to 5 GiB", () => {
    assert.equal(MIN_FREE_BYTES, 5 * GIB);
  });

  // The Trash holds what the user moved there to keep recoverable; the debug
  // profile holds sign-ins. Neither is a cache.
  it("never auto-cleans the Trash or the Chrome debug profile", () => {
    assert.ok(!AUTO_CLEAN_KEYS.includes("trash"));
    assert.ok(!AUTO_CLEAN_KEYS.includes("chrome-debug"));
  });
});
