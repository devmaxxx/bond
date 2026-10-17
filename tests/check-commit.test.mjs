import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const HOOK = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "hooks",
  "check-commit.mjs",
);

/** Drives the real hook the way Claude Code does: payload on stdin. */
function checkCommit(command) {
  const result = spawnSync("node", [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
  });
  return { status: result.status, stderr: result.stderr };
}

const BAD_SUBJECT = "fixed the thing";

describe("which commands check-commit.mjs inspects", () => {
  it("inspects a commit at any command position", () => {
    assert.equal(checkCommit(`git commit -m "${BAD_SUBJECT}"`).status, 2);
    assert.equal(checkCommit(`git add -A && git commit -m "${BAD_SUBJECT}"`).status, 2);
  });

  it("inspects a commit behind git's value-taking global flags", () => {
    assert.equal(checkCommit(`git -C /repo commit -m "${BAD_SUBJECT}"`).status, 2);
    assert.equal(checkCommit(`git -c user.name=x commit -m "${BAD_SUBJECT}"`).status, 2);
    assert.equal(checkCommit(`git --no-pager commit -m "${BAD_SUBJECT}"`).status, 2);
  });

  it("inspects a commit hidden behind a wrapper", () => {
    assert.equal(checkCommit(`env FOO=1 git commit -m "${BAD_SUBJECT}"`).status, 2);
    assert.equal(
      checkCommit(`bash -c 'git commit -m "fix(api): x" -m "Co-Authored-By: Claude <noreply@anthropic.com>"'`)
        .status,
      2,
    );
  });

  it("ignores the words inside a quoted argument, a comment or another subcommand", () => {
    assert.equal(checkCommit(`echo "then git commit -m '${BAD_SUBJECT}'"`).status, 0);
    assert.equal(checkCommit(`grep -rn 'git commit' ./docs`).status, 0);
    assert.equal(checkCommit(`git status # then git commit -m "${BAD_SUBJECT}"`).status, 0);
    assert.equal(checkCommit("git log --grep commit").status, 0);
  });

  it("inspects the gh pr subcommands it guards, and only those", () => {
    const trailer = "Co-Authored-By: Claude <noreply@anthropic.com>";
    assert.equal(checkCommit(`gh pr edit 12 --body "${trailer}"`).status, 2);
    assert.equal(checkCommit(`gh pr list --search "${trailer}"`).status, 0);
    assert.equal(checkCommit(`echo 'gh pr merge 12 ${trailer}'`).status, 0);
  });

  it("lets an unreadable line through", () => {
    assert.equal(checkCommit(`git commit -m "${BAD_SUBJECT}`).status, 0);
  });

  it("ignores a command that runs neither git commit nor gh pr", () => {
    assert.equal(checkCommit("ls -la && cat README.md").status, 0);
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

  it("reads -m, not a later unrelated heredoc, as the subject", () => {
    // The shape that blocked a session: a conventional -m commit chained
    // with a python heredoc whose first line was read as the subject.
    const script = [
      'git commit -q -m "fix(etl): keep NULL positions" && python3 - <<\'EOF\'',
      "import json,os",
      "EOF",
    ].join("\n");
    assert.equal(checkCommit(script).status, 0);
  });

  it("still reads a heredoc fed to git commit -F -", () => {
    const script = ["git commit -F - <<'EOF'", BAD_SUBJECT, "EOF"].join("\n");
    assert.equal(checkCommit(script).status, 2);
  });

  it("still reads a heredoc inside -m \"$(cat <<EOF)\"", () => {
    const script = ['git commit -m "$(cat <<\'EOF\'', BAD_SUBJECT, "EOF", ')"'].join("\n");
    assert.equal(checkCommit(script).status, 2);
  });

  it("still blocks a non-conventional subject on a real commit", () => {
    const { status, stderr } = checkCommit(`git commit -m "${BAD_SUBJECT}"`);
    assert.equal(status, 2);
    assert.match(stderr, /must be/);
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
});
