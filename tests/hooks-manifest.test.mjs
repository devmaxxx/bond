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
