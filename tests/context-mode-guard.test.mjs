import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { binaries, check, major, servers } from "../hooks/context-mode-guard.mjs";

const ROOT = "/Users/me/.claude/plugins/cache/context-mode/context-mode/1.0.169";
const HEAL = `node -e "import('./hooks/ensure-deps.mjs').then((m) => m.ensureNativeCompat(process.cwd()))"`;

function nudge(list, self, root = ROOT, heal = HEAL) {
  return `context-mode servers in other sessions run node ${list}, this session runs ${self}, and they all share ${root}'s better_sqlite3.node, which each session's hooks overwrite with the build for its own node. A ctx_* call that fails with "compiled against a different Node.js version" is that swap: run cd "${root}" && ${heal}, then retry the call.`;
}

describe("finding the servers in ps output", () => {
  it("takes each context-mode start.mjs process with its plugin root", () => {
    const ps = [
      `  4903 node ${ROOT}/start.mjs`,
      `68345 node ${ROOT}/start.mjs`,
    ].join("\n");
    assert.deepEqual(servers(ps), [
      { pid: 4903, root: ROOT },
      { pid: 68345, root: ROOT },
    ]);
  });

  it("leaves out every other process", () => {
    const ps = [
      "  101 node /Users/me/app/server.mjs",
      "  102 /bin/zsh -l",
      `  103 node ${ROOT}/hooks/ensure-deps.mjs`,
      `  104 tail -f ${ROOT}/start.mjs`,
    ].join("\n");
    assert.deepEqual(servers(ps), []);
  });
});

describe("roots that are unsafe to paste into a shell command", () => {
  it("skips a process whose path carries shell metacharacters", () => {
    assert.deepEqual(servers('  9 node /x"$(id)"/context-mode/1.0.1/start.mjs'), []);
  });
});

describe("reading the node binary off lsof", () => {
  it("keeps the executable and skips the dylibs txt also lists", () => {
    const lsof = [
      "p4903",
      "ftxt",
      "n/Users/me/.nvm/versions/node/v24.16.0/bin/node",
      "ftxt",
      "n/usr/lib/dyld",
      "p5604",
      "ftxt",
      "n/Users/me/.nvm/versions/node/v20.20.2/bin/node",
    ].join("\n");
    assert.deepEqual(
      binaries(lsof),
      new Map([
        [4903, "/Users/me/.nvm/versions/node/v24.16.0/bin/node"],
        [5604, "/Users/me/.nvm/versions/node/v20.20.2/bin/node"],
      ]),
    );
  });
});

describe("the node major an install path names", () => {
  it("reads nvm's versioned directory", () => {
    assert.equal(major("/Users/me/.nvm/versions/node/v20.20.2/bin/node"), 20);
  });

  it("reads Homebrew's Cellar directory", () => {
    assert.equal(major("/opt/homebrew/Cellar/node@22/22.13.1/bin/node"), 22);
  });

  it("reads fnm's installation directory and a deleted Linux binary", () => {
    assert.equal(major("/h/.fnm/node-versions/v22.1.0/installation/bin/node"), 22);
    assert.equal(major("/h/.nvm/versions/node/v20.20.2/bin/node (deleted)"), 20);
  });

  it("does not guess at a path that carries no version", () => {
    assert.equal(major("/usr/local/bin/node"), null);
    assert.equal(major(""), null);
  });
});

describe("sessions the swap cannot hurt", () => {
  it("says nothing from 22.5 on, where the database opens through node:sqlite", () => {
    const found = [{ root: ROOT, major: 20 }];
    assert.equal(check("22.5.0", found), null);
    assert.equal(check("v24.16.0", found), null);
  });

  it("still warns a 22 below 5, which loads the addon", () => {
    assert.equal(check("22.4.1", [{ root: ROOT, major: 24 }]), nudge("24", 22));
  });
});

describe("when the servers disagree", () => {
  it("says nothing while every server runs this session's major", () => {
    assert.equal(check("20.20.2", [{ root: ROOT, major: 20 }, { root: ROOT, major: 20 }]), null);
  });

  it("says nothing about a server whose major is unknown", () => {
    assert.equal(check("20.20.2", [{ root: ROOT, major: null }]), null);
  });

  it("names the other major, this session's and the heal", () => {
    assert.equal(check("20.20.2", [{ root: ROOT, major: 20 }, { root: ROOT, major: 24 }]), nudge("24", 20));
  });

  it("lists each other major once, lowest first", () => {
    const found = [24, 22, 24, 22].map((m) => ({ root: ROOT, major: m }));
    assert.equal(check("20.20.2", found), nudge("22 and 24", 20));
  });

  it("judges each plugin root on its own", () => {
    const other = "/Users/me/.claude/plugins/cache/context-mode/context-mode/1.0.170";
    const found = [
      { root: ROOT, major: 24 },
      { root: other, major: 22 },
    ];
    assert.equal(check("20.20.2", found), `${nudge("24", 20)}\n${nudge("22", 20, other)}`);
  });

  it("falls back to an npm rebuild where the plugin ships no heal", () => {
    assert.equal(
      check("20.20.2", [{ root: ROOT, major: 24 }], () => false),
      nudge("24", 20, ROOT, "npm rebuild better-sqlite3"),
    );
  });
});

describe("the hook around the check", () => {
  const hook = fileURLToPath(new URL("../hooks/context-mode-guard.mjs", import.meta.url));

  it("exits cleanly with nothing or one SessionStart line, whatever is running", () => {
    // The machine's own processes decide which, so only the shape is pinned.
    const out = execFileSync(process.execPath, [hook], { encoding: "utf8", input: "{}" });
    if (out !== "") {
      assert.equal(JSON.parse(out).hookSpecificOutput.hookEventName, "SessionStart");
    }
  });
});
