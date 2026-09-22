import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const SCRIPT = fileURLToPath(
  new URL("../skills/context-cost/scripts/context-audit.py", import.meta.url),
);
const PROJECTS = fileURLToPath(new URL("./fixtures/projects", import.meta.url));

// The fixture's tool results are sized by hand, as `json.dumps(content)` in UTF-8:
//   Bash   "a" * 100                           ->   100 + 2 quotes        =   102
//   Read   [{"type": "text", "text": "b"*41000}] -> 41000 + 30 of JSON    = 41030  (> 40 KB)
//   Skill  "c" * 200                           ->   200 + 2 quotes        =   202
//   Agent  [{"type": "text", "text": "d"*800}] ->    800 + 30 of JSON     =   830
//   total                                                                 = 42164
const TOTAL = 42164;

// The fixture carries no timestamps, so the default 30-day window cannot age it out.
const audit = (...args) =>
  JSON.parse(
    execFileSync("python3", [SCRIPT, "--projects-dir", PROJECTS, "--json", ...args], {
      encoding: "utf8",
    }),
  );

describe("what a project's transcripts cost", () => {
  it("totals every tool result in the project", () => {
    const [project] = audit();
    assert.equal(project.project, "-tmp-demo");
    assert.equal(project.sessions, 1);
    assert.equal(project.bytes, TOTAL);
    assert.equal(project.mb, 0.042164);
  });

  it("names the tool behind each result through its tool_use_id", () => {
    const [project] = audit();
    assert.deepEqual(project.tools, [
      { tool: "Read", calls: 1, bytes: 41030, mb: 0.04103, avg_bytes: 41030, over_40kb: 1 },
      { tool: "Agent", calls: 1, bytes: 830, mb: 0.00083, avg_bytes: 830, over_40kb: 0 },
      { tool: "Skill", calls: 1, bytes: 202, mb: 0.000202, avg_bytes: 202, over_40kb: 0 },
      { tool: "Bash", calls: 1, bytes: 102, mb: 0.000102, avg_bytes: 102, over_40kb: 0 },
    ]);
  });

  it("counts turns, compactions and branches per session", () => {
    const [project] = audit();
    assert.deepEqual(project.top_sessions, [
      {
        session: "s1",
        user_turns: 2,
        compactions: 1,
        branches: 2,
        bytes: TOTAL,
        mb: 0.042164,
      },
    ]);
  });

  it("counts the skills and the subagents the project fired", () => {
    const [project] = audit();
    assert.deepEqual(project.skills, [{ skill: "tasks", calls: 1 }]);
    assert.deepEqual(project.agents, [{ subagent_type: "repo-scout", calls: 1 }]);
  });
});

describe("the flags that narrow the audit", () => {
  it("keeps the projects whose directory name contains --project", () => {
    assert.deepEqual(
      audit("--project", "demo").map((p) => p.project),
      ["-tmp-demo"],
    );
    assert.deepEqual(audit("--project", "erp"), []);
  });

  it("fails with one line on stderr when --projects-dir is not there", () => {
    const run = spawnSync(
      "python3",
      [SCRIPT, "--projects-dir", `${PROJECTS}/nowhere`, "--json"],
      { encoding: "utf8" },
    );
    assert.notEqual(run.status, 0);
    assert.equal(run.stdout, "");
    assert.equal(run.stderr.trimEnd().split("\n").length, 1);
    assert.match(run.stderr, /nowhere/);
  });
});
