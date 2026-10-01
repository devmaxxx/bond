import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { digest, render } from "../hooks/session-memory.mjs";

const CWD = "/repo";

const user = (content, extra = {}) =>
  JSON.stringify({ type: "user", message: { content }, ...extra });
const edit = (name, file_path) =>
  JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "tool_use", name, input: { file_path } }] },
  });

const memory = (fields = {}) => ({
  session: "old",
  savedAt: "2026-10-01T10:00:00.000Z",
  branch: "feat/x",
  prompts: ["add export"],
  files: ["src/a.ts"],
  ...fields,
});
const NOW = Date.parse("2026-10-02T10:00:00.000Z");

describe("what a transcript leaves behind", () => {
  it("keeps what the user typed and skips harness-written turns", () => {
    const { prompts } = digest(
      [
        user("add a CSV export"),
        user("<command-name>/clear</command-name>"),
        user("<Button> does not render"),
        user("rules", { isMeta: true }),
        user("summary", { isCompactSummary: true }),
        user([{ type: "tool_result", content: "ok" }]),
        user([{ type: "text", text: "now  the\ntests" }]),
        user([{ type: "text", text: "[Request interrupted by user]" }]),
      ],
      CWD,
    );
    assert.deepEqual(prompts, ["add a CSV export", "<Button> does not render", "now the tests"]);
  });

  it("keeps only the last five prompts, each cut to one short line", () => {
    const lines = Array.from({ length: 8 }, (_, i) => user(`ask ${i}`));
    lines.push(user("x".repeat(400)));
    const { prompts } = digest(lines, CWD);
    assert.equal(prompts.length, 5);
    assert.equal(prompts[0], "ask 4");
    assert.equal(prompts[4].length, 160);
    assert.ok(prompts[4].endsWith("…"));
  });

  it("lists edited files most recent first, once each, relative to the repo", () => {
    const { files } = digest(
      [
        edit("Edit", "/repo/a.ts"),
        edit("Write", "/repo/b.ts"),
        edit("Read", "/repo/c.ts"),
        edit("Edit", "/repo/a.ts"),
        edit("Write", "/elsewhere/d.md"),
      ],
      CWD,
    );
    assert.deepEqual(files, ["../elsewhere/d.md", "a.ts", "b.ts"]);
  });

  it("drops harness blocks but keeps the prompt typed beside them", () => {
    const { prompts } = digest(
      [
        user([
          { type: "text", text: '<artifact-view-context artifact="x">{}</artifact-view-context>' },
          { type: "text", text: "prepare PR" },
        ]),
        user("<div> is not centred"),
      ],
      CWD,
    );
    assert.deepEqual(prompts, ["prepare PR", "<div> is not centred"]);
  });

  it("survives lines that are not JSON", () => {
    assert.deepEqual(digest(["{", "", user("hi")], CWD).prompts, ["hi"]);
  });
});

describe("the note printed at the next start", () => {
  it("names the branch, the asks and the files of another recent session", () => {
    const note = render(memory(), { session: "new", source: "startup", now: NOW });
    assert.match(note, /branch feat\/x/);
    assert.match(note, /- add export/);
    assert.match(note, /Edited: src\/a\.ts/);
  });

  it("stays within a kilobyte and says how many files it left out", () => {
    const files = Array.from({ length: 15 }, (_, i) => `../worktrees/feature/apps/api/src/modules/module-${i}/module-${i}.service.ts`);
    const note = render(memory({ files }), { session: "new", source: "startup", now: NOW });
    assert.ok(Buffer.byteLength(note) <= 1025, `${Buffer.byteLength(note)} bytes`);
    assert.match(note, /\+\d+ more$/m);
  });

  it("says nothing after a compaction or a clear — the summary already has it", () => {
    for (const source of ["compact", "clear"]) {
      assert.equal(render(memory(), { session: "new", source, now: NOW }), null);
    }
  });

  it("says nothing to the session that wrote it", () => {
    assert.equal(render(memory(), { session: "old", source: "resume", now: NOW }), null);
  });

  it("says nothing once the note is a week old", () => {
    const later = Date.parse("2026-10-09T10:00:01.000Z");
    assert.equal(render(memory(), { session: "new", source: "startup", now: later }), null);
  });

  it("says nothing for a note with nothing in it", () => {
    const empty = memory({ prompts: [], files: [] });
    assert.equal(render(empty, { session: "new", source: "startup", now: NOW }), null);
  });
});
