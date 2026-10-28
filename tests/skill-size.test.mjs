import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_ROOTS = [
  join(ROOT, "skills"),
  join(ROOT, "plugins", "bond-bonliva", "skills"),
  join(ROOT, "plugins", "bond-oss", "skills"),
];

// Every SKILL.md body is in the context of every prompt, so the body carries the
// procedure and nothing else; the detail lives in references/ and is read on demand.
const LIMIT = 3072;

// Vendored unchanged from upstream and refreshed from there, so its body is not ours to trim.
const VENDORED = new Set([
  "differential-review",
  "sharp-edges",
  "variant-analysis",
]);

// Third-party skills ship their upstream license file; the Trail of Bits ones are CC BY-SA, not bond's MIT.
const THIRD_PARTY = new Set([...VENDORED, "insecure-defaults"]);

// A skill that bundles several third-party corpora keeps each one's license beside it.
const BUNDLED_LICENSES = { "code-review": ["stacks/LICENSE", "security/LICENSE"] };

const skillsIn = (root) =>
  existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({ name: entry.name, dir: join(root, entry.name) }))
    : [];

const skills = SKILL_ROOTS.flatMap(skillsIn).sort((a, b) => a.name.localeCompare(b.name));

describe("what a skill body costs at every prompt", () => {
  // A root that goes missing or is renamed would otherwise stop being checked without a sound.
  for (const root of SKILL_ROOTS) {
    it(`finds the skills under ${relative(ROOT, root)}`, () => {
      assert.ok(skillsIn(root).length > 0, `no skill directories under ${root}`);
    });
  }

  for (const { name, dir } of skills) {
    const skill = join(dir, "SKILL.md");

    it(`${name} fits in ${LIMIT} bytes`, { skip: VENDORED.has(name) && "vendored" }, () => {
      const size = statSync(skill).size;
      assert.ok(size <= LIMIT, `${name}/SKILL.md is ${size} bytes, over ${LIMIT}`);
    });

    if (THIRD_PARTY.has(name)) {
      it(`${name} ships its upstream license`, () => {
        assert.ok(existsSync(join(dir, "LICENSE")), `${name}/LICENSE is missing`);
      });
    }

    for (const license of BUNDLED_LICENSES[name] ?? []) {
      it(`${name} ships ${license}`, () => {
        assert.ok(existsSync(join(dir, license)), `${name}/${license} is missing`);
      });
    }

    it(`${name} links only references that are there`, () => {
      const body = readFileSync(skill, "utf8");
      const links = new Set(
        [...body.matchAll(/references\/([A-Za-z0-9._-]+\.md)/g)].map((m) => m[1]),
      );
      for (const link of links) {
        const target = join(dir, "references", link);
        assert.ok(
          existsSync(target) && statSync(target).isFile(),
          `${name}/SKILL.md links references/${link}, which is not a file`,
        );
      }
    });
  }
});
