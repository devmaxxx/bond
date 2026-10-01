#!/usr/bin/env node
/**
 * UserPromptSubmit + PreToolUse hook — keeps live credentials out of the
 * transcript and out of git. A token pasted into a prompt is stored with the
 * session and replayed to the model on every turn; a token written into a
 * tracked file, a commit message, a PR body or a curl line ends up in history
 * that outlives a rotation.
 *
 * Prompt: blocked with the kind named, never the value; `#allow-secret` lets
 * it through. Tool call (Bash / Write / Edit / MultiEdit / NotebookEdit, and the
 * Bitbucket pull-request tools): exit 2 hands the reason back to the agent,
 * unless the value only lands in a file git will never commit (gitignored, or
 * outside any repo), or the file already held it.
 *
 * Unparseable input exits 0: a hook bug must never block unrelated work.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runsCommand, scrubShell } from "./shell.mjs";

const ESCAPE = "#allow-secret";

const BOUNDARY_BEFORE = "(?<![A-Za-z0-9_-])";
const BOUNDARY_AFTER = "(?![A-Za-z0-9_-])";
const bounded = (body) => new RegExp(`${BOUNDARY_BEFORE}${body}${BOUNDARY_AFTER}`, "g");

/**
 * `env` names the variable to suggest, or is null when there is no usual one.
 * `secret` is the part checked for placeholders; it defaults to the whole match.
 * `prepare` rewrites the text before `re` runs, for a shape the regex cannot
 * express safely. `ignore` drops a match outright. A detector that judges its
 * own value through `ignore` sets `placeholders: false` to skip the shared test.
 */
// `${PW:-default}` and `${process.env.PW}` hold colons and dots of their own,
// which would split a URI's user from its password in the wrong place. The cap
// keeps a run of unclosed `${` linear instead of quadratic.
const withoutTemplates = (text) => text.replace(/\$\{[^}\s]{0,100}\}/g, () => "$V");

