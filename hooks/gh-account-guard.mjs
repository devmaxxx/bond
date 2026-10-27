#!/usr/bin/env node
/**
 * PreToolUse hook on Bash — blocks a `git push` or a `gh` write that would go
 * out under the wrong GitHub account, and names the command that would not.
 *
 * Two accounts can be logged into `gh` at once, and the active one is global to
 * the machine: another session may have switched it since this one looked. An
 * SSH remote ignores `gh` entirely and pushes as whoever owns the SSH key; an
 * HTTPS remote whose credential helper is `gh` pushes as the active account.
 * Both failed in practice as "Permission denied to <account>" — or worse,
 * succeeded as the wrong identity on a repo both accounts can write to.
 *
 * The fix it proposes is a per-command `GH_TOKEN=$(gh auth token -u <account>)`,
 * never `gh auth switch`: a switch moves every other session's account too. A
 * command that carries a `GH_TOKEN=` prefix, or runs with GH_TOKEN exported, is
 * trusted as is.
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
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GITHUB_URL = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/|$)/;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

// Words that leave the next word the command: shell keywords and wrappers.
const KEYWORDS = new Set(["if", "then", "else", "elif", "do", "while", "until", "!", "time", "command", "builtin", "exec", "nohup"]);
// Wrappers whose own flags, and for some one value, come before the command.
const WRAPPER_VALUES = {
  sudo: ["-u", "-g", "-C"],
  env: ["-u", "-C", "-S"],
  timeout: ["-s", "-k", "--signal", "--kill-after"],
  xargs: ["-I", "-n", "-L", "-P", "-d", "-E", "-s"],
};
const SHELLS = new Set(["bash", "sh", "zsh"]);

// gh groups that never write to a repo, and verbs that only read or act locally.
const GH_LOCAL_GROUPS = new Set([
  "auth", "config", "extension", "alias", "completion", "help", "search", "browse", "status", "gist", "codespace",
]);
const GH_READ_VERBS = new Set([
  "view", "list", "ls", "status", "diff", "checks", "browse", "download", "watch", "clone", "checkout", "set-default",
]);
const GH_API_FIELD = /^(?:-f|-F|--field|--raw-field|--input)(?:=|$)|^-[fF]./;
const GIT_GLOBAL_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]);
const PUSH_FLAG_WITH_VALUE = new Set(["-o", "--push-option", "--receive-pack", "--exec", "--repo"]);
const PUSH_WITHOUT_REFSPEC = new Set(["--all", "--mirror", "--tags", "--branches"]);

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

/**
 * Splits a Bash command into segments of words the way the shell would: quotes
 * removed, comments and heredoc bodies dropped, a break at `;`, `&`, `|`, a
 * newline or a subshell paren. A `$( … )` becomes one word in place and its
 * own segments are appended, so `GH_TOKEN=$(gh auth token -u x) gh pr create`
 * stays one segment. Best effort: an unbalanced quote just ends the input.
 */
