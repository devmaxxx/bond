import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decide, parseAccounts } from "../hooks/gh-account-guard.mjs";

const accounts = parseAccounts("acme=work, me=me");
const base = {
  accounts,
  active: "work",
  sshAccount: "work",
  originUrl: "git@github.com:me/tool.git",
};
const run = (cmd, over = {}) => decide({ ...base, cmd, ...over });

describe("gh writes under the wrong active account", () => {
  it("blocks a PR create in a repo owned by the other account", () => {
    const msg = run("gh pr create --base main --title 'x' --body-file -");
    assert.match(msg, /belongs to me, but the active gh account is work/);
    assert.match(msg, /GH_TOKEN=\$\(gh auth token -u me\)/);
  });

  it("lets the same command through once it sets GH_TOKEN itself", () => {
    assert.equal(run("GH_TOKEN=$(gh auth token -u me) gh pr create --base main"), null);
  });

  it("allows a write when the active account already matches", () => {
    assert.equal(run("gh pr merge 3 --squash", { active: "me" }), null);
  });

  it("reads the repo from -R before the cwd's remote", () => {
    assert.equal(run("gh pr comment 4 -R acme/app --body ok"), null);
  });

  it("reads the owner from a gh api path, and only for a write", () => {
    assert.match(run("gh api -X DELETE repos/me/tool/issues/2/labels/x"), /active gh account is work/);
    assert.equal(run("gh api repos/me/tool/pulls"), null);
  });

  it("has no opinion on reads or on an owner missing from the map", () => {
    assert.equal(run("gh pr view 3 --json state"), null);
    assert.equal(run("gh pr create", { originUrl: "git@github.com:other/x.git" }), null);
  });

  it("does nothing when no accounts are configured", () => {
    assert.equal(run("gh pr create", { accounts: parseAccounts("") }), null);
  });
});

describe("pushes over an SSH key that belongs to the other account", () => {
  it("blocks and gives the HTTPS push, with the fetch that refreshes origin", () => {
    const msg = run("git push -u origin fix/thing");
    assert.match(msg, /SSH remote authenticates as work/);
    assert.match(msg, /push https:\/\/github\.com\/me\/tool\.git fix\/thing && git fetch origin fix\/thing/);
  });

  it("allows the push when the SSH key's account owns the repo", () => {
    assert.equal(run("git push", { originUrl: "git@github.com:acme/app.git" }), null);
  });

  it("allows an HTTPS remote and an unset SSH account", () => {
    assert.equal(run("git push", { originUrl: "https://github.com/me/tool.git" }), null);
    assert.equal(run("git push", { sshAccount: null }), null);
  });

  it("ignores the words when they are only data", () => {
    assert.equal(run("echo 'run git push later'"), null);
  });
});
