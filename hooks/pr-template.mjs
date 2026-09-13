/**
 * The rule enforced by check-pr.mjs, kept importable so the two decisions that
 * gate it can be unit-tested: is this Bash command really opening a pull
 * request, and does the work actually carry a Jira ticket. Both were once
 * substring guesses, and both blocked work that opened no PR at all.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { quotedRanges, runsCommand, scrubShell } from "./shell.mjs";

const DEFAULT_JIRA_PROJECTS = ["ERP", "CRMDEV"];

const BONLIVA_REMOTE = /(?:bitbucket\.org|github(?:\.com|-[\w.-]+))[:/]bonliva\//i;
const BONLIVA_REPO_FLAG = /^(?:(?:https?:\/\/)?[^/]+\/)?bonliva\//i;

const WEB = /(?:^|\s)(?:-w|--web)(?:\s|$)/;
const FILL = /(?:^|\s)--fill(?:-first|-verbose)?(?:\s|$)/;
const DRAFT = /(?:^|\s)(?:-d|--draft)(?:\s|=|$)/;

/**
 * Project keys, not a generic `[A-Z]+-\d+`: that shape also spells UTF-8,
 * SHA-256, ISO-8601 and RFC-822, and a PR was once rejected for the word
 * "UTF-8" in its description. The keys are enumerable, so they are enumerated;
 * `BOND_JIRA_PROJECTS` (comma- or space-separated) replaces the list when
 * Bonliva adds a project. An unlisted key means no `## Jira` section is
 * demanded — a missed reminder, never a blocked PR.
 */
export function jiraProjects() {
  const configured = (process.env.BOND_JIRA_PROJECTS ?? "")
    .split(/[\s,]+/)
    .map((key) => key.toUpperCase())
    .filter((key) => /^[A-Z][A-Z0-9]+$/.test(key));
  return configured.length > 0 ? configured : DEFAULT_JIRA_PROJECTS;
}

/**
 * Drafts are a Bonliva convention, detected the way `BONLIVA` is in
 * shared/project-profile.md. Anywhere else a PR may open ready for review.
 */
export function isBonlivaRemote(url) {
  return BONLIVA_REMOTE.test(url);
}

/**
 * Resolution order mirrors the project profile: the repo's own `draft` in
 * `.bond/project.json` wins, then the PR's explicit target (`--repo`, the
 * Bitbucket workspace), then the checkout's remote.
 */
export function resolveDraft(cwd, target) {
  const root = gitOutput(cwd, "rev-parse", "--show-toplevel");
  if (root !== null) {
    const manifest = readManifest(join(root, ".bond", "project.json"));
    if (typeof manifest?.draft === "boolean") {
      return manifest.draft;
    }
  }
  return target ?? isBonlivaRepo(cwd, root);
}

