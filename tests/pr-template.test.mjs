import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  checkBash,
  checkMcp,
  hasTicket,
  isGhPrCreate,
} from "../hooks/pr-template.mjs";
import { scrubShell } from "../hooks/shell.mjs";

const GOOD_BODY = [
  "## Summary",
  "",
  "- tidied the export path",
  "",
  "## Test plan",
  "",
  "- [ ] the export still downloads",
  "",
].join("\n");

const BODY_WITH_JIRA = [
  "## Summary",
  "",
  "- tidied the export path",
  "",
  "## Jira",
  "",
  "- ERP-135: https://bonliva.atlassian.net/browse/ERP-135",
  "",
  "## Test plan",
  "",
  "- [ ] the export still downloads",
  "",
].join("\n");

const JIRA_MISSING =
  "a ticket id is in play but the description has no `## Jira` section";
const NOT_DRAFT =
  "every PR opens as a draft — add --draft (the author publishes when ready)";

/** A well-formed create call; `extra` adds the flags under test. */
function create(extra = "", body = GOOD_BODY, title = "chore: tidy the export") {
  return `gh pr create --draft --base main --title "${title}" ${extra} --body "${body}"`;
}

function withProjects(value, run) {
  const previous = process.env.BOND_JIRA_PROJECTS;
  process.env.BOND_JIRA_PROJECTS = value;
  try {
    run();
  } finally {
    if (previous === undefined) {
      delete process.env.BOND_JIRA_PROJECTS;
    } else {
      process.env.BOND_JIRA_PROJECTS = previous;
    }
  }
}

describe("recognising a pull request creation", () => {
  it("ignores the string inside a heredoc body", () => {
    const diagnostic = [
      "python3 - <<'PYEOF'",
      "import subprocess",
      'print("dry run: gh pr create --draft would go here")',
      "PYEOF",
    ].join("\n");
    assert.equal(checkBash(diagnostic), null);
  });

  it("ignores the string inside a double-quoted argument", () => {
    assert.equal(checkBash('echo "next step: gh pr create --draft"'), null);
  });

  it("ignores the string inside a single-quoted argument", () => {
    assert.equal(checkBash("grep -rn 'gh pr create' ./docs"), null);
  });

  it("ignores the string in a trailing comment", () => {
    assert.equal(checkBash("git status # then gh pr create"), null);
  });

  it("catches an invocation after a shell operator", () => {
    assert.deepEqual(checkBash(`cd /repo && ${create()}`), []);
  });

  it("catches an invocation inside a command substitution", () => {
    assert.deepEqual(checkBash(`url=$(${create()})`), []);
  });

  it("catches an invocation split across a line continuation", () => {
    assert.deepEqual(
      checkBash(`gh \\\n  pr create --draft --body "${GOOD_BODY}"`),
      [],
    );
  });

  it("catches an invocation on the line after a heredoc closes", () => {
    const dir = mkdtempSync(join(tmpdir(), "bond-pr-"));
    const bodyFile = join(dir, "body.md");
    writeFileSync(bodyFile, GOOD_BODY);
    const cmd = [
      `cat > ${bodyFile} <<'EOF'`,
      GOOD_BODY,
      "EOF",
      `gh pr create --draft --body-file ${bodyFile}`,
    ].join("\n");
    assert.deepEqual(checkBash(cmd), []);
  });

  it("catches an invocation chained onto the heredoc's own header line", () => {
    const cmd = [
      `cat > /tmp/body.md <<'EOF' && gh pr create --title "chore: tidy"`,
      "## Summary",
      "EOF",
    ].join("\n");
    assert.deepEqual(checkBash(cmd), [NOT_DRAFT]);
  });

  it("does not treat a suffixed command as gh pr create", () => {
    assert.equal(isGhPrCreate(scrubShell("gh pr created-at")), false);
  });
});

describe("the template's own protections", () => {
  it("blocks a create call that is not a draft", () => {
    const errors = checkBash(
      `gh pr create --title "chore: tidy" --body "${GOOD_BODY}"`,
    );
    assert.deepEqual(errors, [NOT_DRAFT]);
  });

  it("blocks a description with no `## Summary` section", () => {
    const body = ["## Test plan", "", "- [ ] it works", ""].join("\n");
    assert.deepEqual(checkBash(create("", body)), [
      "description is missing its `## Summary` section",
    ]);
  });

  it("blocks a description with no `## Test plan` section", () => {
    const body = ["## Summary", "", "- tidied it", ""].join("\n");
    assert.deepEqual(checkBash(create("", body)), [
      "description is missing its `## Test plan` section",
    ]);
  });

  it("blocks --fill, which builds the body from commit subjects", () => {
    const errors = checkBash("gh pr create --draft --fill");
    assert.deepEqual(errors, [
      "--fill builds the body from commit messages and skips the template; pass --body-file with the built description instead",
    ]);
  });

  it("lets --web through, where the human writes the body", () => {
    assert.equal(checkBash("gh pr create --web"), null);
  });

  it("reads the body out of --body-file", () => {
    const dir = mkdtempSync(join(tmpdir(), "bond-pr-"));
    const bodyFile = join(dir, "body.md");
    writeFileSync(bodyFile, "## Summary\n\n- tidied it\n");
    assert.deepEqual(checkBash(`gh pr create --draft --body-file ${bodyFile}`), [
      "description is missing its `## Test plan` section",
    ]);
  });
});

