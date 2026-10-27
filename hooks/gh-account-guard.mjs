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
 * `gh` that already carries a `GH_TOKEN=` prefix, or runs with GH_TOKEN
 * exported, is trusted as is.
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

const HEREDOC = /<<-?\s*(["']?)(\w+)\1([^\n]*)\n(?:[\s\S]*?\n)?[ \t]*\2(?![\w])/g;
const COMMENT = /(^|\s)#[^\n]*/g;
const SUBSTITUTION = /\$\(([^()]*)\)/g;
const SEGMENT_BREAK = /[\n;&|(){}`]+/;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const WRAPPERS = new Set(["command", "builtin", "exec", "nohup", "time", "env"]);
const GITHUB_URL = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/|$)/;

// gh groups that never write to a repo, and verbs that only read or act locally.
const GH_LOCAL_GROUPS = new Set([
  "auth", "config", "extension", "alias", "completion", "help", "search", "browse", "status", "gist", "codespace",
]);
const GH_READ_VERBS = new Set([
  "view", "list", "ls", "status", "diff", "checks", "browse", "download", "watch", "clone", "checkout", "set-default",
]);
const GH_API_WRITE = /^(?:-X|--method)(?:=|$)|^(?:-f|-F|--field|--raw-field|--input)(?:=|$)/;
const GIT_GLOBAL_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]);
const PUSH_FLAG_WITH_VALUE = new Set(["-o", "--push-option", "--receive-pack", "--exec", "--repo"]);

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

/**
 * The command as the shell would split it into words: heredoc bodies, comments
 * and any quoted string with a space in it are data and dropped; a one-word
 * quoted string keeps its text, so `-R "acme/app"` still names the repo. A
 * `$( … )` collapses to one word in place and is also returned as its own
 * segment, so `GH_TOKEN=$(gh auth token -u x) gh pr create` stays one segment.
 */
function segments(cmd) {
  const masked = cmd
    .replace(HEREDOC, "<<HEREDOC$3")
    .replace(/"((?:[^"\\]|\\[\s\S])*)"|'([^']*)'/g, (_, dq, sq) => {
      const text = dq ?? sq;
      return /\s/.test(text) || text === "" ? "''" : text;
    })
    .replace(COMMENT, "$1")
    .replace(/\\\n/g, " ");
  const inner = [];
  const outer = masked.replace(SUBSTITUTION, (_, body) => {
    inner.push(body);
    return "$SUB";
  });
  return [outer, ...inner]
    .flatMap((part) => part.split(SEGMENT_BREAK))
    .map((segment) => segment.trim().split(/\s+/).filter(Boolean))
    .filter((words) => words.length > 0);
}

/** Splits leading `VAR=…` assignments and wrappers off the command's words. */
function parseSegment(words) {
  let i = 0;
  let setsToken = false;
  while (i < words.length && (ASSIGNMENT.test(words[i]) || WRAPPERS.has(words[i]))) {
    if (words[i].startsWith("GH_TOKEN=") || words[i].startsWith("GITHUB_TOKEN=")) {
      setsToken = true;
    }
    i += 1;
  }
  const name = words[i]?.split("/").pop();
  return { name, args: words.slice(i + 1), setsToken };
}

function ghWrite(args) {
  const [group, verb] = args;
  if (!group || GH_LOCAL_GROUPS.has(group)) {
    return null;
  }
  const repoFlag = args.findIndex((a) => a === "-R" || a === "--repo" || /^(?:-R|--repo)=/.test(a));
  const repoValue = repoFlag < 0 ? null : args[repoFlag].includes("=") ? args[repoFlag].split("=")[1] : args[repoFlag + 1];
  const named = repoValue?.match(/(?:^|\/)([\w.-]+)\/([\w.-]+)$/);
  if (group === "api") {
    if (!args.slice(1).some((a) => GH_API_WRITE.test(a))) {
      return null;
    }
    const path = args.slice(1).find((a) => /^\/?repos\//.test(a))?.match(/repos\/([\w.-]+)\/([\w.-]+)/);
    return { repo: path ? { owner: path[1], repo: path[2] } : null };
  }
  if (!verb || GH_READ_VERBS.has(verb)) {
    return null;
  }
  const url = repoFromUrl(args[2]);
  return { repo: named ? { owner: named[1], repo: named[2] } : url };
}

/** `git [globals] push [flags] [remote] [refspec…]` → the remote and refspecs, else null. */
function gitPush(args) {
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) {
    i += GIT_GLOBAL_WITH_VALUE.has(args[i]) ? 2 : 1;
  }
  if (args[i] !== "push") {
    return null;
  }
  const flags = [];
  const positional = [];
  for (let j = i + 1; j < args.length; j += 1) {
    if (args[j].startsWith("-")) {
      flags.push(args[j]);
      if (PUSH_FLAG_WITH_VALUE.has(args[j]) && j + 1 < args.length) {
        flags.push(args[(j += 1)]);
      }
    } else {
      positional.push(args[j]);
    }
  }
  return { flags, remote: positional[0] ?? "origin", refspecs: positional.slice(1) };
}

/** The branch a refspec writes on the remote — `HEAD:refs/heads/x` is `x`. */
function destination(refspec, currentBranch) {
  const dst = refspec.replace(/^\+/, "").split(":").pop().replace(/^refs\/heads\//, "");
  return dst === "HEAD" || dst === "" ? currentBranch : dst;
}

function same(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}

function pushMessage({ push, target, expected, sshAccount, token, currentBranch }) {
  const refspecs = push.refspecs.length > 0 ? push.refspecs : [currentBranch ?? "<branch>"];
  const flags = push.flags.length > 0 ? `${push.flags.join(" ")} ` : "";
  const isNamedRemote = !/[:/]/.test(push.remote);
  const fetch = isNamedRemote
    ? ` && git fetch ${push.remote} ${refspecs.map((r) => destination(r, currentBranch ?? "<branch>")).join(" ")}`
    : "";
  return (
    `${target.owner}/${target.repo} is pushed by ${expected}, but this SSH remote authenticates as ${sshAccount}. ` +
    `Push over HTTPS with ${expected}'s token instead:\n` +
    `  ${token} git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push ${flags}` +
    `https://github.com/${target.owner}/${target.repo}.git ${refspecs.join(" ")}${fetch}\n` +
    (isNamedRemote
      ? `The fetch matters: a push to a URL leaves ${push.remote}/<branch> stale, and the worktree cleanup reads it.`
      : "")
  ).trimEnd();
}

/**
 * Returns the block message, or null to let the command run. Each segment of
 * the command is judged on its own: a `GH_TOKEN=` prefix covers only the `gh`
 * it precedes, and only words at argument positions can name the target repo.
 *
 * `remotes` maps the cwd's remote names to URLs; `active` is the active `gh`
 * login; `envToken` is true when GH_TOKEN is already exported to the session.
 */
export function decide({ cmd, accounts, active, sshAccount, remotes, currentBranch = null, envToken = false }) {
  if (accounts.size === 0) {
    return null;
  }
  for (const words of segments(cmd)) {
    const { name, args, setsToken } = parseSegment(words);
    const message =
      name === "git"
        ? judgePush({ push: gitPush(args), accounts, sshAccount, remotes, currentBranch })
        : name === "gh" && !setsToken && !envToken
          ? judgeGh({ write: ghWrite(args), accounts, active, remotes })
          : null;
    if (message) {
      return message;
    }
  }
  return null;
}

function expectedFor(target, accounts) {
  return target ? accounts.get(target.owner.toLowerCase()) : undefined;
}

function judgePush({ push, accounts, sshAccount, remotes, currentBranch }) {
  if (!push) {
    return null;
  }
  const url = /[:/]/.test(push.remote) ? push.remote : remotes?.get(push.remote);
  const target = repoFromUrl(url);
  const expected = expectedFor(target, accounts);
  const overSsh = /^(?:git@|ssh:\/\/)/.test(url ?? "");
  if (!expected || !overSsh || !sshAccount || same(sshAccount, expected)) {
    return null;
  }
  const token = `GH_TOKEN=$(gh auth token -u ${expected})`;
  return pushMessage({ push, target, expected, sshAccount, token, currentBranch });
}

function judgeGh({ write, accounts, active, remotes }) {
  if (!write) {
    return null;
  }
  const target = write.repo ?? repoFromUrl(remotes?.get("origin"));
  const expected = expectedFor(target, accounts);
  if (!expected || !active || same(active, expected)) {
    return null;
  }
  return (
    `${target.owner}/${target.repo} belongs to ${expected}, but the active gh account is ${active}. ` +
    `Re-run with the token set for this one command:\n  GH_TOKEN=$(gh auth token -u ${expected}) <the same gh command>\n` +
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

function git(cwd, args) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function remotesOf(cwd) {
  const remotes = new Map();
  for (const line of git(cwd, ["remote", "-v"]).split("\n")) {
    const [name, url, kind] = line.split(/\s+/);
    if (name && url && kind === "(push)") {
      remotes.set(name, url);
    }
  }
  return remotes;
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
  const cwd = payload.cwd ?? process.cwd();
  const message = decide({
    cmd,
    accounts,
    active: activeLogin(),
    sshAccount: process.env.BOND_GH_SSH_ACCOUNT || null,
    remotes: remotesOf(cwd),
    currentBranch: git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]) || null,
    envToken: Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN),
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
