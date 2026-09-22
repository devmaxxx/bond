import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const SKILLS = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");

// Every SKILL.md body is in the context of every prompt, so the body carries the
// procedure and nothing else; the detail lives in references/ and is read on demand.
const LIMIT = 3072;

const names = readdirSync(SKILLS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("what a skill body costs at every prompt", () => {
  it("finds the skills", () => {
    assert.ok(names.length > 0, `no skill directories under ${SKILLS}`);
  });

  for (const name of names) {
    const skill = join(SKILLS, name, "SKILL.md");

    it(`${name} fits in ${LIMIT} bytes`, () => {
      const size = statSync(skill).size;
      assert.ok(size <= LIMIT, `${name}/SKILL.md is ${size} bytes, over ${LIMIT}`);
    });

    it(`${name} links only references that are there`, () => {
      const body = readFileSync(skill, "utf8");
      const links = new Set(
        [...body.matchAll(/references\/([A-Za-z0-9._-]+\.md)/g)].map((m) => m[1]),
      );
      for (const link of links) {
        const target = join(SKILLS, name, "references", link);
        assert.ok(
          existsSync(target) && statSync(target).isFile(),
          `${name}/SKILL.md links references/${link}, which is not a file`,
        );
      }
    });
  }
});