export function lex(cmd) {
  const segments = [];
  let words = [];
  let word = null;
  const heredocs = [];

  const endWord = () => {
    if (word !== null) {
      words.push(word);
    }
    word = null;
  };
  const endSegment = () => {
    endWord();
    if (words.length > 0) {
      segments.push(words);
    }
    words = [];
  };
  const append = (text) => {
    word = (word ?? "") + text;
  };
  // Reads a `$( … )` body starting at `start`, returns the index after its `)`.
  const substitution = (start) => {
    let depth = 1;
    let i = start;
    let quote = null;
    while (i < cmd.length && depth > 0) {
      const c = cmd[i];
      if (quote) {
        if (c === "\\" && quote === '"') {
          i += 1;
        } else if (c === quote) {
          quote = null;
        }
      } else if (c === "'" || c === '"') {
        quote = c;
      } else if (c === "(") {
        depth += 1;
      } else if (c === ")") {
        depth -= 1;
      } else if (c === "\\") {
        i += 1;
      }
      i += 1;
    }
    segments.push(...lex(cmd.slice(start, depth === 0 ? i - 1 : i)));
    append("$SUB");
    return i;
  };
  const skipHeredocBodies = (from) => {
    let i = from;
    for (const delimiter of heredocs.splice(0)) {
      while (i < cmd.length) {
        const eol = cmd.indexOf("\n", i);
        const line = cmd.slice(i, eol < 0 ? cmd.length : eol);
        i = eol < 0 ? cmd.length : eol + 1;
        if (line.trim() === delimiter) {
          break;
        }
      }
    }
    return i;
  };

  let i = 0;
  while (i < cmd.length) {
    const c = cmd[i];
    if (c === "\\") {
      if (cmd[i + 1] !== "\n") {
        append(cmd[i + 1] ?? "");
      }
      i += 2;
    } else if (c === "'") {
      const end = cmd.indexOf("'", i + 1);
      append(cmd.slice(i + 1, end < 0 ? cmd.length : end));
      i = end < 0 ? cmd.length : end + 1;
    } else if (c === '"') {
      append("");
      i += 1;
      while (i < cmd.length && cmd[i] !== '"') {
        if (cmd[i] === "\\") {
          append(cmd[i + 1] ?? "");
          i += 2;
        } else if (cmd.startsWith("$(", i)) {
          i = substitution(i + 2);
        } else {
          append(cmd[i]);
          i += 1;
        }
      }
      i += 1;
    } else if (cmd.startsWith("$(", i)) {
      i = substitution(i + 2);
    } else if (c === "#" && word === null) {
      while (i < cmd.length && cmd[i] !== "\n") {
        i += 1;
      }
    } else if (cmd.startsWith("<<", i) && !cmd.startsWith("<<<", i)) {
      const m = cmd.slice(i).match(/^<<-?\s*(["']?)(\w+)\1/);
      if (m) {
        heredocs.push(m[2]);
        endWord();
        i += m[0].length;
      } else {
        append("<<");
        i += 2;
      }
    } else if (c === "\n") {
      endSegment();
      i = skipHeredocBodies(i + 1);
    } else if (";&|()`".includes(c)) {
      endSegment();
      i += 1;
    } else if (/\s/.test(c)) {
      endWord();
      i += 1;
    } else {
      append(c);
      i += 1;
    }
  }
  endSegment();
  return segments;
}

/** Splits leading assignments, keywords and wrappers off a segment's words. */
function parseSegment(words) {
  let i = 0;
  let setsToken = false;
  while (i < words.length) {
    const w = words[i];
    if (ASSIGNMENT.test(w)) {
      setsToken ||= /^(?:GH_TOKEN|GITHUB_TOKEN)=/.test(w);
      i += 1;
    } else if (KEYWORDS.has(w)) {
      i += 1;
    } else if (Object.hasOwn(WRAPPER_VALUES, w)) {
      i += 1;
      while (i < words.length && (words[i].startsWith("-") || ASSIGNMENT.test(words[i]))) {
        i += WRAPPER_VALUES[w].includes(words[i]) ? 2 : 1;
      }
      if (w === "timeout" && /^\d/.test(words[i] ?? "")) {
        i += 1;
      }
    } else {
      break;
    }
  }
  const name = words[i]?.split("/").pop();
  return { name, args: words.slice(i + 1), setsToken };
}

function repoFromUrl(url) {
  const m = url?.match(GITHUB_URL);
  return m ? { owner: m[1], repo: m[2] } : null;
}

/** A flag's value in any of its spellings: `-X POST`, `-X=POST`, `-XPOST`, `--method=POST`. */
function flagValue(args, names) {
  for (let i = 0; i < args.length; i += 1) {
    for (const name of names) {
      if (args[i] === name) {
        return args[i + 1];
      }
      if (args[i].startsWith(`${name}=`)) {
        return args[i].slice(name.length + 1);
      }
      if (name.length === 2 && args[i].startsWith(name)) {
        return args[i].slice(2);
      }
    }
  }
  return undefined;
}

/**
 * A `gh api` call writes when its method is not GET, or when it carries fields
 * and no method (gh then defaults to POST). One that names no `repos/` path —
 * search, graphql, user — has no repo to judge, so it is no opinion.
 */
function ghApiWrite(args) {
  const method = flagValue(args, ["-X", "--method"])?.toUpperCase();
  const writes = method ? method !== "GET" : args.some((a) => GH_API_FIELD.test(a));
  const path = args.find((a) => /^\/?repos\//.test(a))?.match(/repos\/([\w.{}-]+)\/([\w.{}-]+)/);
  if (!writes || !path) {
    return null;
  }
  // gh fills `{owner}/{repo}` from the current directory's repo.
  return { repo: path[1] === "{owner}" ? null : { owner: path[1], repo: path[2] } };
}

/** The repo a `gh` write targets — `{ repo: null }` for the cwd's — or null for a read. */
function ghWrite(args) {
  const [group, verb] = args;
  if (!group || GH_LOCAL_GROUPS.has(group)) {
    return null;
  }
  if (group === "api") {
    return ghApiWrite(args.slice(1));
  }
  if (!verb || GH_READ_VERBS.has(verb)) {
    return null;
  }
  const named = flagValue(args, ["-R", "--repo"])?.match(/(?:^|\/)([\w.-]+)\/([\w.-]+)$/);
  if (named) {
    return { repo: { owner: named[1], repo: named[2] } };
  }
  return { repo: repoFromUrl(args[2]) };
}

/** `git [globals] push [flags] [remote] [refspec…]` → its parts, else null. */
function gitPush(args) {
  let i = 0;
  let dir = null;
  while (i < args.length && args[i].startsWith("-")) {
    if (args[i] === "-C") {
      dir = args[i + 1];
    }
    i += GIT_GLOBAL_WITH_VALUE.has(args[i]) ? 2 : 1;
  }
  if (args[i] !== "push") {
    return null;
  }
  const flags = [];
  const positional = [];
  for (let j = i + 1; j < args.length; j += 1) {
    if (!args[j].startsWith("-")) {
      positional.push(args[j]);
      continue;
    }
    flags.push(args[j]);
    if (PUSH_FLAG_WITH_VALUE.has(args[j]) && j + 1 < args.length) {
      j += 1;
      flags.push(args[j]);
    }
  }
  return { dir, flags, remote: positional[0] ?? "origin", refspecs: positional.slice(1) };
}

/** The branch a refspec writes on the remote — `HEAD:refs/heads/x` is `x`. */
function destination(refspec, currentBranch) {
  const dst = refspec.replace(/^\+/, "").split(":").pop().replace(/^refs\/heads\//, "");
  return dst === "HEAD" || dst === "" ? currentBranch : dst;
}

function shellQuote(word) {
  return /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`;
}

function same(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}

function expectedFor(target, accounts) {
  return target ? accounts.get(target.owner.toLowerCase()) : undefined;
}

function tokenFor(account) {
  return `GH_TOKEN=$(gh auth token -u ${account})`;
}

/** The same push over HTTPS with the right token, plus the fetch that refreshes the remote's refs. */
function httpsPush({ push, target, expected, currentBranch }) {
  const branch = currentBranch ?? "<branch>";
  const bulk = push.flags.some((f) => PUSH_WITHOUT_REFSPEC.has(f));
  const refspecs = push.refspecs.length > 0 || bulk ? push.refspecs : [branch];
  const words = [...push.flags, `https://github.com/${target.owner}/${target.repo}.git`, ...refspecs];
  const isNamedRemote = !/[:/]/.test(push.remote);
  const fetched = bulk ? [] : refspecs.map((r) => destination(r, branch));
  const fetch = isNamedRemote ? ` && git fetch ${[push.remote, ...fetched].join(" ")}` : "";
  const note = isNamedRemote
    ? `\nThe fetch matters: a push to a URL leaves ${push.remote}/<branch> stale, and the worktree cleanup reads it.`
    : "";
  return (
    `  ${tokenFor(expected)} git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push ` +
    `${words.map(shellQuote).join(" ")}${fetch}${note}`
  );
}

function judgePush({ push, accounts, active, sshAccount, state, httpsUsesGh }) {
  const url = /[:/]/.test(push.remote) ? push.remote : state.remotes.get(push.remote);
  const target = repoFromUrl(url);
  const expected = expectedFor(target, accounts);
  if (!expected) {
    return null;
  }
  const where = `${target.owner}/${target.repo}`;
  if (/^(?:git@|ssh:\/\/)/.test(url)) {
    if (!sshAccount || same(sshAccount, expected)) {
      return null;
    }
    return (
      `${where} is pushed by ${expected}, but this SSH remote authenticates as ${sshAccount}. ` +
      `Push over HTTPS with ${expected}'s token instead:\n${httpsPush({ push, target, expected, ...state })}`
    );
  }
  if (!active || same(active, expected) || !httpsUsesGh(state.dir)) {
    return null;
  }
  return (
    `${where} is pushed by ${expected}, but gh's credential helper would push as the active account, ${active}. ` +
    `Push with ${expected}'s token for this one command:\n${httpsPush({ push, target, expected, ...state })}`
  );
}

function judgeGh({ write, accounts, active, state }) {
  const target = write.repo ?? repoFromUrl(state.remotes.get("origin"));
  const expected = expectedFor(target, accounts);
  if (!expected || !active || same(active, expected)) {
    return null;
  }
  return (
    `${target.owner}/${target.repo} belongs to ${expected}, but the active gh account is ${active}. ` +
    `Re-run with the token set for this one command:\n  ${tokenFor(expected)} <the same gh command>\n` +
    "Do not `gh auth switch` — the active account is machine-global and other sessions rely on it."
  );
}

/** The script a segment hands to another shell: `bash -c '…'`, `eval …`. */
function nestedScript(name, args) {
  if (name === "eval") {
    return args.join(" ");
  }
  if (!SHELLS.has(name)) {
    return null;
  }
  const flag = args.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a));
  return flag < 0 ? null : args[flag + 1];
}

/**
 * Returns the block message, or null to let the command run. Each segment is
 * judged on its own: a `GH_TOKEN=` prefix covers only the command it precedes,
 * and only words at argument positions can name the target repo.
 *
 * `repoAt(dir)` gives `{ remotes: Map<name, url>, currentBranch }` for a
 * directory — the cwd, a `cd` earlier in the command, or a push's `-C`.
 * `httpsUsesGh(dir)` says whether `gh` is git's credential helper for
 * github.com there. `active` is the active `gh` login; `envToken` is true when
 * GH_TOKEN is already exported to the session.
 */
export function decide({ cmd, accounts, active, sshAccount, cwd = ".", repoAt, httpsUsesGh = () => false, envToken = false }) {
  if (accounts.size === 0) {
    return null;
  }
  const context = { accounts, active, sshAccount, repoAt, httpsUsesGh };
  let dir = cwd;
  for (const words of lex(cmd)) {
    const { name, args, setsToken } = parseSegment(words);
    if (name === "cd" && args[0]) {
      dir = resolve(dir, args[0]);
      continue;
    }
    const message = judgeSegment({ name, args, dir, trusted: setsToken || envToken, context });
    if (message) {
      return message;
    }
  }
  return null;
}

function judgeSegment({ name, args, dir, trusted, context }) {
  const { accounts, active, sshAccount, repoAt, httpsUsesGh } = context;
  const nested = nestedScript(name, args);
  if (nested) {
    return decide({ ...context, cmd: nested, cwd: dir, envToken: trusted });
  }
  if (name === "git") {
    const push = gitPush(args);
    if (!push) {
      return null;
    }
    const pushDir = push.dir ? resolve(dir, push.dir) : dir;
    const state = { dir: pushDir, ...repoAt(pushDir) };
    return judgePush({ push, accounts, active: trusted ? null : active, sshAccount, state, httpsUsesGh });
  }
  if (name === "gh" && !trusted) {
    const write = ghWrite(args);
    return write ? judgeGh({ write, accounts, active, state: repoAt(dir) }) : null;
  }
  return null;
}

function git(dir, args) {
  try {
    return execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function repoAt(dir) {
  const remotes = new Map();
  for (const line of git(dir, ["remote", "-v"]).split("\n")) {
    const [name, url, kind] = line.split(/\s+/);
    if (name && url && kind === "(push)") {
      remotes.set(name, url);
    }
  }
  return { remotes, currentBranch: git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]) || null };
}

function httpsUsesGh(dir) {
  const helpers = git(dir, ["config", "--get-all", "credential.https://github.com.helper"]).split("\n");
  return /gh(?:\.exe)? auth git-credential/.test(helpers.at(-1) ?? "");
}

function activeLogin() {
  const configDir =
    process.env.GH_CONFIG_DIR || join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "gh");
  try {
    const hosts = readFileSync(join(configDir, "hosts.yml"), "utf8");
    const block = hosts.split(/^(?=\S)/m).find((b) => b.startsWith("github.com:"));
    return block?.match(/^\s+user:\s*(\S+)/m)?.[1] ?? null;
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
  // Every Bash call passes through here; most never mention git or gh, and pay no spawn.
  if (accounts.size === 0 || !/\b(?:git|gh)\b/.test(cmd)) {
    return;
  }
  // GH_HOST pointing elsewhere means the call is not for github.com at all.
  if (process.env.GH_HOST && process.env.GH_HOST !== "github.com") {
    return;
  }
  const message = decide({
    cmd,
    accounts,
    active: activeLogin(),
    sshAccount: process.env.BOND_GH_SSH_ACCOUNT || null,
    cwd: payload.cwd ?? process.cwd(),
    repoAt,
    httpsUsesGh,
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
