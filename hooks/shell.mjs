/**
 * Deciding whether a Bash command really *runs* something, as opposed to merely
 * containing its name. Shared by check-pr.mjs and check-commit.mjs, both of
 * which once matched a bare substring and blocked work that ran no such command
 * — a `python3 - <<'PY'` diagnostic that printed the words was enough.
 */

// $3 is the rest of the header line, kept because a `&& gh …` can live there.
const HEREDOC = /<<-?\s*(["']?)(\w+)\1([^\n]*)\n(?:[\s\S]*?\n)?[ \t]*\2(?![\w])/g;
const DOUBLE_QUOTED = /"(?:[^"\\]|\\[\s\S])*"/g;
const SINGLE_QUOTED = /'[^']*'/g;
const COMMENT = /(^|\s)#[^\n]*/g;
const LINE_CONTINUATION = /\\\n/g;

const SEGMENT_BREAK = /[\n;&|(){}`]+/;

/** Leading env assignments and wrappers that still leave the next word the command. */
const COMMAND_PREFIX =
  "(?:[A-Za-z_][A-Za-z0-9_]*=\\S*\\s+)*(?:(?:command|builtin|exec|nohup|time)\\s+)*(?:[\\w./~-]*\\/)?";

/**
 * Blanks out every stretch a shell would treat as data rather than code —
 * heredoc bodies, quoted strings, comments — so that command names and flags
 * are matched only where they are really command names and flags.
 *
 * Best effort by design: unbalanced quotes leave a mangled string that matches
 * nothing, and both hooks' contract is that an unreadable command blocks nobody.
 */
export function scrubShell(cmd) {
  return cmd
    .replace(HEREDOC, "<<HEREDOC$3")
    .replace(DOUBLE_QUOTED, '""')
    .replace(SINGLE_QUOTED, "''")
    .replace(COMMENT, "$1")
    .replace(LINE_CONTINUATION, " ");
}

/**
 * True when a scrubbed command runs `<words>` at a command position — the start
 * of the line, or after `;`, `&&`, `||`, `|`, a subshell or a backtick.
 *
 * `words` is a regex source for what follows the command name, e.g.
 * `"gh\\s+pr\\s+create"`. Anything matched mid-argument does not count.
 */
export function runsCommand(scrubbed, words) {
  const invocation = new RegExp(`^\\s*${COMMAND_PREFIX}(?:${words})(?![\\w-])`);
  return scrubbed
    .split(SEGMENT_BREAK)
    .some((segment) => invocation.test(segment));
}
