import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
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

  // A build vendored ahead of its npm release names the commit instead, and
  // says so, until scripts/vendor-agent-base-kit.sh replaces it.
  it("names the version and the tarball or unpublished commit it was taken from", () => {
    const [header, next] = readFileSync(bond, "utf8").split("\n");
    if (/ built from devmaxxx\/agent-base-kit commit /.test(header)) {
      assert.match(header, /^\/\/ agent-base-kit \d+\.\d+\.\d+, dist\/index\.mjs built from devmaxxx\/agent-base-kit commit [0-9a-f]{40}\.$/);
      assert.match(next, /^\/\/ UNPUBLISHED: /);
      return;
    }
    assert.match(header, /^\/\/ agent-base-kit \d+\.\d+\.\d+, dist\/index\.mjs from npm \(sha512-/);
  });
});