const DETECTORS = [
  {
    kind: "GitHub token",
    env: "GITHUB_TOKEN",
    re: bounded("gh[pousr]_[A-Za-z0-9]{36,}"),
  },
  {
    kind: "GitHub fine-grained token",
    env: "GITHUB_TOKEN",
    re: bounded("github_pat_[A-Za-z0-9_]{40,}"),
  },
  {
    kind: "Atlassian API token",
    env: "ATLASSIAN_API_TOKEN",
    // ATATT3 is a user API token, ATCTT3 a Bitbucket repository or workspace access token.
    re: bounded("AT(?:ATT|CTT)3[A-Za-z0-9_=-]{30,}"),
  },
  {
    kind: "Figma token",
    env: "FIGMA_TOKEN",
    re: bounded("figd_[A-Za-z0-9_-]{30,}"),
  },
  {
    kind: "Slack token",
    env: "SLACK_TOKEN",
    re: bounded("(?:xox[abpre]|xapp)-[A-Za-z0-9-]{20,}"),
  },
  {
    kind: "Slack webhook URL",
    env: "SLACK_WEBHOOK_URL",
    re: bounded("https://hooks\\.slack\\.com/services/T[A-Z0-9]{8,}/B[A-Z0-9]{8,}/[A-Za-z0-9]{20,}"),
  },
  {
    kind: "Anthropic API key",
    env: "ANTHROPIC_API_KEY",
    re: bounded("sk-ant-[A-Za-z0-9_-]{30,}"),
  },
  {
    kind: "OpenAI API key",
    env: "OPENAI_API_KEY",
    re: bounded("sk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}"),
  },
  {
    kind: "AWS access key",
    env: "AWS_ACCESS_KEY_ID",
    // ASIA is the temporary key ID that STS and SSO hand out.
    re: bounded("(?:AKIA|ASIA)[0-9A-Z]{16}"),
  },
  {
    kind: "AWS secret key",
    env: "AWS_SECRET_ACCESS_KEY",
    // The secret half has no prefix to recognise, so it is read off its name.
    re: /aws_?(?:secret_?access_?key|session_?token)["']?\s*[:=]\s*["']?([A-Za-z0-9/+=]{40,})(?![A-Za-z0-9/+=])/gi,
    secret: (m) => m[1],
  },
  {
    kind: "private key",
    env: null,
    // The header alone is how docs show the format; a key has a body. A key in
    // a JSON string (a service-account file) has `\n` escapes, not newlines, and
    // an encrypted or PGP one puts `Name: value` lines between header and body.
    // Those lines are capped in number and length: unbounded, a run of markers
    // would each walk the rest of the text.
    re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----(?:\s|\\n)+(?:[A-Za-z][A-Za-z-]{0,30}: [^\n\\]{0,200}(?:\n|\\n)(?:\s|\\n)*){0,8}((?:[A-Za-z0-9+/=\s]|\\n){64,})/g,
    secret: (m) => m[1],
  },
  {
    kind: "database URI with an inline password",
    env: "DATABASE_URL",
    // The user may be empty (`redis://:password@host`), the host may be a
    // bracketed IPv6 literal, and a driver may follow the scheme
    // (`postgresql+asyncpg`).
    re: /\b(?:mongodb|postgres(?:ql)?|mysql|mariadb|rediss?|amqps?)(?:\+[a-z0-9_]+)?:\/\/([^:/\s@]*):([^@\s/]+)@(\[[^\]\s]*\]|[^\s/:?#]+)/g,
    prepare: withoutTemplates,
    secret: (m) => m[2],
    ignore: (m) => isDevCredential(m[1], m[2], m[3]),
    placeholders: false,
  },
  {
    kind: "database URI with an inline password",
    env: "DATABASE_URL",
    // libpq and JDBC URIs carry the password as a query parameter. The span
    // before it is capped so that a long run of schemes stays linear.
    re: /\b(?:postgres(?:ql)?|mysql|mariadb|sqlserver|mongodb(?:\+srv)?):\/\/[^\s'"`]{0,200}?[?&;]password=([^&\s;'"`]+)/gi,
    prepare: withoutTemplates,
    secret: (m) => m[1],
    ignore: (m) => VARIABLE.test(m[1]) || DEV_PASSWORDS.test(m[1]),
  },
  {
    kind: "Telegram bot token",
    env: "TELEGRAM_BOT_TOKEN",
    // The Bot API URL is `.../bot<token>/method`, so a letter may precede it.
    re: /(?<![\d:-])\d{8,10}:[A-Za-z0-9_-]{35}(?![A-Za-z0-9_-])/g,
    secret: (m) => m[0].split(":")[1],
  },
  {
    kind: "JWT",
    env: null,
    re: bounded("eyJ[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{20,}"),
    // Short JWTs are almost always jwt.io samples or test fixtures.
    ignore: (m) => m[0].length < 150,
  },
];

const PLACEHOLDER =
  /x{4,}|\*{3,}|\.{3,}|<[^<>]*>|\{\{|example|placeholder|redacted|dummy|fake|sample|your[_-]?|changeme|replace[_-]?me|0{8,}|1234567/i;
const VARIABLE = /^\$(?:\{\w+\}|\w+)/;

// A hand-typed stand-in announces itself up front. Deep in a long value a marker
// is chance — about one RSA-2048 key body in 200 spells one — and dismissing the
// value for it would wave a real key through.
const MARKER_WINDOW = 100;
const hasMarker = (value) => PLACEHOLDER.test(value.slice(0, MARKER_WINDOW));

/**
 * A real token is random; a hand-typed stand-in repeats a few characters, and
 * a slug such as `sk-skeleton-loader-for-the-card` is lowercase words only.
 */
function looksRandom(value) {
  const body = value.replace(/^[a-z]+[_-]/i, "");
  return (
    /[A-Z0-9]/.test(body) &&
    new Set(body).size >= Math.min(12, Math.ceil(body.length / 3))
  );
}

function isPlaceholder(value) {
  return hasMarker(value) || !looksRandom(value);
}

const DEV_HOSTS = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/;
const DEV_PASSWORDS =
  /^(?:pass(?:word)?|pwd|secret|postgres|mongo|redis|root|admin|test|user)$/i;

/**
 * Compose files and local READMEs are full of `postgres:postgres@localhost`;
 * blocking those would train everyone to reach for `#allow-secret`.
 */
function isDevCredential(user, password, host) {
  return (
    VARIABLE.test(password) ||
    hasMarker(password) ||
    password === user ||
    DEV_PASSWORDS.test(password) ||
    DEV_HOSTS.test(host)
  );
}

function scan(text) {
  if (typeof text !== "string" || text === "") {
    return [];
  }
  const found = [];
  for (const { kind, env, re, prepare, secret, ignore, placeholders = true } of DETECTORS) {
    for (const match of (prepare?.(text) ?? text).matchAll(re)) {
      const value = secret ? secret(match) : match[0];
      if (ignore?.(match) || (placeholders && isPlaceholder(value))) {
        continue;
      }
      found.push({ kind, env, value });
    }
  }
  return found;
}

const withoutValue = ({ kind, env }) => ({ kind, env });

/** Every live-looking secret in `text`, as `{ kind, env }` — never the value. */
export function findSecrets(text) {
  return scan(text).map(withoutValue);
}

/**
 * The secrets `after` holds that the text `before()` returns did not already
 * carry. An edit that keeps a committed secret as context writes nothing new
 * into git, and a tool call has no `#allow-secret` to get past a block it
 * should not have met. `before` is a function so a file is read only when
 * there is a secret to compare.
 */
function introducedSecrets(before, after) {
  const found = scan(after);
  if (found.length === 0) {
    return [];
  }
  const known = before();
  return found
    .filter(({ value }) => typeof known !== "string" || !known.includes(value))
    .map(withoutValue);
}

function kindsOf(secrets) {
  return [...new Set(secrets.map((s) => s.kind))].join(", ");
}

function envHint(secrets) {
  const names = [...new Set(secrets.map((s) => s.env))].filter(Boolean);
  return names.length > 0 ? ` (e.g. $${names.join(", $")})` : "";
}

/** `{ block: true, reason }` when the prompt must not be sent, else `{ block: false }`. */
export function checkPrompt(prompt) {
  if (typeof prompt !== "string" || prompt.includes(ESCAPE)) {
    return { block: false };
  }
  const secrets = findSecrets(prompt);
  if (secrets.length === 0) {
    return { block: false };
  }
  return {
    block: true,
    reason: `secrets-guard: this prompt contains what looks like a live ${kindsOf(secrets)}, so it was not sent — a prompt is stored with the session and replayed every turn. Put the value in an env var or a gitignored .env and refer to it by name${envHint(secrets)}. Rotate it if it was real. To send it anyway, add ${ESCAPE} to the prompt.`,
  };
}

/**
 * Targets a Bash command writes through `>`, `>>` or `tee`. Only the plain
 * forms are read; anything fancier is treated as a command line, which is the
 * stricter of the two outcomes.
 */
export function redirectTargets(cmd) {
  const targets = [];
  for (const m of cmd.matchAll(/(?<![<>&\d=-])>{1,2}\s*(["']?)([^\s"'|;&>]+)\1/g)) {
    targets.push(m[2]);
  }
  for (const m of cmd.matchAll(/\btee\b([^|;&<>\n]*)/g)) {
    for (const word of m[1].split(/\s+/)) {
      const operand = word.replace(/^["']|["']$/g, "");
      if (operand && !operand.startsWith("-")) {
        targets.push(operand);
      }
    }
  }
  return targets.filter((t) => !t.startsWith("/dev/"));
}

const hasSubstitution = (cmd) => /\$\(|`/.test(cmd);

/**
 * A lone `echo`, `printf` or `cat`, optionally piped into `tee`: the only
 * shapes whose whole effect is their redirect targets. Anything chained,
 * substituted or piped elsewhere can put the same text somewhere else, so it
 * never qualifies. Judged on the scrubbed line, where quoted text and heredoc
 * bodies cannot pose as operators.
 */
function isLoneWrite(cmd) {
  if (hasSubstitution(cmd)) {
    return false;
  }
  const line = scrubShell(cmd).replace(/\d?>&\d|\d>\s*\/dev\/null/g, "").trim();
  if (/[;&`\n]|\d>|[<>]\(/.test(line)) {
    return false;
  }
  const [head, ...pipes] = line.split("|");
  return (
    /^(?:echo|printf|cat)\b/.test(head) &&
    pipes.every((stage) => /^\s*tee\b/.test(stage))
  );
}

/** A path whose shell expansion the hook cannot predict is not one it can ask git about. */
const isLiteralPath = (path) => !/[~$`*?[{]/.test(path);

function onlyWritesIgnoredEnv(cmd, isCommittable) {
  const targets = redirectTargets(cmd);
  return (
    isLoneWrite(cmd) &&
    targets.length > 0 &&
    targets.every(
      (t) => isLiteralPath(t) && basename(t).startsWith(".env") && !isCommittable(t),
    )
  );
}

const MCP_ADD = /^\s*claude\s+mcp\s+add(?:-json)?\s/;
const PROJECT_SCOPE = /(?:^|\s)(?:--scope(?:=|\s+)|-s\s*)project\b/;

/**
 * `claude mcp add` and `add-json` are how an MCP server is handed its token;
 * the value lands in ~/.claude.json, outside any repo. Project scope writes the
 * committed .mcp.json instead, so it stays blocked.
 */
function registersMcpServer(cmd) {
  const line = scrubShell(cmd);
  return (
    MCP_ADD.test(line) &&
    !PROJECT_SCOPE.test(line) &&
    !/[;&|`\n]/.test(line) &&
    !hasSubstitution(cmd)
  );
}

const MESSAGE_FILE_FLAG =
  /(?:^|\s)(?:-F|--file|--body-file)[=\s]+(?:"([^"]+)"|'([^']+)'|([^\s"']+))/g;

/** Files `git` or `gh` publish verbatim: `commit -F msg`, `pr create --body-file body`. */
function messageFiles(cmd) {
  if (!runsCommand(scrubShell(cmd), "git|gh")) {
    return [];
  }
  return [...cmd.matchAll(MESSAGE_FILE_FLAG)]
    .map((m) => m[1] ?? m[2] ?? m[3])
    .filter((path) => path !== "-" && !/[$`]/.test(path));
}

function checkCommand(cmd, isCommittable, readText) {
  for (const file of messageFiles(cmd)) {
    const text = readText(file);
    const inFile = text === null ? [] : findSecrets(text);
    if (inFile.length > 0) {
      return `secrets-guard: ${file}, which this command sends as a commit message or PR body, carries a literal ${kindsOf(inFile)}. Take it out of the file and reference it as a variable instead${envHint(inFile) || " ($NAME)"}.`;
    }
  }
  const secrets = findSecrets(cmd);
  if (secrets.length === 0 || registersMcpServer(cmd) || onlyWritesIgnoredEnv(cmd, isCommittable)) {
    return null;
  }
  return `secrets-guard: this command line carries a literal ${kindsOf(secrets)}. Commit messages, PR bodies and curl lines end up in history and logs. Reference it as a variable instead${envHint(secrets) || " ($NAME)"}, loaded from the environment or a gitignored .env.`;
}

/**
 * What a tool call writes into a file, by tool, as `{ before, after }` pairs:
 * the new text and a function returning the text it replaces, if it is known.
 */
const FILE_CHANGES = {
  Write: (input, readText) => [{ before: () => readText(input.file_path), after: input.content }],
  Edit: (input) => [{ before: () => input.old_string, after: input.new_string }],
  MultiEdit: (input) =>
    (input.edits ?? []).map((e) => ({ before: () => e?.old_string, after: e?.new_string })),
  NotebookEdit: (input, readText) => [
    { before: () => readText(input.notebook_path), after: input.new_source },
  ],
};

/** Texts a tool call publishes, by tool: Bonliva opens its PRs through Bitbucket. */
const pullRequestText = (input) => [input.title, input.description];
const PUBLISHED_TEXT = {
  "mcp__bond-bitbucket__create_pull_request": pullRequestText,
  "mcp__bond-bitbucket__create_draft_pull_request": pullRequestText,
};

/**
 * Reason to block a tool call, or null. `isCommittable(path)` answers whether
 * git could pick the file up, and `readText(path)` returns a file's text or
 * null — injected so the decision is testable without a repo or a disk.
 * Only a secret the call introduces counts: one the file already holds does not.
 */
export function checkTool(
  { tool_name: tool, tool_input: input },
  isCommittable,
  readText = () => null,
) {
  if (!input || typeof input !== "object") {
    return null;
  }
  if (tool === "Bash") {
    return checkCommand(input.command ?? "", isCommittable, readText);
  }
  if (Object.hasOwn(PUBLISHED_TEXT, tool)) {
    const secrets = PUBLISHED_TEXT[tool](input).flatMap(findSecrets);
    return secrets.length === 0
      ? null
      : `secrets-guard: this pull request's title or description carries a literal ${kindsOf(secrets)}, and it would be published. Reference it as a variable instead${envHint(secrets) || " ($NAME)"}.`;
  }
  if (!Object.hasOwn(FILE_CHANGES, tool)) {
    return null;
  }
  const secrets = FILE_CHANGES[tool](input, readText).flatMap(({ before, after }) =>
    introducedSecrets(before, after),
  );
  const path = input.file_path ?? input.notebook_path;
  if (secrets.length === 0 || !path || !isCommittable(path)) {
    return null;
  }
  return `secrets-guard: ${path} is a file git can commit, and this edit writes a literal ${kindsOf(secrets)} into it. Put the value in a gitignored .env and read it by name${envHint(secrets)}.`;
}

function nearestExistingDir(path) {
  let dir = dirname(path);
  while (!existsSync(dir) && dirname(dir) !== dir) {
    dir = dirname(dir);
  }
  return dir;
}

/**
 * `git check-ignore` exits 0 for ignored and 1 for committable. A tracked file
 * is never reported ignored, so a committed .env still counts as committable.
 * Exit 128 is any fatal error: only "not a git repository" puts the file out of
 * git's reach, so every other 128 (a dubious-ownership repo, say) answers
 * committable rather than letting the write through. A missing git or a
 * timeout answers false: that is no reason to block an edit.
 */
function gitCommittable(cwd) {
  return (path) => {
    const abs = isAbsolute(path) ? path : resolve(cwd, path);
    try {
      // check-ignore refuses a path that crosses a symlink, so ask about the real one.
      const nearest = nearestExistingDir(abs);
      const dir = realpathSync(nearest);
      execFileSync("git", ["-C", dir, "check-ignore", "-q", "--", join(dir, relative(nearest, abs))], {
        encoding: "utf8",
        env: { ...process.env, LC_ALL: "C" },
        stdio: ["ignore", "ignore", "pipe"],
        timeout: 2000,
      });
      return false;
    } catch (err) {
      return (
        err?.status === 1 ||
        (err?.status === 128 && !/not a git repository/i.test(String(err.stderr)))
      );
    }
  };
}

const MAX_FILE_BYTES = 1_000_000;

function readFrom(cwd) {
  return (path) => {
    try {
      const abs = resolve(cwd, path);
      const stat = statSync(abs);
      // A device such as /dev/zero reports size 0 and never ends.
      return stat.isFile() && stat.size <= MAX_FILE_BYTES ? readFileSync(abs, "utf8") : null;
    } catch {
      return null;
    }
  };
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return;
  }
  if (payload?.hook_event_name === "UserPromptSubmit") {
    const { block, reason } = checkPrompt(payload.prompt);
    if (block) {
      // Without suppressOriginalPrompt Claude Code appends `Original prompt:
      // <text>` to the block message, which would print the secret back.
      const output = {
        decision: "block",
        reason,
        hookSpecificOutput: { hookEventName: "UserPromptSubmit", suppressOriginalPrompt: true },
      };
      process.stdout.write(`${JSON.stringify(output)}\n`);
    }
    return;
  }
  const cwd = payload?.cwd ?? process.cwd();
  const reason = checkTool(payload ?? {}, gitCommittable(cwd), readFrom(cwd));
  if (reason) {
    process.stderr.write(`${reason}\n`);
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
    // Fail open: an unexpected throw must not turn into a blocked prompt.
  }
}
