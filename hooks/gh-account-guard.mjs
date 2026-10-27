#!/usr/bin/env node
/**
 * PreToolUse hook on Bash — blocks a `git push` or a `gh` write that would go
 * out under the wrong GitHub account, and names the command that would not.
 *
 * Two accounts can be logged into `gh` at once, and the active one is global to
 * the machine: another session may have switched it since this one looked. An
 * SSH remote ignores `gh` entirely and pushes as whoever owns the SSH key. Both
 * failed in practice as "Permission denied to <account>" — or worse, succeeded
 * as the wrong identity on a repo both accounts can write to.
 *
 * The fix it proposes is a per-command `GH_TOKEN=$(gh auth token -u <account>)`,
 * never `gh auth switch`: a switch moves every other session's account too. A
 * command that already sets `GH_TOKEN` is trusted as is.
 *
 * Configuration, both optional — with neither set the hook blocks nothing:
 *   BOND_GH_ACCOUNTS     owner=account pairs, e.g. "acme=work-login,me=me"
 *   BOND_GH_SSH_ACCOUNT  the account the SSH key authenticates as
 *
 * An owner missing from the map, a non-GitHub remote or an unreadable command
 * is no opinion: exit 0. The decision lives in `decide`, where it is tested.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runsCommand, scrubShell } from "./shell.mjs";

const GIT_PUSH = "git(?:\\s+(?:-[Cc]\\s+\\S+|--?\\S+))*\\s+push";
const GH_WRITE =
  "gh\\s+(?:pr\\s+(?:create|edit|merge|close|reopen|comment|review|ready)" +
  "|issue\\s+(?:create|edit|close|reopen|comment|delete)" +
  "|release\\s+(?:create|edit|delete|upload)" +
  "|repo\\s+(?:create|edit|delete|fork)" +
  "|label\\s+(?:create|edit|delete)" +
  "|run\\s+(?:rerun|cancel)|workflow\\s+run)";
const GH_API = "gh\\s+api";
const API_WRITE = /\s(?:-X|--method)[=\s]*(?:POST|PATCH|PUT|DELETE)\b|\s(?:-f|-F|--field|--raw-field|--input)[=\s]/i;
const SETS_TOKEN = /(?:^|[\s;&|(])GH_TOKEN=/;
const GITHUB_URL = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[\s"'/]|$)/;

export function parseAccounts(spec) {
  const map = new Map();
  for (const pair of (spec ?? "").split(/[,\s]+/)) {
    const [owner, account] = pair.split("=");
    if (owner && account) {
      map.set(owner.toLowerCase(), account);
    }
  }
  return map;
}

function repoFromUrl(url) {
  const m = url?.match(GITHUB_URL);
  return m ? { owner: m[1], repo: m[2] } : null;
}

/** The repo a command names itself — `-R`, a `repos/<owner>/` API path, a push URL. */
function namedRepo(cmd) {
  const flag = cmd.match(/(?:^|\s)(?:-R|--repo)[=\s]+["']?(?:[\w.-]+\/)?([\w.-]+)\/([\w.-]+)/);
  if (flag) {
    return { owner: flag[1], repo: flag[2] };
  }
  const api = cmd.match(/repos\/([\w.-]+)\/([\w.-]+)/);
  if (api) {
    return { owner: api[1], repo: api[2] };
  }
  return repoFromUrl(cmd);
}

function pushBranch(cmd) {
  const m = cmd.match(/\bpush\b((?:\s+\S+)*)/);
  const args = (m?.[1] ?? "").trim().split(/\s+/).filter((a) => a && !a.startsWith("-"));
  return args[1] ?? "<branch>";
}

/**
 * Returns the block message, or null to let the command run.
 * `originUrl` is the cwd's origin remote; `active` the active `gh` login.
 */
export function decide({ cmd, accounts, active, sshAccount, originUrl }) {
  if (accounts.size === 0 || SETS_TOKEN.test(cmd)) {
    return null;
  }
  const scrubbed = scrubShell(cmd);
  const isPush = runsCommand(scrubbed, GIT_PUSH);
  const isGhWrite =
    runsCommand(scrubbed, GH_WRITE) ||
    (runsCommand(scrubbed, GH_API) && API_WRITE.test(scrubbed));
  if (!isPush && !isGhWrite) {
    return null;
  }

  const named = namedRepo(cmd);
  const target = named ?? repoFromUrl(originUrl);
  const expected = target && accounts.get(target.owner.toLowerCase());
  if (!expected) {
    return null;
  }
  const token = `GH_TOKEN=$(gh auth token -u ${expected})`;

  if (isPush) {
    const pushesOverSsh = named ? /git@github\.com:/.test(cmd) : /^(?:git@|ssh:\/\/)/.test(originUrl ?? "");
    if (!pushesOverSsh || !sshAccount || sshAccount === expected) {
      return null;
    }
    const branch = pushBranch(cmd);
    return (
      `${target.owner}/${target.repo} is pushed by ${expected}, but this SSH remote authenticates as ${sshAccount}. ` +
      `Push over HTTPS with ${expected}'s token instead:\n` +
      `  ${token} git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push ` +
      `https://github.com/${target.owner}/${target.repo}.git ${branch} && git fetch origin ${branch}\n` +
      `The fetch matters: a push to a URL leaves origin/${branch} stale, and the worktree cleanup reads it.`
    );
  }

  if (!active || active === expected) {
    return null;
  }
  return (
    `${target.owner}/${target.repo} belongs to ${expected}, but the active gh account is ${active}. ` +
    `Re-run with the token set for this one command:\n  ${token} <the same gh command>\n` +
    "Do not `gh auth switch` — the active account is machine-global and other sessions rely on it."
  );
}

function activeLogin() {
  try {
    const hosts = readFileSync(join(homedir(), ".config", "gh", "hosts.yml"), "utf8");
    const block = hosts.split(/^(?=\S)/m).find((b) => b.startsWith("github.com:"));
    return block?.match(/^\s+user:\s*(\S+)/m)?.[1] ?? null;
  } catch {
    return null;
  }
}

function originOf(cwd) {
  try {
    return execFileSync("git", ["-C", cwd, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return;
  }
  const accounts = parseAccounts(process.env.BOND_GH_ACCOUNTS);
  const cmd = payload?.tool_input?.command ?? "";
  if (accounts.size === 0 || !cmd) {
    return;
  }
  const message = decide({
    cmd,
    accounts,
    active: activeLogin(),
    sshAccount: process.env.BOND_GH_SSH_ACCOUNT || null,
    originUrl: originOf(payload.cwd ?? process.cwd()),
  });
  if (message) {
    process.stderr.write(`bond:gh-account-guard: ${message}\n`);
    process.exit(2);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch {
    process.exit(0);
  }
}
