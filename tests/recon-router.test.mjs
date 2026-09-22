import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { route } from "../hooks/recon-router.mjs";

const SCOUT =
  "recon question — `repo-scout` answers it from the graph in ~1 KB; general-purpose pays the search in full and returns it all.";
const EXPLORE =
  'recon question — the `Explore` agent with a breadth ("medium"/"very thorough") returns the conclusion, not the file dumps.';

describe("naming the agent that answers a recon question", () => {
  it("names repo-scout when the repository has one", () => {
    assert.equal(
      route(
        { subagent_type: "general-purpose", prompt: "where is X defined?" },
        true,
      ),
      SCOUT,
    );
  });

  it("names Explore and its breadth when it does not", () => {
    assert.equal(
      route(
        { subagent_type: "general-purpose", prompt: "where is X defined?" },
        false,
      ),
      EXPLORE,
    );
  });
});

describe("the agents this fires for", () => {
  const prompt = "where is X defined?";

  it("fires for the unnamed and the general-purpose agent alike", () => {
    assert.equal(route({ prompt }, true), SCOUT);
    assert.equal(route({ subagent_type: "", prompt }, true), SCOUT);
    assert.equal(
      route({ subagent_type: "general-purpose", prompt }, true),
      SCOUT,
    );
    assert.equal(route({ subagent_type: "general", prompt }, true), SCOUT);
  });

  it("stays quiet once an agent is named", () => {
    assert.equal(route({ subagent_type: "Explore", prompt }, true), null);
    assert.equal(route({ subagent_type: "repo-scout", prompt }, true), null);
  });
});

describe("the prompts this reads as recon", () => {
  const ask = (prompt) =>
    route({ subagent_type: "general-purpose", prompt }, true);

  it("fires on a question about where something lives or what reaches it", () => {
    assert.equal(ask("where does the budget hook read its state?"), SCOUT);
    assert.equal(ask("What calls judge()?"), SCOUT);
    assert.equal(ask("which file holds the matcher?"), SCOUT);
    assert.equal(ask("find all the callers of decide"), SCOUT);
    assert.equal(ask("how is the PR template wired into the hook?"), SCOUT);
  });

  it("stays quiet on a prompt that asks for the change as well", () => {
    const builds = [
      "Implement the retry policy in the worker and find the tests that cover it.",
      "Refactor UserService: split it into small named functions, and update which files import it.",
      "Add a migration for the new column, then find all callers of createInvoice and update them.",
      "Write a README section that explains how is the PR template wired into the hook.",
    ];
    for (const prompt of builds) {
      assert.equal(ask(prompt), null, prompt);
    }
  });

  it("still fires on a question that only asks where the code is", () => {
    assert.equal(
      ask("Where does the invoice total get rounded, and what calls it?"),
      SCOUT,
    );
  });

  it("stays quiet on work that is not recon", () => {
    assert.equal(ask("implement the endpoint"), null);
    assert.equal(ask("rewrite the README hooks section"), null);
  });

  it("stays quiet when there is no prompt to read", () => {
    assert.equal(route({ subagent_type: "general-purpose" }, true), null);
    assert.equal(route({}, true), null);
  });
});

describe("the hook around the routing", () => {
  const hook = fileURLToPath(
    new URL("../hooks/recon-router.mjs", import.meta.url),
  );

  function run(toolInput, cwd) {
    return execFileSync(process.execPath, [hook], {
      encoding: "utf8",
      input: JSON.stringify({
        session_id: `bond-test-${process.pid}`,
        hook_event_name: "PreToolUse",
        tool_name: "Agent",
        cwd,
        tool_input: toolInput,
      }),
    });
  }

  function workspace(withScout) {
    const root = mkdtempSync(join(tmpdir(), "bond-recon-"));
    if (withScout) {
      mkdirSync(join(root, ".claude", "agents"), { recursive: true });
      writeFileSync(join(root, ".claude", "agents", "repo-scout.md"), "");
    }
    return root;
  }

  it("reads repo-scout off the working tree and decides nothing", () => {
    const root = workspace(true);
    try {
      const out = JSON.parse(
        run({ subagent_type: "general-purpose", prompt: "where is X?" }, root),
      );
      assert.deepEqual(out, {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: SCOUT,
        },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("falls back to Explore in a tree that has no repo-scout", () => {
    const root = workspace(false);
    try {
      const out = JSON.parse(
        run({ subagent_type: "general-purpose", prompt: "where is X?" }, root),
      );
      assert.equal(out.hookSpecificOutput.additionalContext, EXPLORE);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exits 0 on a payload that main() cannot handle", () => {
    // A cwd that is no string makes the path join throw outside every try in
    // main(); execFileSync rejects a nonzero exit, so this is the outer guard.
    assert.equal(
      run({ subagent_type: "general-purpose", prompt: "where is X?" }, 123),
      "",
    );
  });

  it("prints nothing when there is nothing to say", () => {
    const root = workspace(true);
    try {
      assert.equal(
        run({ subagent_type: "general-purpose", prompt: "implement it" }, root),
        "",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
