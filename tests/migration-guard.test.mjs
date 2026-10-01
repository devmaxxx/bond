import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

import { decide } from "../plugins/bond-bonliva/hooks/migration-guard.mjs";

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), "..", "plugins", "bond-bonliva");
const HOOK = join(PLUGIN, "hooks", "migration-guard.mjs");
const HOOKS_JSON = join(PLUGIN, "hooks", "hooks.json");
const NOW = 1790000000000;
const TS_DIR = "/repo/packages/db/src/migrations";
const TS_EXISTING = [
  "1771954728217-add-wr-draft-sync-status.ts",
  "1781800000000-AddLegacyPascalName.ts",
  "tenant-coverage.contract.test.ts",
];

function newFile(name, overrides = {}) {
  return decide({
    filePath: join(TS_DIR, name),
    fileExists: false,
    existing: TS_EXISTING,
    branchAdded: [],
    now: NOW,
    ...overrides,
  });
}

describe("files the guard leaves alone", () => {
  it("ignores a file outside a migrations directory", () => {
    assert.deepEqual(
      decide({
        filePath: "/repo/src/services/Thing.ts",
        fileExists: false,
        existing: [],
        branchAdded: ["src/migrations/1781800000001-x.ts"],
        now: NOW,
      }),
      [],
    );
  });

  it("lets an existing migration be rewritten — that is an update", () => {
    assert.deepEqual(newFile("1.ts", { fileExists: true }), []);
  });

  it("ignores tests and type declarations kept beside migrations", () => {
    assert.deepEqual(newFile("Anything.integration.test.ts"), []);
    assert.deepEqual(newFile("types.d.ts"), []);
  });

  it("ignores non-code files such as data fixtures", () => {
    assert.deepEqual(newFile("Customers.json"), []);
  });
});

describe("a 13-digit timestamp convention", () => {
  it("accepts a kebab-case name whose prefix sorts last", () => {
    assert.deepEqual(newFile("1781800001000-add-index.ts"), []);
  });

  it("rejects a prefix that does not sort after the newest migration", () => {
    const reasons = newFile("1771954728218-add-index.ts");
    assert.equal(reasons.length, 1);
    assert.match(reasons[0], /does not sort after the newest migration \(1781800000000\)/);
  });

  it("rejects a prefix equal to the newest one", () => {
    assert.equal(newFile("1781800000000-add-index.ts").length, 1);
  });

  it("rejects a short or missing prefix and suggests one that sorts last", () => {
    const [short] = newFile("20260916-add-index.ts");
    assert.match(short, /13-digit timestamp prefix/);
    assert.match(short, /e\.g\. 1790000000000/);
    assert.equal(newFile("add-index.ts").length, 1);
  });

  it("suggests the newest prefix plus 1000 when it is ahead of the clock", () => {
    const [reason] = newFile("add-index.ts", { now: 1700000000000 });
    assert.match(reason, /e\.g\. 1781800001000/);
  });

  it("rejects a PascalCase name even when the prefix is right", () => {
    const reasons = newFile("1781800001000-AddIndex.ts");
    assert.equal(reasons.length, 1);
    assert.match(reasons[0], /kebab-case/);
  });

  it("asks for 13 digits in a directory with no migrations yet", () => {
    const reasons = newFile("20260916-first.ts", { existing: [] });
    assert.match(reasons[0], /13-digit timestamp prefix/);
    assert.deepEqual(newFile("1790000000000-first.ts", { existing: [] }), []);
  });
});

describe("a YYYYMMDD date convention", () => {
  const existing = [
    "20250103-remove-legacy-data.ts",
    "20260916-backfill-contract-type.ts",
  ];
  const mongo = (name) =>
    decide({
      filePath: `/repo/apps/migrator/src/migrations/${name}`,
      fileExists: false,
      existing,
      branchAdded: [],
      now: NOW,
    });

  it("follows the directory's own prefix width", () => {
    assert.deepEqual(mongo("20261001-add-index.ts"), []);
    assert.match(mongo("1790000000000-add-index.ts")[0], /YYYYMMDD date prefix/);
  });

  it("accepts a second migration dated the same day", () => {
    assert.deepEqual(mongo("20260916-another-change.ts"), []);
  });

  it("rejects a date before the newest migration", () => {
    assert.match(mongo("20260101-late.ts")[0], /does not sort after/);
  });
});

