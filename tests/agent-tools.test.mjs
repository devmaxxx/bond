import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGINS = join(ROOT, "plugins");
const AGENT_ROOTS = [
  join(ROOT, "agents"),
  ...readdirSync(PLUGINS).map((plugin) => join(PLUGINS, plugin, "agents")),
].filter(existsSync);

const agents = AGENT_ROOTS.flatMap((root) =>
  readdirSync(root)
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(root, name)),
);

const toolsLine = (file) =>
  readFileSync(file, "utf8")
    .split("---")[1]
    ?.split("\n")
    .find((line) => line.startsWith("tools:"));

// Claude Code reads `tools:` as a list of tool names and refuses to spawn an agent whose
// list resolves to nothing — `tools: All tools` is two unknown names, not "everything".
// An agent that needs every tool leaves the line out and inherits them.
describe("an agent's tools line names tools", () => {
  it("finds the agents", () => assert.ok(agents.length > 0));

  for (const file of agents) {
    it(relative(ROOT, file), () => {
      const line = toolsLine(file);
      if (line === undefined) return;
      const names = line
        .slice("tools:".length)
        .replace(/[[\]]/g, "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      assert.ok(names.length > 0, "an empty tools line");
      for (const name of names) assert.match(name, /^[A-Za-z][\w*-]*$/, `not a tool name: "${name}"`);
    });
  }
});

// An agent told to load a skill without `Skill` in its tools line cannot do it, and carries on
// reviewing without the skill instead of failing.
describe("an agent that loads a skill can call the Skill tool", () => {
  for (const file of agents) {
    const body = readFileSync(file, "utf8").split("---").slice(2).join("---");
    if (!/load\s+`bond:[\w-]+`|`Skill` tool/.test(body)) continue;

    it(relative(ROOT, file), () => {
      const line = toolsLine(file);
      if (line === undefined) return;
      assert.match(line, /\bSkill\b/, "loads a bond skill but its tools line has no Skill");
    });
  }
});

// The same silent fallback hides a skill renamed or deleted under an agent that loads it.
describe("a bond skill an agent loads exists", () => {
  for (const file of agents) {
    const body = readFileSync(file, "utf8").split("---").slice(2).join("---");
    const names = [...body.matchAll(/load\s+`bond:([\w-]+)`/g)].map((match) => match[1]);
    if (names.length === 0) continue;

    it(relative(ROOT, file), () => {
      for (const name of new Set(names)) {
        assert.ok(
          existsSync(join(ROOT, "skills", name, "SKILL.md")),
          `loads bond:${name}, which has no skills/${name}/SKILL.md`,
        );
      }
    });
  }
});
