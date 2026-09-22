import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { judge } from "../hooks/bash-budget.mjs";

const BATCH =
  "10 Bash calls in a row, each carrying one command — every call re-reads the whole context. Chain the next ones with && or ;, issue them in one message, or hand the loop to a subagent.";
const GIT_LOG = "git log without a bound — add -n 20 or --oneline.";
const CAT = "cat of a whole file — sed -n 'a,bp' the range you need.";
const LISTING = "unbounded listing — add -maxdepth or | head -50.";
const TEST_RUN =
  "test run without a terse reporter — --reporter=dot, or hand it to TestRunner.";

/** The count the judge hands back, which the wrapper's state file carries. */
const count = (command, singles = 0) => judge(command, singles).singles;
const message = (command, singles = 0) => judge(command, singles).message;

describe("counting calls that carry one command", () => {
  it("counts a lone command as one more in the row", () => {
    assert.equal(count("pwd"), 1);
    assert.equal(count("pwd", 4), 5);
  });

  it("starts the row over on a call that chains commands", () => {
    assert.equal(count("pwd && ls", 4), 0);
    assert.equal(count("pwd; ls", 4), 0);
    assert.equal(count("false || ls", 4), 0);
    assert.equal(count("ls | wc -l", 4), 0);
    assert.equal(count("pwd\nls", 4), 0);
  });

  it("reads a separator inside quotes as text, not as a second command", () => {
    assert.equal(count('echo "a && b"'), 1);
    assert.equal(count("echo 'a; b'"), 1);
    assert.equal(count('grep "a|b" file'), 1);
  });

  it("does not scan a heredoc body for separators", () => {
    assert.equal(count("cat <<'EOF'\na && b\nc | d\nEOF"), 1);
    assert.equal(count("cat <<EOF\na && b\nEOF"), 1);
  });

  it("still sees a separator on the line that opens a heredoc", () => {
    assert.equal(count("cat <<'EOF' && ls\nbody\nEOF"), 0);
  });

  it("keeps a command substitution part of the one command around it", () => {
    assert.equal(count("git show $(git log -1 --format=%H)"), 1);
    assert.equal(count("echo $(a && b)"), 1);
  });

  it("keeps a line continuation part of one command", () => {
    assert.equal(count("git log \\\n  --oneline"), 1);
  });
});

describe("nudging a row of one-command calls into one call", () => {
  it("fires on the tenth call in a row and starts the row over", () => {
    assert.deepEqual(judge("pwd", 9), { message: BATCH, singles: 0 });
  });

  it("stays quiet at nine", () => {
    assert.deepEqual(judge("pwd", 8), { message: null, singles: 9 });
  });

  it("prefers the batch nudge to a shape nudge on the same call", () => {
    assert.deepEqual(judge("git log", 9), { message: BATCH, singles: 0 });
  });

  it("never fires on a call that chains commands", () => {
    assert.deepEqual(judge("pwd && ls", 9), { message: null, singles: 0 });
  });
});

describe("calls dispatched in one message", () => {
  it("leaves the row where it is rather than counting them", () => {
    assert.deepEqual(judge("pwd", 9, true), { message: null, singles: 9 });
    assert.deepEqual(judge("pwd", 4, true), { message: null, singles: 4 });
  });

  it("counts the call when the one before it came from another turn", () => {
    assert.deepEqual(judge("pwd", 9, false), { message: BATCH, singles: 0 });
  });

  it("still names the shape of a call whose output has no bound", () => {
    assert.deepEqual(judge("cat a.txt", 3, true), { message: CAT, singles: 3 });
  });
});

describe("nudging a git log with no bound", () => {
  it("names the bounds when there is none", () => {
    assert.equal(message("git log"), GIT_LOG);
    assert.equal(message("git log --stat"), GIT_LOG);
  });

  it("stays quiet when the log is already bounded", () => {
    assert.equal(message("git log --oneline"), null);
    assert.equal(message("git log -n 5"), null);
    assert.equal(message("git log -n5"), null);
    assert.equal(message("git log --max-count=5"), null);
    assert.equal(message("git log -5"), null);
    assert.equal(message("git log | head -20"), null);
  });

  it("reads the bound in the segment that runs the log, not a later one", () => {
    assert.equal(message("git log | grep --oneline"), GIT_LOG);
  });
});

