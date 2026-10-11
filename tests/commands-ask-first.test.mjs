import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMMAND_DIRS = [
  join(ROOT, "commands"),
  ...readdirSync(join(ROOT, "plugins")).map((plugin) =>
    join(ROOT, "plugins", plugin, "commands"),
  ),
];
// /bond:help only prints a list: it has nothing to decide.
const EXEMPT = new Set(["help.md"]);

function commands() {
  return COMMAND_DIRS.flatMap((dir) => {
    try {
      return readdirSync(dir)
        .filter((name) => name.endsWith(".md") && !EXEMPT.has(name))
        .map((name) => join(dir, name));
    } catch {
      return [];
    }
  });
}

describe("every command asks its open questions first", () => {
  const found = commands();

  it("finds the commands of every plugin", () => {
    assert.ok(found.length > 20, `only ${found.length} commands found`);
  });

  for (const path of found) {
    const name = path.slice(ROOT.length);
    it(`${name} opens with the ask-first step`, () => {
      const body = readFileSync(path, "utf8");
      const h1 = body.search(/^# /m);
      const ask = body.indexOf("**Ask first.**");
      assert.ok(ask > h1 && h1 >= 0, `${name} has no **Ask first.** line under its title`);
      assert.ok(
        !/^## /m.test(body.slice(h1, ask)),
        `${name} puts the ask-first step after a section, not first`,
      );
    });
  }

  it("the standing rule it points at exists", () => {
    const rules = readFileSync(join(ROOT, "shared", "standing-rules.md"), "utf8");
    assert.match(rules, /^## Commands ask first — always on$/m);
  });
});
