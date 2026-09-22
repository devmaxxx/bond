import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { check } from "../hooks/node-guard.mjs";

function nudge(wanted, actual) {
  return `shell node is ${actual}; .nvmrc wants ${wanted}. Bash calls do not keep env, so prefix each pnpm/node command: PATH="$(nvm which ${wanted} | xargs dirname):$PATH" pnpm …`;
}

describe("the versions a pin accepts", () => {
  it("says nothing when the shell runs exactly the pinned version", () => {
    assert.equal(check("24.16.0", "24.16.0"), null);
  });

  it("reads a shorter pin as every release under it", () => {
    assert.equal(check("24", "24.16.0"), null);
    assert.equal(check("24.16", "24.16.0"), null);
  });

  it("does not let a pin match across a version part", () => {
    // A plain string prefix would call 24.1 a match for 24.16.0, and they are
    // two different minors.
    assert.equal(check("24.1", "24.16.0"), nudge("24.1", "24.16.0"));
  });

  it("names both versions and the prefix when they differ", () => {
    assert.equal(check("24.16.0", "22.14.0"), nudge("24.16.0", "22.14.0"));
  });

  it("does not read a longer pin as satisfied by a shorter version", () => {
    assert.equal(check("24.16.0", "24"), nudge("24.16.0", "24"));
  });
});

describe("pins there is nothing to compare against", () => {
  it("says nothing about an alias only nvm could resolve", () => {
    assert.equal(check("lts/*", "24.16.0"), null);
    assert.equal(check("lts/hydrogen", "22.14.0"), null);
  });

  it("says nothing about an empty pin", () => {
    assert.equal(check("", "24.16.0"), null);
    assert.equal(check("  \n", "24.16.0"), null);
  });
});

describe("the shapes a pin file and process.version come in", () => {
  it("ignores the v and the trailing newline the file carries", () => {
    assert.equal(check("v24.16.0\n", "24.16.0"), null);
    assert.equal(check("v24\n", "24.16.0"), null);
  });

  it("ignores the v that process.version always carries", () => {
    assert.equal(check("24.16.0", "v24.16.0"), null);
    assert.equal(check("24.16.0", "v22.14.0"), nudge("24.16.0", "22.14.0"));
  });
});

describe("the hook around the check", () => {
  const hook = fileURLToPath(
    new URL("../hooks/node-guard.mjs", import.meta.url),
  );
  const actual = process.version.replace(/^v/, "");

  function run(cwd) {
    return execFileSync(process.execPath, [hook], {
      encoding: "utf8",
      input: JSON.stringify({
        session_id: `bond-test-${process.pid}`,
        hook_event_name: "SessionStart",
        source: "startup",
        cwd,
      }),
    });
  }

  function workspace(files) {
    const root = mkdtempSync(join(tmpdir(), "bond-node-"));
    for (const [name, pin] of Object.entries(files)) {
      writeFileSync(join(root, name), `${pin}\n`);
    }
    return root;
  }

  it("reads the pin off .nvmrc and names the prefix", () => {
    const root = workspace({ ".nvmrc": "9.9.9" });
    try {
      assert.deepEqual(JSON.parse(run(root)), {
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: nudge("9.9.9", actual),
        },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("falls back to .node-version", () => {
    const root = workspace({ ".node-version": "9.9.9" });
    try {
      assert.equal(
        JSON.parse(run(root)).hookSpecificOutput.additionalContext,
        nudge("9.9.9", actual),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("takes .nvmrc when the tree carries both", () => {
    const root = workspace({ ".nvmrc": actual, ".node-version": "9.9.9" });
    try {
      assert.equal(run(root), "");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prints nothing when the shell node satisfies the pin", () => {
    const root = workspace({ ".nvmrc": actual });
    try {
      assert.equal(run(root), "");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prints nothing in a tree that pins no version", () => {
    const root = workspace({});
    try {
      assert.equal(run(root), "");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prints nothing when the payload is not readable", () => {
    assert.equal(
      execFileSync(process.execPath, [hook], {
        encoding: "utf8",
        input: "not json",
      }),
      "",
    );
  });
});
