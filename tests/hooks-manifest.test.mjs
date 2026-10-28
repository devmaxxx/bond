import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "hooks/hooks.json"), "utf8"));

const commands = Object.values(manifest.hooks)
  .flat()
  .flatMap((group) => group.hooks.map((hook) => hook.command));

describe("every registered hook command", () => {
  // A quoted script path swallows anything typed inside the quotes, so
  // `"…/x.mjs save"` names a file that does not exist and the hook never runs.
  it("quotes a script path that exists in the plugin", () => {
    for (const command of commands) {
      const quoted = command.match(/"\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)"/);
      if (!quoted) {
        continue;
      }
      assert.ok(existsSync(join(ROOT, quoted[1])), `${command} → no file ${quoted[1]}`);
    }
  });
});

describe("the vendored agent-base-kit", () => {
  const bond = join(ROOT, "hooks/vendor/agent-base-kit.mjs");
  const bonliva = join(ROOT, "plugins/bond-bonliva/hooks/vendor/agent-base-kit.mjs");

  // bond-bonliva installs into its own cache directory, so it cannot import
  // across to bond's copy; the two must still be one version.
  it("is the same file in bond and in bond-bonliva", () => {
    assert.equal(readFileSync(bonliva, "utf8"), readFileSync(bond, "utf8"));
  });

  it("names the version and the tarball it was taken from", () => {
    const [header] = readFileSync(bond, "utf8").split("\n");
    assert.match(header, /^\/\/ agent-base-kit \d+\.\d+\.\d+, dist\/index\.mjs from npm \(sha512-/);
  });
});

describe("the PreToolUse guards on agent-base-kit", () => {
  // A guard that cannot start, such as one whose vendored kit did not reach
  // the plugin cache, exits 1, which Claude Code reads as a non-blocking error
  // and runs the call unchecked; `|| exit 2` turns that into a block. Any
  // other event must keep exiting non-2 there, or a broken hook would drop the
  // prompt.
  const plugins = [ROOT, join(ROOT, "plugins/bond-bonliva")];
  const onKit = (root, script) => readFileSync(join(root, script), "utf8").includes("./vendor/agent-base-kit.mjs");
  const entries = plugins.flatMap((root) => {
    const { hooks } = JSON.parse(readFileSync(join(root, "hooks/hooks.json"), "utf8"));
    return Object.entries(hooks).flatMap(([event, groups]) =>
      groups.flatMap((group) =>
        group.hooks
          .map((hook) => ({ root, event, matcher: group.matcher, command: hook.command, script: hook.command.match(/"\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)"/)?.[1] }))
          .filter((entry) => entry.script && onKit(root, entry.script)),
      ),
    );
  });
  const scratch = [];
  after(() => {
    for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  });
  // The plugin's hooks directory as a cache would hold it, minus vendor/.
  const withoutKit = ({ root, script }) => {
    const copy = mkdtempSync(join(tmpdir(), "bond-no-kit-"));
    scratch.push(copy);
    const dir = dirname(script);
    mkdirSync(join(copy, dir), { recursive: true });
    for (const file of readdirSync(join(root, dir)).filter((name) => name.endsWith(".mjs"))) {
      copyFileSync(join(root, dir, file), join(copy, dir, file));
    }
    return copy;
  };
  const sh = (command, root, input) =>
    spawnSync("/bin/sh", ["-c", command.replaceAll("${CLAUDE_PLUGIN_ROOT}", root)], {
      input: JSON.stringify(input),
      encoding: "utf8",
    });
  const cleanCall = (matcher) => {
    const tool = matcher.split("|")[0];
    const cwd = mkdtempSync(join(tmpdir(), "bond-clean-"));
    scratch.push(cwd);
    return tool === "Bash"
      ? { hook_event_name: "PreToolUse", cwd, tool_name: "Bash", tool_input: { command: "ls" } }
      : { hook_event_name: "PreToolUse", cwd, tool_name: tool, tool_input: { file_path: join(cwd, "notes.md"), content: "hello" } };
  };

  it("are secrets-guard, check-commit and migration-guard", () => {
    assert.deepEqual(
      entries.filter((entry) => entry.event === "PreToolUse").map((entry) => entry.script).sort(),
      ["hooks/check-commit.mjs", "hooks/migration-guard.mjs", "hooks/secrets-guard.mjs"],
    );
  });

  for (const entry of entries) {
    if (entry.event === "PreToolUse") {
      it(`${entry.script} blocks the call when it cannot start, and passes a clean one`, () => {
        const broken = sh(entry.command, withoutKit(entry), cleanCall(entry.matcher));
        assert.equal(broken.status, 2, broken.stderr);
        const clean = sh(entry.command, entry.root, cleanCall(entry.matcher));
        assert.equal(clean.status, 0, clean.stderr);
      });
    } else {
      it(`${entry.script} at ${entry.event} lets the event pass when it cannot start`, () => {
        const broken = sh(entry.command, withoutKit(entry), { hook_event_name: entry.event, prompt: "hi" });
        assert.notEqual(broken.status, 2, broken.stderr);
      });
    }
  }
});
