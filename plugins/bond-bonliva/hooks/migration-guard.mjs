#!/usr/bin/env node
/**
 * PreToolUse hook on Write, Edit and MultiEdit — guards the creation of a new
 * migration file. Replacing or editing one that exists is an update and passes;
 * an Edit with an empty old_string creates a file just as a Write does, which
 * is why all three are registered.
 *
 * Two failures recur when a migration is written by an agent: a second
 * migration appears on a branch that already carries one (each review round
 * adds a file instead of amending the first), and the new file's prefix does
 * not sort last, so it runs before migrations it depends on, or collides with
 * one merged meanwhile. Exit 2 blocks the write and hands the reasons back.
 *
 * A migration is any code file directly inside a directory named `migrations`.
 * The prefix convention is read from the files already there: Bonliva's
 * TypeORM repos use a 13-digit ms timestamp, the Mongo migrator a YYYYMMDD
 * date. An empty directory gets the 13-digit rule.
 *
 * Anything unreadable — payload, git, the directory — exits 0: a hook bug must
 * never block unrelated writes. `BOND_MIGRATION_GUARD=off` disables it.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CODE = /\.(ts|js|mjs|cjs|sql)$/;
const NOT_A_MIGRATION = /(\.|^)(test|spec|integration|contract|d)\.[a-z]+$|^index\./;
const PREFIXED = /^(\d+)-(.+)\.[a-z]+$/;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_WIDTH = 13;
// A date prefix cannot order two migrations written on the same day, so the
// date convention accepts a tie; every finer-grained one must sort strictly last.
const DATE_WIDTH = 8;

const isMigrationName = (name) => CODE.test(name) && !NOT_A_MIGRATION.test(name);

export function isMigrationFile(path) {
  return basename(dirname(path)) === "migrations" && isMigrationName(basename(path));
}

function prefixWidth(names) {
  const counts = new Map();
  for (const name of names) {
    const match = name.match(PREFIXED);
    if (match) {
      const width = match[1].length;
      counts.set(width, (counts.get(width) ?? 0) + 1);
    }
  }
  let best = DEFAULT_WIDTH;
  let bestCount = 0;
  for (const [width, count] of counts) {
    if (count > bestCount) {
      best = width;
      bestCount = count;
    }
  }
  return best;
}

function highestPrefix(names, width) {
  let highest = null;
  for (const name of names) {
    const prefix = name.match(PREFIXED)?.[1];
    // Same width means string order is numeric order, with no BigInt needed.
    if (prefix?.length === width && (highest === null || prefix > highest)) {
      highest = prefix;
    }
  }
  return highest;
}

function suggestPrefix(width, highest, now) {
  if (width === DEFAULT_WIDTH) {
    const floor = highest === null ? 0 : Number(highest) + 1000;
    return String(Math.max(now, floor));
  }
  if (width === DATE_WIDTH) {
    const today = new Date(now).toISOString().slice(0, 10).replaceAll("-", "");
    return highest !== null && highest > today ? highest : today;
  }
  return null;
}

/**
 * `existing` — file names already in the migrations directory, or merged into
 * the base since this branch left it: a new migration must sort after those too.
 * `branchAdded` — paths of migrations this branch adds that are not merged yet,
 * committed or not.
 * `fileExists` — the write replaces a migration, which is an update.
 */
export function decide({ filePath, fileExists, existing, branchAdded, now }) {
  if (!isMigrationFile(filePath) || fileExists) {
    return [];
  }
  const reasons = [];
  const name = basename(filePath);

  const others = branchAdded.filter((path) => basename(path) !== name);
  if (others.length > 0) {
    reasons.push(
      `this branch already adds ${others.join(", ")} — update that migration instead of creating another one. If the user confirms a second one is really needed, they can lift this check by setting BOND_MIGRATION_GUARD=off for the session; an export inside a Bash call never reaches the hook`,
    );
  }

  const migrations = existing.filter((other) => other !== name && isMigrationName(other));
  const width = prefixWidth(migrations);
  const kind = width === DATE_WIDTH ? "YYYYMMDD date" : `${width}-digit timestamp`;
  const highest = highestPrefix(migrations, width);
  const suggestion = suggestPrefix(width, highest, now);
  const hint = suggestion ? ` (e.g. ${suggestion})` : "";
  const match = name.match(PREFIXED);

  if (!match || match[1].length !== width) {
    reasons.push(
      `"${name}" must start with a ${kind} prefix and a dash, like the migrations next to it${hint}`,
    );
  } else {
    const prefix = match[1];
    const sortsLast =
      highest === null ||
      prefix > highest ||
      (width === DATE_WIDTH && prefix === highest);
    if (!sortsLast) {
      reasons.push(
        `prefix ${prefix} does not sort after the newest migration (${highest}); a new migration must run last${hint}`,
      );
    }
  }

  const stem = match ? match[2] : name.replace(/\.[a-z]+$/, "");
  if (!KEBAB.test(stem)) {
    reasons.push(`"${stem}" must be kebab-case (lowercase words joined by dashes)`);
  }
  return reasons;
}

// hooks.json gives the hook 15 s and drops one that outruns it without an
// answer, so the git calls of one decision share a budget well inside that: a
// slow repository costs the git-derived reasons, not the whole check.
const GIT_CALL_MS = 3000;
const GIT_BUDGET_MS = 8000;

