import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decide, lex, parseAccounts } from "../hooks/gh-account-guard.mjs";

const accounts = parseAccounts("acme=work, me=me");
const base = {
  accounts,
  active: "work",
  sshAccount: "work",
  remotes: new Map([["origin", "git@github.com:me/tool.git"]]),
  currentBranch: "fix/thing",
};
const origin = (url) => ({ remotes: new Map([["origin", url]]) });
const run = (cmd, over = {}) => {
  const opts = { ...base, ...over };
  return decide({ ...opts, cmd, repoAt: () => ({ remotes: opts.remotes, currentBranch: opts.currentBranch }) });
};
const https = { ...origin("https://github.com/me/tool.git"), httpsUsesGh: () => true };

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
    assert.equal(run("gh pr create", origin("git@github.com:other/x.git")), null);
  });

  it("does nothing when no accounts are configured", () => {
    assert.equal(run("gh pr create", { accounts: parseAccounts("") }), null);
  });

  it("reads the repo only from argument positions, never from a body or message", () => {
    assert.match(run("gh pr create --body 'see https://github.com/acme/app/issues/3'"), /me\/tool belongs to me/);
    assert.match(run("gh pr create --body-file - <<'EOF'\nsee repos/acme/app\nEOF"), /me\/tool belongs to me/);
  });

  it("trusts GH_TOKEN only as a prefix of the gh it precedes", () => {
    assert.match(run("gh pr create --body 'set GH_TOKEN=abc first'"), /active gh account is work/);
    assert.match(run("GH_TOKEN=$(gh auth token -u me) gh pr view 1 && gh pr create"), /active gh account is work/);
  });

  it("trusts a GH_TOKEN already exported to the session", () => {
    assert.equal(run("gh pr create", { envToken: true }), null);
  });

  it("compares logins without case", () => {
    assert.equal(run("gh pr create", { accounts: parseAccounts("me=Me"), active: "me" }), null);
  });

  it("treats every gh verb outside the read list as a write", () => {
    assert.match(run("gh pr lock 3"), /active gh account is work/);
    assert.match(run("gh pr update-branch 3"), /active gh account is work/);
    assert.equal(run("gh pr checks 3"), null);
    assert.equal(run("gh auth status"), null);
  });

  it("reads the repo from a one-word quoted -R", () => {
    assert.equal(run('gh pr comment 4 -R "acme/app" --body ok'), null);
  });
});

describe("pushes over an SSH key that belongs to the other account", () => {
  it("blocks and gives the HTTPS push, with the fetch that refreshes origin", () => {
    const msg = run("git push -u origin fix/thing");
    assert.match(msg, /SSH remote authenticates as work/);
    assert.match(msg, /push -u https:\/\/github\.com\/me\/tool\.git fix\/thing && git fetch origin fix\/thing/);
  });

  it("allows the push when the SSH key's account owns the repo", () => {
    assert.equal(run("git push", origin("git@github.com:acme/app.git")), null);
  });

  it("allows an HTTPS remote and an unset SSH account", () => {
    assert.equal(run("git push", origin("https://github.com/me/tool.git")), null);
    assert.equal(run("git push", { sshAccount: null }), null);
  });

  it("keeps the push's flags and fetches the refspec's destination branch", () => {
    const msg = run("git push --force-with-lease origin HEAD:refs/heads/fix/a");
    assert.match(msg, /push --force-with-lease https:\/\/github\.com\/me\/tool\.git HEAD:refs\/heads\/fix\/a && git fetch origin fix\/a/);
  });

  it("judges the remote actually pushed, not origin", () => {
    const remotes = new Map([["origin", "git@github.com:me/tool.git"], ["upstream", "git@github.com:acme/app.git"]]);
    assert.equal(run("git push upstream x", { remotes }), null);
  });

  it("is not fooled by a repo URL in the commit message before the push", () => {
    assert.match(run("git commit -m 'see github.com/acme/app/pull/1' && git push"), /SSH remote authenticates as work/);
  });

  it("ignores the words when they are only data", () => {
    assert.equal(run("echo 'run git push later'"), null);
  });
});

describe("reading the command the way the shell does", () => {
  it("keeps braces and ${} inside one word", () => {
    assert.match(run("gh api repos/me/tool/issues/${N}/comments -f body=x"), /active gh account is work/);
    assert.match(run("gh api repos/{owner}/{repo}/pulls -f title=x"), /active gh account is work/);
  });

  it("sees through shell keywords and wrappers", () => {
    for (const cmd of [
      "if ! git diff --quiet; then git push origin x; fi",
      "timeout 30 git push origin x",
      "sudo git push origin x",
      "env -u FOO git push origin x",
    ]) {
      assert.match(run(cmd), /SSH remote authenticates as work/, cmd);
    }
  });

  it("reads the script handed to bash -c, eval and a substitution", () => {
    assert.match(run("bash -c 'git push origin x'"), /SSH remote/);
    assert.match(run('echo "$(gh pr create --fill)"'), /active gh account is work/);
  });

  it("does not let an apostrophe in a comment swallow the commands after it", () => {
    assert.match(run("# don't touch\ngit push origin x\n# it's done"), /SSH remote/);
  });

  it("drops heredoc bodies and keeps the command after them", () => {
    assert.deepEqual(lex("cat <<'EOF'\ngit push\nEOF\nls"), [["cat"], ["ls"]]);
  });
});

describe("HTTPS pushes through gh's credential helper", () => {
  it("blocks when the active account is the wrong one", () => {
    assert.match(run("git push origin x", https), /would push as the active account, work/);
  });

  it("allows it with a GH_TOKEN prefix, or when gh is not the helper", () => {
    assert.equal(run("GH_TOKEN=$(gh auth token -u me) git push origin x", https), null);
    assert.equal(run("git push origin x", { ...https, httpsUsesGh: () => false }), null);
  });
});

describe("gh api reads and writes", () => {
  it("treats an explicit GET as a read and -XPOST as a write", () => {
    assert.equal(run("gh api -X GET repos/me/tool/issues -f state=open"), null);
    assert.match(run("gh api -XPOST repos/me/tool/issues -f title=x"), /active gh account is work/);
  });

  it("has no opinion on a call that names no repo", () => {
    assert.equal(run("gh api graphql -f query=x"), null);
  });
});

describe("the suggested push", () => {
  it("adds no refspec to --all and quotes a value with a space", () => {
    const msg = run("git push --all -o 'a b' origin");
    assert.match(msg, /push --all -o 'a b' https:\/\/github\.com\/me\/tool\.git && git fetch origin\n/);
  });

  it("judges the repo a cd or -C points at", () => {
    const seen = [];
    const repoAt = (dir) => {
      seen.push(dir);
      return { remotes: new Map([["origin", "git@github.com:acme/app.git"]]), currentBranch: "x" };
    };
    assert.equal(decide({ ...base, cwd: "/w", cmd: "cd ../other && git -C sub push", repoAt }), null);
    assert.deepEqual(seen, ["/other/sub"]);
  });
});
