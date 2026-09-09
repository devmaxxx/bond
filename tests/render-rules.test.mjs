import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { pickName, renderRules } from "../hooks/render-rules.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHIPPED_RULES = readFileSync(
  join(REPO, "shared", "standing-rules.md"),
  "utf8",
);

const FILE = [
  "# Standing rules",
  "",
  "> A note to whoever reads this file in the repo, not to the session.",
  "> `{{NAME}}` is replaced at print time.",
  "",
  "## Name",
  "",
  "Start every reply with the user's name: **{{NAME}}**.",
  "",
  "## Brevity",
  "",
  "Answer as briefly as possible.",
  "",
].join("\n");

describe("choosing the name to greet with", () => {
  it("prefers the configured name", () => {
    assert.equal(pickName("Max", "msynEfisco"), "Max");
  });

  it("falls back to the git identity when nothing is configured", () => {
    assert.equal(pickName(undefined, "msynEfisco"), "msynEfisco");
  });

  it("treats a blank configured name as unset", () => {
    // A settings.json entry left as "" is "I have not set this", not a name.
    assert.equal(pickName("   ", "msynEfisco"), "msynEfisco");
  });

  it("trims surrounding whitespace off either source", () => {
    assert.equal(pickName(" Max ", ""), "Max");
    assert.equal(pickName("", "msynEfisco\n"), "msynEfisco");
  });

  it("yields an empty name when neither source has one", () => {
    assert.equal(pickName(undefined, ""), "");
  });
});

describe("rendering the rules for a session", () => {
  it("drops the repo-facing preamble above the first rule", () => {
    const out = renderRules(FILE, "Max");
    assert.ok(out.startsWith("## Name"), out.slice(0, 40));
    assert.ok(!out.includes("A note to whoever reads this file"));
  });

  it("substitutes the name into the greeting rule", () => {
    assert.ok(renderRules(FILE, "Max").includes("**Max**"));
  });

  it("leaves no unsubstituted placeholder behind", () => {
    assert.ok(!renderRules(FILE, "Max").includes("{{NAME}}"));
  });

  it("drops the Name rule entirely when there is no name", () => {
    const out = renderRules(FILE, "");
    assert.ok(!out.includes("## Name"));
    assert.ok(!out.includes("{{NAME}}"));
    assert.ok(out.startsWith("## Brevity"));
  });

  it("keeps every other rule when the Name rule is dropped", () => {
    assert.ok(renderRules(FILE, "").includes("Answer as briefly as possible."));
  });

  it("drops the Name rule even when it is the last section", () => {
    // The previous "## Name up to the next ## " match failed here silently,
    // shipping a raw {{NAME}} into the session.
    const nameLast = ["## Brevity", "", "Be brief.", "", "## Name", "", "Call them **{{NAME}}**.", ""].join("\n");
    const out = renderRules(nameLast, "");
    assert.ok(!out.includes("{{NAME}}"));
    assert.ok(!out.includes("## Name"));
  });

  it("returns the file unchanged when it has no headings at all", () => {
    assert.equal(renderRules("just prose, no headings\n", "Max"), "just prose, no headings\n");
  });

  it("ends with exactly one trailing newline", () => {
    const out = renderRules(FILE, "Max");
    assert.ok(out.endsWith("\n"));
    assert.ok(!out.endsWith("\n\n"));
  });
});

describe("the rules file this plugin actually ships", () => {
  it("renders with a name without leaking the placeholder", () => {
    const out = renderRules(SHIPPED_RULES, "Max");
    assert.ok(!out.includes("{{NAME}}"));
    assert.ok(out.includes("**Max**"));
  });

  it("uses {{NAME}} only in the Name rule, so a nameless session loses nothing else", () => {
    const out = renderRules(SHIPPED_RULES, "");
    assert.ok(!out.includes("{{NAME}}"), "a rule outside `## Name` uses {{NAME}}");
  });

  it("still carries every always-on rule after rendering", () => {
    const out = renderRules(SHIPPED_RULES, "Max");
    for (const heading of [
      "## Brevity",
      "## Comment hygiene",
      "## Model and effort routing",
      "## Caveman mode",
      "## GitHub account",
      "## Branch names",
      "## Code review at the end",
    ]) {
      assert.ok(out.includes(heading), `${heading} missing from the rendered rules`);
    }
  });
});