describe("deciding that a ticket is in play", () => {
  it("matches a Jira project key", () => {
    assert.equal(hasTicket("feat/ERP-135"), true);
    assert.equal(hasTicket("CRMDEV-6335: export fix"), true);
  });

  it("matches every key on a multi-ticket branch", () => {
    // `\b` would refuse this: an underscore is a word character.
    assert.equal(hasTicket("feat/ERP-135_ERP-136"), true);
  });

  it("does not match encoding and standard names", () => {
    for (const prose of [
      "UTF-8",
      "UTF-16",
      "SHA-256",
      "AES-128",
      "RSA-2048",
      "ISO-8601",
      "RFC-822",
      "CP-1251",
      "HTTP-2",
      "ES-2015",
      "IEEE-754",
      "ASCII-85",
      "ARM-64",
      "UTC-5",
    ]) {
      assert.equal(hasTicket(prose), false, `${prose} is not a ticket id`);
    }
  });

  it("does not match a project key that is the tail of a longer word", () => {
    assert.equal(hasTicket("SUPERP-1"), false);
  });

  it("does not match a key outside the configured projects", () => {
    assert.equal(hasTicket("ACME-7"), false);
  });

  it("takes its project keys from BOND_JIRA_PROJECTS when it is set", () => {
    withProjects("ACME, ERP", () => {
      assert.equal(hasTicket("ACME-7"), true);
      assert.equal(hasTicket("ERP-135"), true);
    });
  });

  it("replaces the built-in keys rather than adding to them", () => {
    withProjects("ACME", () => {
      assert.equal(hasTicket("CRMDEV-6335"), false);
    });
  });

  it("falls back to the built-in keys when the setting names none", () => {
    withProjects("  ", () => {
      assert.equal(hasTicket("ERP-135"), true);
    });
  });
});

describe("requiring the `## Jira` section", () => {
  it("demands it when the title carries a ticket id", () => {
    const cmd = create("", GOOD_BODY, "ERP-135: tidy the export");
    assert.deepEqual(checkBash(cmd), [JIRA_MISSING]);
  });

  it("demands it when the head branch carries a ticket id", () => {
    assert.deepEqual(checkBash(create("--head feat/CRMDEV-6335")), [
      JIRA_MISSING,
    ]);
  });

  it("demands it when the description carries a ticket id", () => {
    const body = GOOD_BODY.replace("tidied", "tidied for ERP-135:");
    assert.deepEqual(checkBash(create("", body)), [JIRA_MISSING]);
  });

  it("is satisfied by a description that has the section", () => {
    const cmd = create("", BODY_WITH_JIRA, "ERP-135: tidy the export");
    assert.deepEqual(checkBash(cmd), []);
  });

  it("does not demand it for an encoding name in the description", () => {
    const body = GOOD_BODY.replace(
      "- tidied the export path",
      "- write the CSV as UTF-8, not CP-1251, and stamp it ISO-8601",
    );
    assert.deepEqual(checkBash(create("", body)), []);
  });
});

describe("the Bitbucket MCP path", () => {
  it("blocks the non-draft create call outright", () => {
    const errors = checkMcp(
      { title: "chore: tidy", description: BODY_WITH_JIRA },
      "mcp__bond-bitbucket__create_pull_request",
    );
    assert.deepEqual(errors, [
      "every PR opens as a draft — use create_draft_pull_request (the author publishes when ready)",
    ]);
  });

  it("accepts a draft that follows the template", () => {
    const errors = checkMcp(
      {
        title: "ERP-135: tidy the export",
        source_branch: "feat/ERP-135",
        description: BODY_WITH_JIRA,
      },
      "mcp__bond-bitbucket__create_draft_pull_request",
    );
    assert.deepEqual(errors, []);
  });

  it("demands the Jira section for a ticket id on the source branch", () => {
    const errors = checkMcp(
      {
        title: "tidy the export",
        source_branch: "feat/ERP-135",
        description: GOOD_BODY,
      },
      "mcp__bond-bitbucket__create_draft_pull_request",
    );
    assert.deepEqual(errors, [JIRA_MISSING]);
  });

  it("does not demand it for an encoding name in the description", () => {
    const errors = checkMcp(
      {
        title: "chore: write the export as UTF-8",
        source_branch: "chore/export-encoding",
        description: GOOD_BODY,
      },
      "mcp__bond-bitbucket__create_draft_pull_request",
    );
    assert.deepEqual(errors, []);
  });
});