describe("one unmerged migration per branch", () => {
  it("blocks a second new migration and names the one to update", () => {
    const reasons = newFile("1781800001000-add-index.ts", {
      branchAdded: ["packages/db/src/migrations/1781800000500-add-column.ts"],
    });
    assert.equal(reasons.length, 1);
    assert.match(reasons[0], /already adds .*1781800000500-add-column\.ts — update that migration/);
  });

  it("says how the user, and only the user, can allow a second one", () => {
    const [reason] = newFile("1781800001000-add-index.ts", {
      branchAdded: ["packages/db/src/migrations/1781800000500-add-column.ts"],
    });
    assert.match(reason, /BOND_MIGRATION_GUARD=off/);
  });

  it("does not count the file being written as the earlier one", () => {
    assert.deepEqual(
      newFile("1781800001000-add-index.ts", {
        branchAdded: ["packages/db/src/migrations/1781800001000-add-index.ts"],
      }),
      [],
    );
  });
});

// The hook's own git calls inherit this environment; a developer's global
// config (core.quotePath, diff.renames, init.defaultBranch) must not decide a test.
const ISOLATED = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };

const scratch = [];
after(() => {
  for (const dir of scratch) {
    rmSync(dir, { recursive: true, force: true });
  }
});
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "migration-guard-"));
  scratch.push(dir);
  return dir;
}

function runHook(hook, payload, env = {}) {
  return spawnSync(process.execPath, [hook], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...ISOLATED, BOND_MIGRATION_GUARD: "", ...env },
  });
}

/**
 * A repository whose `origin/main` holds one migration, with `feat/x` checked
 * out. `main` commits to that base afterwards, as another team's merge would.
 */
function makeRepo(migrations = join("db", "migrations")) {
  const repo = tempDir();
  const dir = join(repo, migrations);
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { stdio: "ignore", env: ISOLATED });
  const put = (name) => writeFileSync(join(dir, name), "");
  const commit = (message) => {
    git("add", "-A");
    git("commit", "-q", "-m", message);
  };
  mkdirSync(dir, { recursive: true });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  put("1781800000000-base.ts");
  commit("chore: base");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("switch", "-q", "-c", "feat/x");
  return {
    dir,
    git,
    put,
    commit,
    mergeIntoBase(name) {
      git("switch", "-q", "main");
      put(name);
      commit(`feat: ${name}`);
      git("update-ref", "refs/remotes/origin/main", "HEAD");
      git("switch", "-q", "feat/x");
    },
    run: (name, tool = "Write", env) =>
      runHook(HOOK, { cwd: repo, tool_name: tool, tool_input: { file_path: join(dir, name) } }, env),
  };
}

describe("the hook against a real repository", () => {
  it("allows the branch's first migration", () => {
    const result = makeRepo().run("1781800001000-first.ts");
    assert.equal(result.status, 0, result.stderr);
  });

  it("blocks a second one once the first is committed on the branch", () => {
    const repo = makeRepo();
    repo.put("1781800001000-first.ts");
    repo.commit("feat: first");
    const result = repo.run("1781800002000-second.ts");
    assert.equal(result.status, 2);
    assert.match(result.stderr, /1781800001000-first\.ts — update that migration/);
  });

  it("counts an uncommitted new migration too", () => {
    const repo = makeRepo();
    repo.put("1781800003000-draft.ts");
    const result = repo.run("1781800004000-other.ts");
    assert.equal(result.status, 2);
    assert.match(result.stderr, /1781800003000-draft\.ts/);
  });

  it("counts a migration staged but not committed", () => {
    const repo = makeRepo();
    repo.put("1781800003000-staged.ts");
    repo.git("add", "-A");
    assert.equal(repo.run("1781800004000-other.ts").status, 2);
  });
});

