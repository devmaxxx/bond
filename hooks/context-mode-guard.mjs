#!/usr/bin/env node
/**
 * SessionStart hook — one line when this session's node still loads
 * better-sqlite3 and another session's context-mode server runs a different
 * node major.
 *
 * context-mode keeps one active better_sqlite3.node per plugin version, shared
 * by every session on the machine, and each session's hooks copy in the build
 * for their own ABI — even on node 22.5 and later, which open the database
 * through node:sqlite and never load the addon. A server below 22.5 that opens
 * its database after another session's copy loads the wrong build, and every
 * ctx_* call fails with "was compiled against a different Node.js version".
 * Repositories pin anything from 16 to 24, so sessions disagree as a matter of
 * course; said at the start, the failure arrives with its heal already known
 * instead of reading as a broken plugin.
 *
 * ps and lsof are the only shell-outs, each capped at two seconds: no other
 * source names the binary a running server was started with on macOS. Any
 * failure exits 0 with nothing printed — a missed nudge is a worse session, a
 * hook that throws is a broken start. The rule lives in `check`; everything
 * below it is the I/O around that.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const HEAL = "hooks/ensure-deps.mjs";

/** The context-mode servers in `ps -axo pid=,args=` output, with their plugin roots. */
export function servers(ps) {
  const found = [];
  for (const line of ps.split("\n")) {
    // Only node runs the server; a `tail -f` on start.mjs names the same path.
    const hit = line.match(
      /^\s*(\d+)\s+(?:\S*\/)?node\s.*?(\/\S*\/context-mode\/[^/\s]+)\/start\.mjs(?:\s|$)/,
    );
    // The root is pasted into a shell command the model is told to run, and any
    // user's process can put quotes or $() in its argv: only plain paths pass.
    if (hit && /^[\w@.+/~-]+$/.test(hit[2])) {
      found.push({ pid: Number(hit[1]), root: hit[2] });
    }
  }
  return found;
}

/** The node binary each process runs, from `lsof -a -d txt -Fpn` output. */
export function binaries(lsof) {
  const paths = new Map();
  let pid = null;
  for (const line of lsof.split("\n")) {
    if (line.startsWith("p")) {
      pid = Number(line.slice(1));
    } else if (line.startsWith("n") && pid !== null && /\/node$/.test(line)) {
      // txt lists every mapped dylib as well; only the executable is named node.
      paths.set(pid, line.slice(1));
    }
  }
  return paths;
}

/**
 * nvm and Homebrew both keep the version in the install path. A bare
 * /usr/local/bin/node says nothing, and running it to ask would cost a process
 * per server, so it stays unknown.
 */
export function major(nodePath) {
  // fnm nests the binary one level deeper, under installation/bin; a deleted
  // binary (Linux /proc/<pid>/exe after an upgrade) carries a " (deleted)" tail.
  const hit = nodePath
    .replace(/ \(deleted\)$/, "")
    .match(/\/v?(\d+)\.\d+\.\d+\/(?:installation\/)?bin\/node$/);
  return hit ? Number(hit[1]) : null;
}

/**
 * `self` is this session's node version as process.versions.node gives it;
 * `found` holds every server as `{ root, major }`. Only a server on another
 * major sharing a root can swap that root's binary, so roots are judged apart.
 */
export function check(self, found, hasHeal = () => true) {
  const [ours, minor] = self.replace(/^v/, "").split(".").map(Number);
  // From 22.5 context-mode opens its database through node:sqlite, so such a
  // session can cause the swap but never suffer it.
  if (ours > 22 || (ours === 22 && minor >= 5)) {
    return null;
  }
  const others = new Map();
  for (const { root, major: theirs } of found) {
    if (theirs === null || theirs === ours) {
      continue;
    }
    others.set(root, (others.get(root) ?? new Set()).add(theirs));
  }
  const lines = [...others].map(([root, majors]) => {
    const list = [...majors].sort((a, b) => a - b).join(" and ");
    // The plugin's own heal swaps the cached build back without a rebuild;
    // an npm rebuild is the fallback for a version that no longer ships it.
    const heal = hasHeal(root)
      ? `node -e "import('./${HEAL}').then((m) => m.ensureNativeCompat(process.cwd()))"`
      : "npm rebuild better-sqlite3";
    return `context-mode servers in other sessions run node ${list}, this session runs ${ours}, and they all share ${root}'s better_sqlite3.node, which each session's hooks overwrite with the build for its own node. A ctx_* call that fails with "compiled against a different Node.js version" is that swap: run cd "${root}" && ${heal}, then retry the call.`;
  });
  return lines.length === 0 ? null : lines.join("\n");
}

function run(command, args) {
  // spawnSync rather than execFileSync: lsof exits 1 when one pid has gone
  // between the two calls, and the other pids' lines are still good.
  return spawnSync(command, args, { encoding: "utf8", timeout: 2000, maxBuffer: 64 * 1024 * 1024 }).stdout ?? "";
}

function executables(list) {
  if (process.platform === "linux") {
    const paths = new Map();
    for (const { pid } of list) {
      try {
        paths.set(pid, readlinkSync(`/proc/${pid}/exe`));
      } catch {
        // Gone, or another user's — that server stays unknown.
      }
    }
    return paths;
  }
  return binaries(run("lsof", ["-a", "-d", "txt", "-Fpn", "-p", list.map((s) => s.pid).join(",")]));
}

function main() {
  const list = servers(run("ps", ["-axo", "pid=,args="]));
  if (list.length === 0) {
    return;
  }
  const paths = executables(list);
  const found = list.map(({ pid, root }) => ({ root, major: major(paths.get(pid) ?? "") }));
  const message = check(process.versions.node, found, (root) => existsSync(join(root, HEAL)));
  if (message !== null) {
    // Never process.exit() after this: stdout is a pipe, and an explicit exit
    // can cut the write off mid-flush.
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: message,
        },
      })}\n`,
    );
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch {
    // An uncaught throw exits nonzero and the session reports a hook error,
    // and a nudge that cannot be made is worth no more noise than silence.
  }
}