/** Runs git in `cwd` and returns its raw stdout, or null on any failure or once the budget is spent. */
function gitRunner() {
  const deadline = Date.now() + GIT_BUDGET_MS;
  return (cwd, args) => {
    const left = deadline - Date.now();
    if (left <= 0) {
      return null;
    }
    try {
      return execFileSync("git", ["-C", cwd, ...args], {
        encoding: "utf8",
        timeout: Math.min(GIT_CALL_MS, left),
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return null;
    }
  };
}

const trimmed = (out) => out?.trim() || null;
// `-z` output is not C-quoted, so a name with a space or a non-ASCII letter arrives as it is on disk.
const nulSeparated = (out) => out?.split("\0").filter(Boolean) ?? [];

function configuredBase(root) {
  try {
    const manifest = JSON.parse(
      readFileSync(join(root, ".bond", "project.json"), "utf8"),
    );
    return manifest.baseBranch ? `origin/${manifest.baseBranch}` : null;
  } catch {
    return null;
  }
}

/**
 * The base a branch is compared against: the repo's stated base when it has
 * one, else whichever trunk-like ref is fewest commits behind HEAD — Bonliva
 * repos branch from main, dev or a release branch, and diffing against the
 * wrong one reports every unreleased migration as this branch's.
 */
function resolveBase(git, root) {
  const stated = configuredBase(root);
  if (stated && trimmed(git(root, ["rev-parse", "--verify", "--quiet", stated]))) {
    return stated;
  }
  const candidates = [
    trimmed(git(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"])),
    "origin/main",
    "origin/master",
    "origin/dev",
    "origin/develop",
    trimmed(
      git(root, [
        "for-each-ref",
        "--sort=-committerdate",
        "--count=1",
        "--format=%(refname:short)",
        "refs/remotes/origin/release/",
      ]),
    ),
  ].filter(Boolean);
  let best = null;
  let bestDistance = Infinity;
  for (const ref of new Set(candidates)) {
    const count = trimmed(git(root, ["rev-list", "--count", `${ref}..HEAD`]));
    // Number(null) is 0, which would crown a ref that does not exist.
    const distance = count === null ? Infinity : Number(count);
    if (distance < bestDistance) {
      best = ref;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * What git says about the migrations directory `dir`: the migrations this
 * branch adds that the base does not have (absolute paths), and the names the
 * base holds there.
 *
 * Every listing runs inside `dir` with `-z`, so git reports names relative to
 * it and unquoted, and no path of ours is compared with one of git's. Two kinds
 * of hit are dropped: a file gone from the disk (added, then deleted), and one
 * the base already holds — a squash merge leaves the branch's own commits out of
 * the base's history, so the three-dot diff keeps reporting the file.
 */
function readBranch(dir) {
  const git = gitRunner();
  const root = trimmed(git(dir, ["rev-parse", "--show-toplevel"]));
  if (!root) {
    return { branchAdded: [], baseNames: [] };
  }
  const base = resolveBase(git, root);
  const added = (...args) => nulSeparated(git(dir, ["diff", "-z", "--name-only", "--diff-filter=A", "--relative", ...args, "--", "."]));
  const candidates = new Set([
    ...nulSeparated(git(dir, ["ls-files", "-z", "--others", "--exclude-standard", "--", "."])),
    ...added("--cached"),
    ...(base ? added(`${base}...HEAD`) : []),
  ]);
  const baseNames = base ? nulSeparated(git(dir, ["ls-tree", "-z", "--name-only", base])) : [];
  const branchAdded = [...candidates]
    .filter(
      (name) =>
        !baseNames.includes(name) &&
        !name.includes("/") &&
        isMigrationFile(join(dir, name)) &&
        existsSync(join(dir, name)),
    )
    .map((name) => join(dir, name));
  return { branchAdded, baseNames };
}

function main() {
  if (process.env.BOND_MIGRATION_GUARD === "off") {
    return;
  }
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return;
  }
  const raw = payload?.tool_input?.file_path;
  if (!raw) {
    return;
  }
  const filePath = resolve(payload.cwd ?? process.cwd(), raw);
  // Replacing a migration that exists is an update, which needs no verdict and no git.
  if (!isMigrationFile(filePath) || existsSync(filePath)) {
    return;
  }
  const dir = dirname(filePath);
  let onDisk;
  try {
    onDisk = readdirSync(dir);
  } catch {
    // A directory that does not exist yet holds no migrations to sort after.
    onDisk = [];
  }
  const { branchAdded, baseNames } =
    onDisk.length > 0 ? readBranch(dir) : { branchAdded: [], baseNames: [] };
  const reasons = decide({
    filePath,
    existing: [...new Set([...onDisk, ...baseNames])],
    branchAdded,
    now: Date.now(),
  });
  if (reasons.length > 0) {
    process.stderr.write(
      `migration-guard blocked creating ${basename(filePath)}:\n  - ${reasons.join("\n  - ")}\n`,
    );
    process.exitCode = 2;
  }
}

/**
 * `import.meta.url` is percent-encoded and symlink-resolved; `argv[1]` is
 * neither, so comparing them as strings leaves the hook inert under a plugin
 * cache whose path has a space, a non-ASCII character or a symlink in it.
 */
function isEntryPoint() {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  try {
    main();
  } catch {
    // An unanticipated failure must not block the write; exit 0 is the contract.
  }
}