describe("what git lists as this branch's migrations", () => {
  it("does not count one deleted from the working tree, so it can be replaced", () => {
    const repo = makeRepo();
    repo.put("1781800001000-first.ts");
    repo.commit("feat: first");
    rmSync(join(repo.dir, "1781800001000-first.ts"));
    assert.equal(repo.run("1781800002000-second.ts").status, 0);
  });

  it("does not count a file in a subdirectory of migrations", () => {
    const repo = makeRepo();
    mkdirSync(join(repo.dir, "archive"));
    writeFileSync(join(repo.dir, "archive", "1781800001000-old.ts"), "");
    assert.equal(repo.run("1781800002000-second.ts").status, 0);
  });

  it("does not count one that was staged and then deleted", () => {
    const repo = makeRepo();
    repo.put("1781800001000-first.ts");
    repo.git("add", "-A");
    rmSync(join(repo.dir, "1781800001000-first.ts"));
    assert.equal(repo.run("1781800002000-second.ts").status, 0);
  });

  it("counts one whose name has non-ASCII letters, which git would quote", () => {
    const repo = makeRepo();
    repo.put("1781800001000-é-first.ts");
    repo.commit("feat: first");
    const result = repo.run("1781800002000-second.ts");
    assert.equal(result.status, 2);
    assert.match(result.stderr, /1781800001000-é-first\.ts/);
  });

  it("counts one in a directory whose path has a space and a non-ASCII letter", () => {
    const repo = makeRepo(join("my db é", "migrations"));
    repo.put("1781800001000-first.ts");
    repo.commit("feat: first");
    assert.equal(repo.run("1781800002000-second.ts").status, 2);
  });

  it("does not count one the base has since taken in by a squash merge", () => {
    const repo = makeRepo();
    repo.put("1781800001000-first.ts");
    repo.commit("feat: first");
    repo.mergeIntoBase("1781800001000-first.ts");
    const result = repo.run("1781800002000-second.ts");
    assert.equal(result.status, 0, result.stderr);
  });

  it("does not count what a merge in progress takes in from the base", () => {
    const repo = makeRepo();
    repo.mergeIntoBase("1781800001000-theirs.ts");
    repo.git("merge", "--no-commit", "--no-ff", "origin/main");
    const result = repo.run("1781800002000-first.ts");
    assert.equal(result.status, 0, result.stderr);
  });

  it("makes a new migration sort after the ones the base gained since the branch left it", () => {
    const repo = makeRepo();
    repo.mergeIntoBase("1781800009000-later.ts");
    const result = repo.run("1781800005000-mine.ts");
    assert.equal(result.status, 2);
    assert.match(result.stderr, /does not sort after the newest migration \(1781800009000\)/);
    assert.equal(repo.run("1781800010000-mine.ts").status, 0);
  });
});

describe("the tools the guard is registered for", () => {
  it("checks an Edit that creates a migration, as it does a Write", () => {
    assert.equal(makeRepo().run("add-index.ts", "Edit").status, 2);
  });

  it("lets an Edit of a migration that exists through", () => {
    assert.equal(makeRepo().run("1781800000000-base.ts", "Edit").status, 0);
  });

  it("is registered for Write, Edit and MultiEdit", () => {
    const [{ matcher }] = JSON.parse(readFileSync(HOOKS_JSON, "utf8")).hooks.PreToolUse;
    const registered = new RegExp(`^(?:${matcher})$`);
    for (const tool of ["Write", "Edit", "MultiEdit"]) {
      assert.match(tool, registered);
    }
    assert.doesNotMatch("Read", registered);
  });
});

describe("git being slow or absent", () => {
  // A `git` that records its calls and fails, ahead of the real one on PATH.
  function brokenGit() {
    const bin = tempDir();
    const log = join(bin, "calls.log");
    writeFileSync(join(bin, "git"), `#!/bin/sh\necho "$@" >> "${log}"\nexit 1\n`, { mode: 0o755 });
    return { log, env: { PATH: `${bin}${delimiter}${process.env.PATH}` } };
  }

  it("does no git work when the file already exists, where the answer is always yes", () => {
    const { log, env } = brokenGit();
    const result = makeRepo().run("1781800000000-base.ts", "Write", env);
    assert.equal(result.status, 0);
    assert.equal(existsSync(log), false);
  });

  it("still judges the name when git fails", () => {
    const { env } = brokenGit();
    const repo = makeRepo();
    assert.equal(repo.run("add-index.ts", "Write", env).status, 2);
    assert.equal(repo.run("1781800001000-add-index.ts", "Write", env).status, 0);
  });
});

describe("the hook run from the path a plugin cache gives it", () => {
  // import.meta.url is percent-encoded and symlink-resolved, argv[1] is
  // neither; comparing them as strings leaves the hook running nothing when
  // the cache path has a space, a non-ASCII letter or a symlink in it.
  const install = (dir) => {
    mkdirSync(dir, { recursive: true });
    copyFileSync(HOOK, join(dir, "migration-guard.mjs"));
    return join(dir, "migration-guard.mjs");
  };
  const blocks = (hook) => {
    const cwd = tempDir();
    const result = runHook(hook, {
      cwd,
      tool_input: { file_path: join(cwd, "migrations", "no-prefix.ts") },
    });
    assert.equal(result.status, 2, result.stderr);
  };

  it("blocks from a directory whose name has a space and a non-ASCII letter", () => {
    blocks(install(join(tempDir(), "plugin cache é", "hooks")));
  });

  it("blocks when the file is reached through a symlink", () => {
    const real = join(tempDir(), "real");
    install(real);
    const link = join(tempDir(), "link");
    symlinkSync(real, link);
    blocks(join(link, "migration-guard.mjs"));
  });
});
