import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  cdTarget,
  checkBash,
  checkMcp,
  hasTicket,
  isBonlivaRemote,
  isGhPrCreate,
  resolveDraft,
} from "../hooks/pr-template.mjs";
import { scrubShell } from "../hooks/shell.mjs";

/** A throwaway git repo with the given origin and optional manifest. */
function repo(origin, manifest) {
  const dir = mkdtempSync(join(tmpdir(), "bond-repo-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["remote", "add", "origin", origin], { cwd: dir });
  if (manifest !== undefined) {
    mkdirSync(join(dir, ".bond"));
    writeFileSync(join(dir, ".bond", "project.json"), JSON.stringify(manifest));
  }
  return dir;
}

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

const titleMissing = (tickets) =>
  `title must open with \`${tickets}:\` — the branch carries ${tickets.split(", ").join(", ")}`;
const COMMIT_SUBJECT_TITLE =
  "title is a commit subject — a PR title reads `<TICKET_IDs>: <description>`, or just the description when there is no ticket";
const JIRA_MISSING =
  "a ticket id is in play but the description has no `## Jira` section";
const NOT_DRAFT =
  "this repo opens PRs as drafts — add --draft (the author publishes when ready)";
const NOT_DRAFT_MCP =
  "this repo opens PRs as drafts — use create_draft_pull_request (the author publishes when ready)";
const PERSONAL = { requireDraft: (target) => target ?? false };

/** A well-formed create call; `extra` adds the flags under test. */
function create(extra = "", body = GOOD_BODY, title = "tidy the export") {
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
      `cat > /tmp/body.md <<'EOF' && gh pr create --title "tidy the export"`,
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
      `gh pr create --title "tidy the export" --body "${GOOD_BODY}"`,
    );
    assert.deepEqual(errors, [NOT_DRAFT]);
  });

  it("lets a non-draft through outside Bonliva", () => {
    const errors = checkBash(
      `gh pr create --title "tidy the export" --body "${GOOD_BODY}"`,
      PERSONAL,
    );
    assert.deepEqual(errors, []);
  });

  it("still demands the template outside Bonliva", () => {
    const body = ["## Summary", "", "- tidied it", ""].join("\n");
    assert.deepEqual(
      checkBash(`gh pr create --title "tidy the export" --body "${body}"`, PERSONAL),
      ["description is missing its `## Test plan` section"],
    );
  });

  it("takes Bonliva from --repo over the checkout's remote", () => {
    const personalTarget = `gh pr create --repo devmaxxx/repograph --title "tidy the export" --body "${GOOD_BODY}"`;
    assert.deepEqual(checkBash(personalTarget), []);
    const bonlivaTarget = `gh pr create -R Bonliva/bonliva-erp --title "tidy the export" --body "${GOOD_BODY}"`;
    assert.deepEqual(checkBash(bonlivaTarget, PERSONAL), [NOT_DRAFT]);
  });

  it("resolves drafts in the directory a leading cd moves into", () => {
    const seen = [];
    const cmd = `cd ~/bonliva-erp && gh pr create --title "tidy the export" --body "${GOOD_BODY}"`;
    checkBash(cmd, { requireDraft: (target, dir) => (seen.push(dir), false) });
    assert.deepEqual(seen, ["~/bonliva-erp"]);
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

describe("recognising a Bonliva remote", () => {
  it("matches the Bonliva workspace and org on either host", () => {
    for (const url of [
      "git@bitbucket.org:bonliva/bonliva-erp.git",
      "https://bitbucket.org/bonliva/bonliva-crm.git",
      "git@github.com:Bonliva/bonliva-erp.git",
      "git@github-work:Bonliva/bonliva-erp.git",
    ]) {
      assert.equal(isBonlivaRemote(url), true, url);
    }
  });

  it("does not match a personal repo or a lookalike owner", () => {
    for (const url of [
      "https://github.com/devmaxxx/repograph.git",
      "git@github.com:devmaxxx/bonliva-notes.git",
      "git@github.com:notbonliva/app.git",
    ]) {
      assert.equal(isBonlivaRemote(url), false, url);
    }
  });
});

describe("reading the cd target", () => {
  it("takes the last cd before gh pr create", () => {
    assert.equal(cdTarget("cd /a && cd '/b c' && gh pr create --draft"), "/b c");
  });

  it("ignores a cd after gh pr create", () => {
    assert.equal(cdTarget("gh pr create --draft && cd /elsewhere"), null);
  });

  it("gives up on a target only known at run time", () => {
    assert.equal(cdTarget('cd "$REPO" && gh pr create'), null);
    assert.equal(cdTarget("cd - && gh pr create"), null);
  });

  it("does not read a cd inside another word", () => {
    assert.equal(cdTarget("abcd /x && gh pr create"), null);
  });

  it("ignores a literal 'gh pr create' mentioned before the real one", () => {
    const cmd = `echo "run gh pr create later" && cd ~/bonliva-erp && gh pr create --draft`;
    assert.equal(cdTarget(cmd), "~/bonliva-erp");
  });
});

describe("resolving whether a repo opens drafts", () => {
  const BONLIVA = "git@bitbucket.org:bonliva/bonliva-erp.git";
  const PERSONAL_ORIGIN = "https://github.com/devmaxxx/repograph.git";

  it("follows the remote when there is no manifest", () => {
    assert.equal(resolveDraft(repo(BONLIVA), null), true);
    assert.equal(resolveDraft(repo(PERSONAL_ORIGIN), null), false);
  });

  it("lets the PR's explicit target outrank the remote", () => {
    assert.equal(resolveDraft(repo(PERSONAL_ORIGIN), true), true);
    assert.equal(resolveDraft(repo(BONLIVA), false), false);
  });

  it("lets the manifest's `draft` outrank everything", () => {
    assert.equal(resolveDraft(repo(PERSONAL_ORIGIN, { draft: true }), false), true);
    assert.equal(resolveDraft(repo(BONLIVA, { draft: false }), true), false);
  });

  it("ignores a manifest that does not state `draft`", () => {
    assert.equal(resolveDraft(repo(PERSONAL_ORIGIN, { tracker: "none" }), null), false);
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
      titleMissing("CRMDEV-6335"),
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
      { title: "tidy the export", description: BODY_WITH_JIRA },
      "mcp__bond-bitbucket__create_pull_request",
    );
    assert.deepEqual(errors, [NOT_DRAFT_MCP]);
  });

  it("allows the non-draft create call outside the bonliva workspace", () => {
    const errors = checkMcp(
      { workspace: "devmaxxx", title: "tidy the export", description: GOOD_BODY },
      "mcp__bond-bitbucket__create_pull_request",
    );
    assert.deepEqual(errors, []);
  });

  it("takes Bonliva from the workspace over the checkout's remote", () => {
    const errors = checkMcp(
      { workspace: "bonliva", title: "tidy the export", description: GOOD_BODY },
      "mcp__bond-bitbucket__create_pull_request",
      PERSONAL,
    );
    assert.deepEqual(errors, [NOT_DRAFT_MCP]);
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
    assert.deepEqual(errors, [titleMissing("ERP-135"), JIRA_MISSING]);
  });

  it("does not demand it for an encoding name in the description", () => {
    const errors = checkMcp(
      {
        title: "write the export as UTF-8",
        source_branch: "chore/export-encoding",
        description: GOOD_BODY,
      },
      "mcp__bond-bitbucket__create_draft_pull_request",
    );
    assert.deepEqual(errors, []);
  });
});

describe("the PR title", () => {
  it("demands the branch's ticket ids as the prefix", () => {
    const cmd = create(
      "--head fix/erp-1155-alert-refresh",
      BODY_WITH_JIRA,
      "perf(accommodations): stop the alert reconcile",
    );
    assert.deepEqual(checkBash(cmd), [titleMissing("ERP-1155")]);
  });

  it("reads a lowercase branch key as the uppercase ticket", () => {
    const cmd = create(
      "--head fix/erp-1155-alert-refresh",
      BODY_WITH_JIRA,
      "ERP-1155: stop the alert reconcile",
    );
    assert.deepEqual(checkBash(cmd), []);
  });

  it("joins a multi-ticket branch with a comma", () => {
    const cmd = create(
      "--head feat/ERP-1169_ERP-923",
      BODY_WITH_JIRA,
      "ERP-1169, ERP-923: keep the shift type on save",
    );
    assert.deepEqual(checkBash(cmd), []);
  });

  it("rejects a commit subject when the branch carries no ticket", () => {
    const cmd = create("--head chore/slim-the-docs", GOOD_BODY, "chore: slim the docs");
    assert.deepEqual(checkBash(cmd), [COMMIT_SUBJECT_TITLE]);
  });

  it("accepts a bare description when the branch carries no ticket", () => {
    const cmd = create("--head chore/slim-the-docs", GOOD_BODY, "slim the docs");
    assert.deepEqual(checkBash(cmd), []);
  });

  it("checks the title on the Bitbucket path too", () => {
    const errors = checkMcp(
      {
        title: "fix(export): tidy the export",
        source_branch: "fix/erp-135-export",
        description: BODY_WITH_JIRA,
      },
      "mcp__bond-bitbucket__create_draft_pull_request",
    );
    assert.deepEqual(errors, [titleMissing("ERP-135")]);
  });
});
