import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { runsCommand, scrubShell } from "../hooks/shell.mjs";

const HOOK = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "hooks",
  "check-commit.mjs",
);

const GIT_COMMIT = "git(?:\\s+(?:-[Cc]\\s+\\S+|--?\\S+))*\\s+commit";

const runs = (cmd, words = GIT_COMMIT) => runsCommand(scrubShell(cmd), words);

/** Drives the real hook the way Claude Code does: payload on stdin. */
function checkCommit(command) {
  const result = spawnSync("node", [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
  });
  return { status: result.status, stderr: result.stderr };
}

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

  it("matches the gh pr subcommands the hook guards", () => {
    const GH_PR = "gh\\s+pr\\s+(?:create|edit|comment|review|merge)";
    assert.equal(runs("gh pr edit 12 --body x", GH_PR), true);
    assert.equal(runs("echo 'gh pr merge 12'", GH_PR), false);
  });
});

describe("check-commit.mjs end to end", () => {
  it("lets a heredoc that merely prints the words through", () => {
    // The exact shape that blocked a session: a diagnostic containing the words,
    // whose first line was then read as a commit subject and rejected.
    const script = [
      "python3 - <<'PY'",
      "print('## Checklist before `git commit` / PR / doc')",
      "PY",
    ].join("\n");
    assert.equal(checkCommit(script).status, 0);
  });

  it("still blocks a non-conventional subject on a real commit", () => {
    const { status, stderr } = checkCommit('git commit -m "fixed the thing"');
    assert.equal(status, 2);
    assert.match(stderr, /Conventional Commits subject|must be/);
  });

  it("still blocks an AI trailer on a real commit", () => {
    const { status, stderr } = checkCommit(
      'git commit -m "fix(api): tidy" -m "Co-Authored-By: Claude <noreply@anthropic.com>"',
    );
    assert.equal(status, 2);
    assert.match(stderr, /AI breadcrumb/);
  });

  it("accepts a conventional subject with no trailer", () => {
    assert.equal(checkCommit('git commit -m "fix(api): tidy the export"').status, 0);
  });

  it("ignores a command that runs neither git commit nor gh pr", () => {
    assert.equal(checkCommit("ls -la && cat README.md").status, 0);
  });
});
