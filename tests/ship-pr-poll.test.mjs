import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "scripts",
  "ship-pr-poll.sh",
);

const AUTHOR = { login: "me" };
const BOT = { login: "github-actions[bot]" };
const checkRun = (name, status, conclusion = "") => ({ __typename: "CheckRun", name, status, conclusion });
const commitStatus = (context, state) => ({ __typename: "StatusContext", context, state });

/** One --once poll against a fake gh that prints `pr` as the PR payload. */
function pollOnce(pr, { ledger = { handledCommentIds: [] }, skipReview = 0, env = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ship-pr-poll-"));
  const payload = join(dir, "pr.json");
  const ledgerFile = join(dir, "ledger.json");
  const fakeGh = join(dir, "gh");
  writeFileSync(payload, JSON.stringify({ author: AUTHOR, comments: [], reviews: [], statusCheckRollup: [], ...pr }));
  writeFileSync(ledgerFile, JSON.stringify(ledger));
  writeFileSync(fakeGh, `#!/bin/sh\ncat "${payload}"\n`);
  chmodSync(fakeGh, 0o755);

  const result = spawnSync("bash", [SCRIPT, "--once", "7", "o/r", ledgerFile, "30", String(skipReview)], {
    env: { ...process.env, GH: fakeGh, ...env },
    encoding: "utf8",
  });
  return { status: result.status, out: result.stdout.trim() };
}

describe("ship-pr-poll", () => {
  it("settles once checks finish and a new review arrives", () => {
    const { status, out } = pollOnce({
      statusCheckRollup: [checkRun("test", "COMPLETED", "SUCCESS")],
      reviews: [{ id: "PRR_1", author: BOT }],
    });
    assert.equal(status, 0);
    assert.match(out, /^settled checks=1 failed=- new=1 /);
  });

  it("treats a finished commit status as done, not pending", () => {
    const { status } = pollOnce({
      statusCheckRollup: [commitStatus("ci/woodpecker", "SUCCESS")],
      comments: [{ id: "IC_1", author: BOT }],
    });
    assert.equal(status, 0);
  });

  it("waits on a pending commit status", () => {
    const { status } = pollOnce({
      statusCheckRollup: [commitStatus("ci/woodpecker", "PENDING")],
      comments: [{ id: "IC_1", author: BOT }],
    });
    assert.equal(status, 1);
  });

  it("does not read an empty rollup right after a push as settled", () => {
    const { status } = pollOnce({ comments: [{ id: "IC_1", author: BOT }] });
    assert.equal(status, 1);
  });

  it("reads zero checks as no CI once the grace period has passed", () => {
    const { status, out } = pollOnce({ comments: [{ id: "IC_1", author: BOT }] }, { env: { NO_CI_AFTER: "0" } });
    assert.equal(status, 0);
    assert.match(out, /checks=0 failed=-/);
  });

  it("names failed checks from both check runs and commit statuses", () => {
    const { out } = pollOnce(
      { statusCheckRollup: [checkRun("lint", "COMPLETED", "FAILURE"), commitStatus("deploy", "ERROR")] },
      { skipReview: 1 },
    );
    assert.match(out, /failed=lint,deploy /);
  });

  it("does not count feedback already in the ledger or the author's own", () => {
    const { status } = pollOnce(
      {
        statusCheckRollup: [checkRun("test", "COMPLETED", "SUCCESS")],
        comments: [{ id: "IC_1", author: BOT }, { id: "IC_2", author: AUTHOR }],
      },
      { ledger: { handledCommentIds: ["IC_1"] } },
    );
    assert.equal(status, 1);
  });

  it("does not wait for review under --skip-review", () => {
    const { status } = pollOnce(
      { statusCheckRollup: [checkRun("test", "COMPLETED", "SUCCESS")] },
      { skipReview: 1 },
    );
    assert.equal(status, 0);
  });
});
