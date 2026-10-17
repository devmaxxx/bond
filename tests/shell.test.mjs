import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runsCommand, scrubShell } from "../hooks/shell.mjs";

const GIT_COMMIT = "git(?:\\s+(?:-[Cc]\\s+\\S+|--?\\S+))*\\s+commit";

const runs = (cmd, words = GIT_COMMIT) => runsCommand(scrubShell(cmd), words);

describe("recognising a command at a command position", () => {
  it("matches a plain invocation", () => {
    assert.equal(runs("git commit -m 'x'"), true);
  });

  it("matches after a shell operator", () => {
    assert.equal(runs("git add -A && git commit -m 'x'"), true);
  });

  it("matches through git's own value-taking global flags", () => {
    // A bare `-\S+` repetition stops at the path and misses this entirely.
    assert.equal(runs("git -C /repo commit -m 'x'"), true);
    assert.equal(runs("git -c user.name=x commit -m 'y'"), true);
    assert.equal(runs("git --no-pager commit -m 'z'"), true);
  });

  it("does not match the words inside a heredoc body", () => {
    const script = [
      "python3 - <<'PY'",
      "print('run: git commit -m hi')",
      "PY",
    ].join("\n");
    assert.equal(runs(script), false);
  });

  it("does not match the words inside a quoted argument", () => {
    assert.equal(runs("echo \"then git commit -m x\""), false);
    assert.equal(runs("grep -rn 'git commit' ./docs"), false);
  });

  it("does not match the words in a comment", () => {
    assert.equal(runs("git status # then git commit"), false);
  });

  it("does not match a different subcommand that merely mentions it", () => {
    assert.equal(runs("git log --grep commit"), false);
  });

  it("matches gh pr subcommands", () => {
    const GH_PR = "gh\\s+pr\\s+(?:create|edit|comment|review|merge)";
    assert.equal(runs("gh pr edit 12 --body x", GH_PR), true);
    assert.equal(runs("echo 'gh pr merge 12'", GH_PR), false);
  });
});
