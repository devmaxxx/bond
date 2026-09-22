#!/usr/bin/env node
/**
 * SessionStart hook — one line when the shell node is not the pinned one.
 * Every Bash call opens a fresh shell, and that shell does not carry nvm's
 * PATH: in a repository pinned to 24 the agent's `pnpm` can run under the
 * node the login shell resolves instead, where every TypeScript entry point
 * dies with ERR_UNKNOWN_FILE_EXTENSION. Said at the start that is one line;
 * met mid-session it is a failed command, and the fix has to be repeated on
 * every call, so the line names the PATH prefix rather than a one-off export.
 *
 * nvm is never invoked: it is a shell function, not a binary, and a hook that
 * shells out is a hook that can hang the start it was meant to cheapen.
 *
 * Any failure exits 0 with nothing printed — a missed nudge is a worse session,
 * a hook that throws is a broken start. The rule lives in `check`, where it is
 * unit-tested; everything below it is the I/O around that.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const PIN_FILES = [".nvmrc", ".node-version"];

/**
 * Both arguments are taken as they are written: a pin file carries a trailing
 * newline and may carry a leading v, and `process.version` always carries one.
 */
export function check(wanted, actual) {
  const pin = version(wanted);
  const running = version(actual);
  // `lts/*` and the other aliases name a version only nvm can resolve, and
  // this hook does not ask nvm — an unresolvable pin is left unmentioned.
  if (!/^\d/.test(pin)) {
    return null;
  }
  // The dot matters: 24 covers 24.16.0, 24.1 is another minor entirely.
  if (running === pin || running.startsWith(`${pin}.`)) {
    return null;
  }
  return `shell node is ${running}; .nvmrc wants ${pin}. Bash calls do not keep env, so prefix each pnpm/node command: PATH="$(nvm which ${pin} | xargs dirname):$PATH" pnpm …`;
}

function version(text) {
  return text.trim().replace(/^v/, "");
}

function pin(cwd) {
  for (const name of PIN_FILES) {
    try {
      return readFileSync(join(cwd, name), "utf8");
    } catch {
      // Not there, or not readable — the next name, then silence.
    }
  }
  return null;
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return;
  }
  const wanted = pin(payload?.cwd ?? process.cwd());
  if (wanted === null) {
    return;
  }
  const message = check(wanted, process.version);
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

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch {
    // main() returns quietly on the failures it anticipates; this is for the
    // ones it does not. An uncaught throw exits nonzero and the session reports
    // a hook error, and a nudge that cannot be made is worth no more noise than
    // silence.
    process.exit(0);
  }
}