function readManifest(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function gitOutput(cwd, ...args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export function isBonlivaRepo(cwd, root = gitOutput(cwd, "rev-parse", "--show-toplevel")) {
  if (root !== null && existsSync(join(root, ".bonliva-dev", "project.json"))) {
    return true;
  }
  const origin = gitOutput(cwd, "remote", "get-url", "origin");
  return origin !== null && isBonlivaRemote(origin);
}

/**
 * The boundaries are hand-rolled because `\b` gets both ends wrong here: it
 * refuses the `ERP-135_ERP-136` a multi-ticket branch carries, and it accepts
 * the `ERP` tail of a longer word.
 */
export function hasTicket(text) {
  const keys = jiraProjects().join("|");
  return new RegExp(`(?<![A-Za-z0-9])(?:${keys})-\\d+(?![0-9])`).test(text);
}

/**
 * The directory a `cd` earlier in the command moves `gh pr create` into — the
 * hook's own cwd is where the Bash call started, which `cd ~/bonliva-erp && gh
 * pr create` leaves behind. Null when there is no `cd`, or its target is only
 * known at run time (`cd -`, `cd "$DIR"`).
 *
 * Matched against the raw command, not `scrubShell`'s output, because a
 * quoted `cd` argument needs its real text. So a literal "gh pr create" or
 * "cd …" sitting in a title, body or comment is skipped explicitly instead —
 * `scrubShell` would have blanked it, but also shortened the string underneath
 * every later index.
 */
export function cdTarget(cmd) {
  const ranges = quotedRanges(cmd);
  const isQuoted = (index) => ranges.some(([start, end]) => index >= start && index < end);

  let create = -1;
  for (const match of cmd.matchAll(/gh\s+pr\s+create/g)) {
    if (!isQuoted(match.index)) {
      create = match.index;
      break;
    }
  }
  const before = create === -1 ? cmd : cmd.slice(0, create);
  const matches = [
    ...before.matchAll(/(?:^|[;&|(\n])\s*cd\s+(?:"([^"]*)"|'([^']*)'|([^\s;&|)]+))/g),
  ].filter((match) => !isQuoted(match.index));
  const last = matches.at(-1);
  if (!last) {
    return null;
  }
  const dir = last[1] ?? last[2] ?? last[3];
  return dir === "-" || dir.includes("$") ? null : dir;
}

/** True when a scrubbed command runs `gh pr create` at a command position. */
export function isGhPrCreate(scrubbed) {
  return runsCommand(scrubbed, "gh\\s+pr\\s+create");
}

/**
 * Returns null when the command is not a PR creation, or when the body cannot
 * be read out of it — an unreadable body is not evidence of a missing template.
 * `requireDraft` is lazy because resolving it shells out to git, and this runs
 * on every Bash call. It receives the PR's explicit target — true/false when
 * `--repo` names one, null otherwise — and the `cd` target, if any.
 */
export function checkBash(cmd, { requireDraft = (target) => target ?? true } = {}) {
  const scrubbed = scrubShell(cmd);
  if (!isGhPrCreate(scrubbed)) {
    return null;
  }
  // --web hands authoring to the browser, where the human writes the body.
  if (WEB.test(scrubbed)) {
    return null;
  }

  const problems = [];
  if (FILL.test(scrubbed)) {
    problems.push(
      "--fill builds the body from commit messages and skips the template; pass --body-file with the built description instead",
    );
  }
  if (!DRAFT.test(scrubbed)) {
    const repo = flagValue(cmd, "-R|--repo");
    const target = repo !== null ? BONLIVA_REPO_FLAG.test(repo) : null;
    if (requireDraft(target, cdTarget(cmd))) {
      problems.push(
        "this repo opens PRs as drafts — add --draft (the author publishes when ready)",
      );
    }
  }

  const body = bodyFromCommand(cmd);
  if (body === null) {
    return problems.length > 0 ? problems : null;
  }
  // Flag values come from the raw command: scrubbing deleted their quoted text.
  const haystack = [
    flagValue(cmd, "-t|--title"),
    flagValue(cmd, "-H|--head"),
    body,
  ]
    .filter((value) => value !== null)
    .join("\n");
  return [...problems, ...missingSections(body, haystack)];
}

export function checkMcp(
  input,
  toolName,
  { requireDraft = (target) => target ?? true } = {},
) {
  if (toolName === "mcp__bond-bitbucket__create_pull_request") {
    const target =
      typeof input.workspace === "string"
        ? input.workspace.toLowerCase() === "bonliva"
        : null;
    if (requireDraft(target)) {
      return [
        "this repo opens PRs as drafts — use create_draft_pull_request (the author publishes when ready)",
      ];
    }
  }
  const body = typeof input.description === "string" ? input.description : null;
  if (body === null) {
    return null;
  }
  const haystack = [input.title, input.source_branch, body]
    .filter((value) => typeof value === "string")
    .join("\n");
  return missingSections(body, haystack);
}

/**
 * `haystack` is where a ticket id may appear (title, branch, body) — the Jira
 * section is only required when the work actually has a ticket.
 */
export function missingSections(body, haystack) {
  const problems = [];
  if (!/^##\s+Summary\s*$/m.test(body)) {
    problems.push("description is missing its `## Summary` section");
  }
  if (!/^##\s+Test plan\s*$/m.test(body)) {
    problems.push("description is missing its `## Test plan` section");
  }
  if (hasTicket(haystack) && !/^##\s+Jira\s*$/m.test(body)) {
    problems.push(
      "a ticket id is in play but the description has no `## Jira` section",
    );
  }
  return problems;
}

export function bodyFromCommand(cmd) {
  const fileArg = flagValue(cmd, "-F|--body-file");
  if (fileArg !== null) {
    // "-" reads stdin, which the hook cannot see.
    return fileArg !== "-" && existsSync(fileArg)
      ? readFileSync(fileArg, "utf8")
      : null;
  }
  const heredoc = cmd.match(/<<-?\s*["']?(\w+)["']?\s*\n([\s\S]*?)\n\s*\1\b/);
  if (heredoc) {
    return heredoc[2];
  }
  return flagValue(cmd, "-b|--body");
}

function flagValue(cmd, flags) {
  const match = cmd.match(
    new RegExp(
      `(?:^|\\s)(?:${flags})[=\\s]+(?:"((?:[^"\\\\]|\\\\[\\s\\S])*)"|'([^']*)'|([^\\s"']+))`,
    ),
  );
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null;
}