describe("nudging a cat of a whole file", () => {
  it("names the range form when a single file is read whole", () => {
    assert.equal(message("cat hooks/bash-budget.mjs"), CAT);
  });

  it("stays quiet when the file is piped into something that bounds it", () => {
    assert.equal(message("cat a.txt | head"), null);
    assert.equal(message("cat a.txt | grep x"), null);
  });

  it("stays quiet for shapes that are not one whole file", () => {
    // Two paths is a deliberate join, and a flag means cat is doing something
    // other than handing over the file.
    assert.equal(message("cat a b"), null);
    assert.equal(message("cat -n a.txt"), null);
    assert.equal(message("cat <<'EOF'\nbody\nEOF"), null);
  });
});

describe("nudging an unbounded listing", () => {
  it("names the bounds for a recursive ls and a bare find", () => {
    assert.equal(message("ls -R"), LISTING);
    assert.equal(message("ls -lR src"), LISTING);
    assert.equal(message("find . -name x"), LISTING);
  });

  it("stays quiet when the listing is already bounded", () => {
    assert.equal(message("find . -maxdepth 2"), null);
    assert.equal(message("find . | head"), null);
    assert.equal(message("ls -R | head -50"), null);
    assert.equal(message("ls -la"), null);
  });
});

describe("nudging a test run with no terse reporter", () => {
  it("names the reporter when the run has none", () => {
    assert.equal(message("vitest run"), TEST_RUN);
    assert.equal(message("pnpm test"), TEST_RUN);
    assert.equal(message("pnpm turbo run test --filter=x"), TEST_RUN);
  });

  it("stays quiet once a reporter is named", () => {
    assert.equal(message("vitest --reporter=dot"), null);
    assert.equal(message("pnpm test --reporter dot"), null);
  });
});

describe("the hook around the judgement", () => {
  const hook = fileURLToPath(
    new URL("../hooks/bash-budget.mjs", import.meta.url),
  );

  const state = (session) => join(tmpdir(), "bond", `${session}.bash-singles`);

  /**
   * Age the counter past the parallel window, which is what a model turn
   * between two calls does; the calls of this loop are milliseconds apart.
   */
  function fromAnotherTurn(session) {
    const when = (Date.now() - 5000) / 1000;
    utimesSync(state(session), when, when);
  }

  function run(command, session) {
    return execFileSync(process.execPath, [hook], {
      encoding: "utf8",
      input: JSON.stringify({
        session_id: session,
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command },
      }),
    });
  }

  it("hands the nudge back as context and decides nothing", () => {
    const session = `bond-test-${process.pid}-context`;
    try {
      const out = JSON.parse(run("cat a.txt", session));
      assert.deepEqual(out, {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: CAT,
        },
      });
    } finally {
      rmSync(state(session), { force: true });
    }
  });

  it("prints nothing when there is nothing to say", () => {
    const session = `bond-test-${process.pid}-quiet`;
    try {
      assert.equal(run("pwd", session), "");
    } finally {
      rmSync(state(session), { force: true });
    }
  });

  it("carries the row across calls of one session", () => {
    const session = `bond-test-${process.pid}-row`;
    try {
      for (let i = 0; i < 9; i += 1) {
        assert.equal(run("pwd", session), "");
        fromAnotherTurn(session);
      }
      const out = JSON.parse(run("pwd", session));
      assert.equal(out.hookSpecificOutput.additionalContext, BATCH);
      // The row starts over, so the eleventh call is quiet again.
      fromAnotherTurn(session);
      assert.equal(run("pwd", session), "");
    } finally {
      rmSync(state(session), { force: true });
    }
  });

  it("reads the gap off the counter and skips a call of the same message", () => {
    const session = `bond-test-${process.pid}-parallel`;
    try {
      for (let i = 0; i < 8; i += 1) {
        assert.equal(run("pwd", session), "");
        fromAnotherTurn(session);
      }
      // The ninth leaves the counter freshly written, so the tenth reads a
      // sub-second gap and does not lengthen the row — without the skip it
      // would be the tenth in a row and would nudge here.
      assert.equal(run("pwd", session), "");
      assert.equal(run("pwd", session), "");
      fromAnotherTurn(session);
      const out = JSON.parse(run("pwd", session));
      assert.equal(out.hookSpecificOutput.additionalContext, BATCH);
    } finally {
      rmSync(state(session), { force: true });
    }
  });
});
