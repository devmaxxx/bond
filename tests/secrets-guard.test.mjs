import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkPrompt,
  checkTool,
  findSecrets,
  redirectTargets,
} from "../hooks/secrets-guard.mjs";

const HOOK = fileURLToPath(new URL("../hooks/secrets-guard.mjs", import.meta.url));
const HOOKS_DIR = dirname(HOOK);
const HOOKS_JSON = join(HOOKS_DIR, "hooks.json");

// Every fake is assembled at runtime from split prefixes and pseudo-random
// bodies, so this file holds nothing secret-shaped for push protection to flag.
// The generator is seeded: a truly random body now and then spells "fake" or
// "xxxx" and is rightly read as a placeholder, which would make the suite flaky.
const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const UPPER_NUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
let seed = 0x5eed;
function next() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rand(length, alphabet = ALNUM) {
  return Array.from({ length }, () => alphabet[Math.floor(next() * alphabet.length)]).join("");
}
const p = (...parts) => parts.join("");

const fake = {
  github: () => p("gh", "p_", rand(36)),
  githubOauth: () => p("gh", "o_", rand(36)),
  githubServer: () => p("gh", "s_", rand(36)),
  githubPat: () => p("github", "_pat_", rand(22), "_", rand(59)),
  atlassian: () => p("ATA", "TT3", rand(180)),
  atlassianAccess: () => p("ATC", "TT3", rand(180)),
  figma: () => p("fig", "d_", rand(40)),
  slack: () => p("xo", "xb-", rand(12, "0123456789"), "-", rand(24)),
  slackApp: () => p("xa", "pp-1-", rand(11, UPPER_NUM), "-", rand(13, "0123456789"), "-", rand(64, "0123456789abcdef")),
  slackRefresh: () => p("xo", "xe-1-", rand(40)),
  slackWebhook: () => p("https://hooks", ".slack.com/services/T", rand(10, UPPER_NUM), "/B", rand(10, UPPER_NUM), "/", rand(24)),
  anthropic: () => p("sk", "-ant-api03-", rand(90)),
  openai: () => p("sk", "-proj-", rand(48)),
  aws: () => p("AK", "IA", rand(16, UPPER_NUM)),
  awsTemporary: () => p("AS", "IA", rand(16, UPPER_NUM)),
  awsSecret: () => p("aws_secret", "_access_key = ", rand(40, `${ALNUM}/+`)),
  awsSessionToken: () => p("AWS_SESSION", "_TOKEN=", rand(300, `${ALNUM}/+`)),
  pem: () =>
    p("-----BEGIN ", "RSA PRIVATE", " KEY-----\n", rand(64), "\n", rand(64), "\n-----END RSA PRIVATE KEY-----"),
  mongo: () => p("mongodb", "+srv://app:", rand(20), "@cluster0.abcde.mongodb.net/db"),
  postgres: () => p("postgres", "ql://svc:", rand(18), "@db.internal.example.org:5432/app"),
  redis: () => p("redis", "://default:", rand(24), "@cache.prod.internal:6379"),
  redisPasswordOnly: () => p("redis", "://:", rand(24), "@cache.prod.internal:6379"),
  mysql: () => p("mysql", "://app:", rand(18), "@db.internal.example.org:3306/app"),
  amqp: () => p("amqp", "s://svc:", rand(18), "@rabbit.prod.internal:5671"),
  postgresDriver: () => p("postgresql", "+asyncpg://prefect:", rand(18), "@postgres.prod.internal:5432/prefect"),
  postgresQuery: () => p("postgres", "ql://db.prod.internal/app?user=app&password=", rand(18)),
  jdbc: () => p("jdbc:postgres", "ql://db.prod.internal:5432/app?user=app&password=", rand(18)),
  telegram: () => p(rand(10, "123456789"), ":", "AA", rand(33)),
  jwt: () => p("ey", "J", rand(40), ".ey", "J", rand(120), ".", rand(43)),
};

const KIND = {
  github: "GitHub token",
  githubOauth: "GitHub token",
  githubServer: "GitHub token",
  githubPat: "GitHub fine-grained token",
  atlassian: "Atlassian API token",
  atlassianAccess: "Atlassian API token",
  figma: "Figma token",
  slack: "Slack token",
  slackApp: "Slack token",
  slackRefresh: "Slack token",
  slackWebhook: "Slack webhook URL",
  anthropic: "Anthropic API key",
  openai: "OpenAI API key",
  aws: "AWS access key",
  awsTemporary: "AWS access key",
  awsSecret: "AWS secret key",
  awsSessionToken: "AWS secret key",
  pem: "private key",
  mongo: "database URI with an inline password",
  postgres: "database URI with an inline password",
  redis: "database URI with an inline password",
  redisPasswordOnly: "database URI with an inline password",
  mysql: "database URI with an inline password",
  amqp: "database URI with an inline password",
  postgresDriver: "database URI with an inline password",
  postgresQuery: "database URI with an inline password",
  jdbc: "database URI with an inline password",
  telegram: "Telegram bot token",
  jwt: "JWT",
};

const committable = () => true;
const ignored = () => false;
const kinds = (text) => findSecrets(text).map((s) => s.kind);

const scratch = [];
after(() => {
  for (const dir of scratch) {
    rmSync(dir, { recursive: true, force: true });
  }
});
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "bond-secrets-"));
  scratch.push(dir);
  return dir;
}

describe("recognising live secrets", () => {
  for (const [name, make] of Object.entries(fake)) {
    it(`finds a ${KIND[name]} (${name}) in running text`, () => {
      assert.deepEqual(kinds(`here you go: ${make()} thanks`), [KIND[name]]);
    });
  }
});

describe("the shapes a secret takes outside a plain line of text", () => {
  it("finds a Telegram token inside the Bot API URL", () => {
    assert.deepEqual(kinds(`https://api.telegram.org/bot${fake.telegram()}/getMe`), [
      "Telegram bot token",
    ]);
  });

  it("finds a private key pasted into a JSON string, newlines escaped as \\n", () => {
    const json = JSON.stringify({ private_key: fake.pem(), client_email: "svc@example.org" });
    assert.deepEqual(kinds(json), ["private key"]);
  });

  it("finds a private key on one line of a shell or .env assignment", () => {
    assert.deepEqual(kinds(`KEY="${fake.pem().replaceAll("\n", "\\n")}"`), ["private key"]);
  });

  it("finds a passphrase-protected PEM key, whose header lines sit between the marker and the body", () => {
    const encrypted = p(
      "-----BEGIN ", "RSA PRIVATE", " KEY-----\nProc-Type: 4,ENCRYPTED\nDEK-Info: AES-256-CBC,",
      rand(32, "0123456789ABCDEF"), "\n\n", rand(64), "\n", rand(64), "\n-----END RSA PRIVATE KEY-----",
    );
    assert.deepEqual(kinds(encrypted), ["private key"]);
  });

  it("finds a PGP private key block", () => {
    const pgp = p(
      "-----BEGIN PGP ", "PRIVATE KEY", " BLOCK-----\nVersion: GnuPG v2\n\n",
      rand(64), "\n", rand(64), "\n-----END PGP PRIVATE KEY BLOCK-----",
    );
    assert.deepEqual(kinds(pgp), ["private key"]);
  });

  it("finds the whole export block IAM Identity Center prints", () => {
    const block = [
      `export ${fake.awsTemporary().replace(/^/, "AWS_ACCESS_KEY_ID=")}`,
      `export ${p("AWS_SECRET", "_ACCESS_KEY=", rand(40, `${ALNUM}/+`))}`,
      `export ${fake.awsSessionToken()}`,
    ].join("\n");
    assert.deepEqual(kinds(block), ["AWS access key", "AWS secret key", "AWS secret key"]);
  });

  it("finds an AWS secret key in a JSON credentials file", () => {
    const json = JSON.stringify({ aws_secret_access_key: rand(40, `${ALNUM}/+`) });
    assert.deepEqual(kinds(json), ["AWS secret key"]);
  });

  it("finds a URI to a bracketed IPv6 host that is not loopback", () => {
    assert.deepEqual(kinds(p("redis", "://default:", rand(20), "@[fd00::1]:6379")), [
      "database URI with an inline password",
    ]);
  });
});

describe("letting placeholders and references through", () => {
  const benign = {
    "an x-ed out GitHub token": p("gh", "p_", "x".repeat(36)),
    "a token marked as an example": p("sk", "-ant-", "example", rand(30)),
    "a low-variety stand-in": p("gh", "p_", "abc".repeat(12)),
    "an AWS doc key with EXAMPLE": p("AK", "IA", "IOSFODNN7EXAMPLE"),
    "a PEM header with no body": p("-----BEGIN ", "PRIVATE", " KEY-----\n...\n-----END PRIVATE KEY-----"),
    "a URI whose password is a variable": "postgres://app:${PG_PASSWORD}@db.prod:5432/app",
    "a URI whose password is a variable with a default": "postgres://app:${PG_PASSWORD:-changeit}@db.prod:5432/app",
    "a URI built from process.env": "postgres://app:${process.env.PG_PASSWORD}@db.prod:5432/app",
    "a URI whose user and password are both variables": "postgres://${PG_USER}:${PG_PASSWORD}@db.prod:5432/app",
    "a URI with the user as password": "postgres://postgres:postgres@db:5432/app",
    "a URI to localhost": p("mongodb", "://root:", rand(16), "@localhost:27017"),
    "a URI to the IPv6 loopback": p("redis", "://default:", rand(16), "@[::1]:6379"),
    "a URI with a starred password": "redis://default:****@cache.prod:6379",
    "a URI with <password>": "mongodb+srv://app:<password>@cluster0.mongodb.net",
    "a URI with no password": "postgres://app@db.prod:5432/app",
    "a short JWT sample": p("ey", "J", rand(12), ".ey", "J", rand(12), ".", rand(22)),
    "a timestamp-ish ratio": "12345678:not-a-token",
    "a word that ends in sk-": "the task-runner-for-everything-in-the-repository-and-more ran",
    "a prose mention of the prefixes": "GitHub tokens start with ghp_ and Slack ones with xoxb-",
    "the AWS doc secret key": p("aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCY", "EXAMPLEKEY"),
    "an AWS secret key read from a variable": "export AWS_SECRET_ACCESS_KEY=$(op read op://vault/aws/secret)",
    "an AWS secret key from a CI secret": "AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}",
    "the Slack doc webhook": p("https://hooks", ".slack.com/services/T", "0".repeat(9), "/B", "0".repeat(9), "/", "X".repeat(24)),
    "a PGP public key block": p("-----BEGIN PGP ", "PUBLIC KEY", " BLOCK-----\n\n", rand(64), "\n-----END PGP PUBLIC KEY BLOCK-----"),
    "a RabbitMQ guest URI": "amqp://guest:guest@rabbitmq:5672",
    "a query password that is a variable": "postgres://db.prod/app?user=app&password=${DB_PASSWORD}",
    "a query password that is a dev default": "postgres://localhost/app?user=app&password=postgres",
  };
  for (const [name, text] of Object.entries(benign)) {
    it(`ignores ${name}`, () => {
      assert.deepEqual(findSecrets(text), []);
    });
  }

  // The remainder is random, so only the marker itself can mark the stand-in.
  const MARKERS = [
    "xxxx", "example", "placeholder", "redacted", "dummy", "fake", "sample",
    "your", "changeme", "replaceme", "00000000", "1234567",
  ];
  for (const marker of MARKERS) {
    it(`ignores a token whose body carries "${marker}"`, () => {
      assert.deepEqual(findSecrets(p("gh", "p_", marker, rand(36 - marker.length))), []);
    });
  }

  it("ignores a lowercase slug that starts like an OpenAI key", () => {
    assert.deepEqual(findSecrets("class sk-skeleton-loader-for-the-dashboard-card-component"), []);
  });
});

describe("a long value is judged by its start, and in linear time", () => {
  const pem = (body) =>
    p("-----BEGIN ", "RSA PRIVATE", " KEY-----\n", body, "\n-----END RSA PRIVATE KEY-----");

  it("still finds a key whose body spells a marker by chance, deep inside", () => {
    assert.deepEqual(kinds(pem(p(rand(200), "xxxx", rand(900)))), ["private key"]);
  });

  it("still reads a key whose body opens with a marker as a stand-in", () => {
    assert.deepEqual(findSecrets(pem(p("example", rand(70), "\n", rand(64)))), []);
  });

  // A prompt is scanned before it is sent; a pathological one must not outrun the hook's timeout.
  const within = (ms, text) => {
    const started = Date.now();
    findSecrets(text);
    assert.ok(Date.now() - started < ms, `took ${Date.now() - started} ms`);
  };

  it("scans a password that is a long run of angle brackets in linear time", () => {
    within(2000, p("redis", "://u:", "<".repeat(200_000), "@h"));
  });

  it("scans a long run of unclosed ${ in linear time", () => {
    within(2000, p("postgres", "://a:", "${".repeat(80_000), "@h"));
  });

  it("scans a long run of header-looking lines after a key marker in linear time", () => {
    within(2000, p("-----BEGIN ", "PRIVATE", " KEY-----\n", "A-b: c\n".repeat(60_000)));
  });

  it("scans a long unterminated header line after a key marker in linear time", () => {
    within(2000, p("-----BEGIN ", "PRIVATE", " KEY-----\nA: ", "b".repeat(300_000)));
  });

  it("scans a one-line run of JSON-escaped key markers in linear time", () => {
    within(2000, p("-----BEGIN ", "PRIVATE", " KEY-----\\nA: b").repeat(20_000));
  });

  it("scans a long run of schemes that never reach a password in linear time", () => {
    within(2000, "postgres://x?".repeat(20_000));
  });
});

describe("UserPromptSubmit", () => {
  it("blocks a prompt with a token, naming the kind but never the value", () => {
    const token = fake.github();
    const out = checkPrompt(`please use ${token} for the API`);
    assert.equal(out.block, true);
    assert.match(out.reason, /GitHub token/);
    assert.match(out.reason, /env var/);
    assert.match(out.reason, /\$GITHUB_TOKEN/);
    assert.ok(!out.reason.includes(token));
  });

  it("names every kind present", () => {
    const out = checkPrompt(`${fake.figma()} and ${fake.aws()}`);
    assert.match(out.reason, /Figma token/);
    assert.match(out.reason, /AWS access key/);
  });

  it("lets the prompt through with #allow-secret", () => {
    assert.equal(checkPrompt(`${fake.github()} #allow-secret`).block, false);
  });

  it("lets an ordinary prompt through", () => {
    assert.equal(checkPrompt("read the token from $GITHUB_TOKEN and open a PR").block, false);
  });
});

describe("PreToolUse on Write / Edit / MultiEdit", () => {
  it("blocks a literal secret written into a committable file", () => {
    const reason = checkTool(
      { tool_name: "Write", tool_input: { file_path: "src/config.ts", content: `const t = "${fake.slack()}";` } },
      committable,
    );
    assert.match(reason, /Slack token/);
    assert.match(reason, /src\/config\.ts/);
  });

  it("allows the same write into a gitignored .env", () => {
    const reason = checkTool(
      { tool_name: "Write", tool_input: { file_path: ".env.local", content: `SLACK_TOKEN=${fake.slack()}\n` } },
      ignored,
    );
    assert.equal(reason, null);
  });

  it("blocks an Edit whose new_string carries a secret", () => {
    const reason = checkTool(
      { tool_name: "Edit", tool_input: { file_path: "app.py", old_string: "x", new_string: `KEY = "${fake.openai()}"` } },
      committable,
    );
    assert.match(reason, /OpenAI API key/);
  });

  it("blocks a MultiEdit when any edit carries a secret", () => {
    const reason = checkTool(
      {
        tool_name: "MultiEdit",
        tool_input: {
          file_path: "a.ts",
          edits: [{ new_string: "fine" }, { new_string: fake.anthropic() }],
        },
      },
      committable,
    );
    assert.match(reason, /Anthropic API key/);
  });

  it("blocks a NotebookEdit whose new_source carries a secret", () => {
    const input = { notebook_path: "analysis.ipynb", new_source: `token = "${fake.github()}"` };
    assert.match(checkTool({ tool_name: "NotebookEdit", tool_input: input }, committable), /GitHub token/);
    assert.equal(checkTool({ tool_name: "NotebookEdit", tool_input: input }, ignored), null);
  });

  describe("a secret the file already holds", () => {
    const token = fake.github();
    const edit = (tool_input, tool_name = "Edit", readText) =>
      checkTool({ tool_name, tool_input: { file_path: "app.env.template", ...tool_input } }, committable, readText);

    it("lets an Edit through that keeps it as context", () => {
      const reason = edit({ old_string: `TOKEN=${token}\nTTL=1`, new_string: `TOKEN=${token}\nTTL=2` });
      assert.equal(reason, null);
    });

    it("blocks an Edit that adds a second one beside it", () => {
      const reason = edit({ old_string: `TOKEN=${token}`, new_string: `TOKEN=${token}\nOTHER=${fake.figma()}` });
      assert.match(reason, /Figma token/);
    });

    it("blocks an Edit that swaps it for another", () => {
      const reason = edit({ old_string: `TOKEN=${token}`, new_string: `TOKEN=${fake.github()}` });
      assert.match(reason, /GitHub token/);
    });

    it("judges each edit of a MultiEdit against its own old_string", () => {
      const edits = [
        { old_string: `TOKEN=${token}\nA=1`, new_string: `TOKEN=${token}\nA=2` },
        { old_string: "B=1", new_string: `B=${fake.figma()}` },
      ];
      assert.match(edit({ edits }, "MultiEdit"), /Figma token/);
      assert.equal(edit({ edits: edits.slice(0, 1) }, "MultiEdit"), null);
    });

    it("lets a Write through when the file on disk already carries it", () => {
      const reason = edit({ content: `TOKEN=${token}\nTTL=2\n` }, "Write", () => `TOKEN=${token}\nTTL=1\n`);
      assert.equal(reason, null);
    });

    it("blocks a Write of one the file on disk does not carry", () => {
      const reason = edit({ content: `TOKEN=${token}\n` }, "Write", () => "TTL=1\n");
      assert.match(reason, /GitHub token/);
      assert.match(edit({ content: `TOKEN=${token}\n` }, "Write"), /GitHub token/);
    });
  });

  it("allows a write that only references the variable", () => {
    const reason = checkTool(
      { tool_name: "Write", tool_input: { file_path: "a.ts", content: "const t = process.env.GITHUB_TOKEN;" } },
      committable,
    );
    assert.equal(reason, null);
  });

  it("ignores tools it does not guard", () => {
    assert.equal(checkTool({ tool_name: "Read", tool_input: { file_path: fake.github() } }, committable), null);
  });

  it("does not mistake an Object.prototype name for a guarded tool", () => {
    assert.equal(checkTool({ tool_name: "toString", tool_input: { content: fake.github() } }, committable), null);
  });
});

describe("PreToolUse on a pull request opened through Bitbucket", () => {
  const open = (tool, input) => checkTool({ tool_name: `mcp__bond-bitbucket__${tool}`, tool_input: input }, committable);

  it("blocks a secret in the description", () => {
    assert.match(
      open("create_pull_request", { title: "feat: x", description: `key ${fake.atlassian()}` }),
      /Atlassian API token/,
    );
  });

  it("blocks a secret in the title of a draft", () => {
    assert.match(open("create_draft_pull_request", { title: fake.github(), description: "" }), /GitHub token/);
  });

  it("lets a clean pull request through", () => {
    assert.equal(open("create_pull_request", { title: "feat: x", description: "## Summary" }), null);
  });
});

describe("PreToolUse on Bash", () => {
  const bash = (command, isCommittable = committable, readText) =>
    checkTool({ tool_name: "Bash", tool_input: { command } }, isCommittable, readText);

  it("blocks a token in a git commit message", () => {
    assert.match(bash(`git commit -m "fix: rotate ${fake.github()}"`), /GitHub token/);
  });

  it("blocks a token in a gh PR body", () => {
    assert.match(bash(`gh pr create --title x --body "key ${fake.atlassian()}"`), /Atlassian API token/);
  });

  it("blocks a token on a curl line", () => {
    const line = `curl -H "Authorization: Bearer ${fake.figma()}" https://api.figma.com/v1/me`;
    assert.match(bash(line), /Figma token/);
  });

  it("allows a curl line that uses a variable", () => {
    assert.equal(bash('curl -H "Authorization: Bearer $FIGMA_TOKEN" https://api.figma.com/v1/me'), null);
  });

  it("blocks a secret on a command line that redirects nothing, whatever git says", () => {
    assert.match(bash(`echo ${fake.github()}`, ignored), /GitHub token/);
  });

  it("blocks writing a secret into a non-.env file even when it is ignored", () => {
    assert.match(bash(`echo ${fake.github()} > notes.txt`, ignored), /GitHub token/);
  });

  describe("a secret appended to .env", () => {
    const line = (shape) => shape(fake.github());

    const WRITES = {
      "an echo appended": (t) => `echo "GITHUB_TOKEN=${t}" >> .env`,
      "a printf into .env.local": (t) => `printf 'GITHUB_TOKEN=%s\\n' ${t} > .env.local`,
      "a tee -a": (t) => `echo "GITHUB_TOKEN=${t}" | tee -a .env`,
      "an echo with its stderr redirected": (t) => `echo "GITHUB_TOKEN=${t}" >> .env 2>&1`,
      "a heredoc whose text mentions gh, curl and an arrow": (t) =>
        `cat >> .env <<'EOF'\nGITHUB_TOKEN=${t}\n# gh auth login, or curl the API -> paste above\nEOF`,
      "a quoted mention of gh": (t) => `echo "run gh auth login; GITHUB_TOKEN=${t}" >> .env`,
    };
    for (const [name, shape] of Object.entries(WRITES)) {
      it(`allows ${name} when .env is gitignored`, () => {
        assert.equal(bash(line(shape), ignored), null);
      });
      it(`blocks ${name} when .env is committable`, () => {
        assert.match(bash(line(shape), committable), /GitHub token/);
      });
    }

    // Each of these puts the same text somewhere git or the network can see,
    // or aims the write at a file other than the one git was asked about.
    const ESCAPES = {
      "tee with a second operand": (t) => `echo "GITHUB_TOKEN=${t}" | tee .env public.txt`,
      "tee with the ignored file second": (t) => `echo "GITHUB_TOKEN=${t}" | tee public.txt .env`,
      "a copy chained after the write": (t) => `echo "GITHUB_TOKEN=${t}" >> .env && cp .env public.txt`,
      "a commit chained after the write": (t) => `echo "GITHUB_TOKEN=${t}" >> .env; git commit -am x`,
      "a cd first, so the target is not the one git was asked about": (t) =>
        `cd ../other && echo "GITHUB_TOKEN=${t}" >> .env`,
      "a home-relative target": (t) => `echo "GITHUB_TOKEN=${t}" >> ~/.env`,
      "a target named by a variable": (t) => `echo "GITHUB_TOKEN=${t}" >> $HOME/.env`,
      "a curl line": (t) => `curl -H "Authorization: Bearer ${t}" https://api.example.org/me > .env`,
      "a curl called by its full path": (t) => `/usr/bin/curl -H "Authorization: Bearer ${t}" https://api.example.org/me > .env`,
      "an HTTPie call": (t) => `https POST api.example.org token=${t} > .env`,
      "a sed -i": (t) => `sed -i "s/OLD/${t}/" .env`,
      "a command substitution": (t) => `echo "GITHUB_TOKEN=${t} $(curl https://x.test)" >> .env`,
      "a second line that curls": (t) => `echo "GITHUB_TOKEN=${t}" >> .env\ncurl -d x https://x.test`,
    };
    for (const [name, shape] of Object.entries(ESCAPES)) {
      it(`blocks ${name}, whatever git says about .env`, () => {
        assert.match(bash(line(shape), ignored), /GitHub token/);
      });
    }
  });

  describe("registering an MCP server", () => {
    // setup-plugin hands each server its token through `claude mcp add-json`;
    // local and user scope keep it in ~/.claude.json, project scope in the committed .mcp.json.
    const json = () => `'{"type":"stdio","env":{"TOKEN":"${fake.atlassian()}"}}'`;

    for (const tail of ["--scope local", "--scope user", "-s user", ""]) {
      it(`allows add-json ${tail ? `with ${tail}` : "with the default scope"}`, () => {
        assert.equal(bash(`claude mcp add-json bitbucket ${json()} ${tail}`), null);
      });
    }

    it("allows add with -e", () => {
      assert.equal(bash(`claude mcp add bitbucket -e TOKEN=${fake.atlassian()} --scope local -- npx bitbucket-mcp`), null);
    });

    for (const scope of ["--scope project", "--scope=project", "-s project"]) {
      it(`blocks ${scope}`, () => {
        assert.match(bash(`claude mcp add-json bitbucket ${json()} ${scope}`), /Atlassian API token/);
      });
    }

    it("blocks a registration chained to another command", () => {
      assert.match(bash(`claude mcp add-json bitbucket ${json()} --scope local && git commit -am x`), /Atlassian API token/);
    });

    it("blocks another claude subcommand that carries a token", () => {
      assert.match(bash(`claude mcp list ${fake.github()}`), /GitHub token/);
    });
  });

  describe("a message sent from a file", () => {
    const files = (entries) => {
      const map = new Map(Object.entries(entries));
      return (path) => map.get(path) ?? null;
    };

    it("reads the file `git commit -F` sends", () => {
      const reason = bash("git commit -F msg.txt", committable, files({ "msg.txt": `fix: ${fake.github()}` }));
      assert.match(reason, /msg\.txt/);
      assert.match(reason, /GitHub token/);
    });

    for (const command of [
      "gh pr create --title x --body-file body.md",
      "gh pr create --title x --body-file=body.md",
      "gh pr create --title x -F body.md",
      "gh issue comment 4 --body-file ./body.md",
      "git -C sub commit -F body.md",
    ]) {
      it(`reads the file named in \`${command}\``, () => {
        const path = command.includes("./body.md") ? "./body.md" : "body.md";
        assert.match(bash(command, committable, files({ [path]: fake.atlassian() })), /Atlassian API token/);
      });
    }

    it("reads a quoted path", () => {
      assert.match(bash("gh pr create -F 'my body.md'", committable, files({ "my body.md": fake.github() })), /GitHub token/);
    });

    it("lets a clean file, a missing file and stdin through", () => {
      assert.equal(bash("git commit -F msg.txt", committable, files({ "msg.txt": "fix: it" })), null);
      assert.equal(bash("git commit -F msg.txt", committable, files({})), null);
      assert.equal(bash("git commit -F -", committable, files({ "-": fake.github() })), null);
    });

    it("leaves -F alone on a command that does not publish it", () => {
      assert.equal(bash("curl -F file=@msg.txt https://x.test", committable, files({ "file=@msg.txt": fake.github() })), null);
      assert.equal(bash("echo 'git commit -F msg.txt'", committable, files({ "msg.txt": fake.github() })), null);
    });
  });
});

describe("redirectTargets", () => {
  it("reads >, >> and tee targets and skips /dev and fd duplication", () => {
    assert.deepEqual(
      redirectTargets('echo a > out.txt 2>&1; echo b >> ".env" ; echo c | tee -a log.txt; echo d > /dev/null'),
      ["out.txt", ".env", "log.txt"],
    );
  });

  it("reads every operand of tee, so a file after the first is not missed", () => {
    assert.deepEqual(redirectTargets("echo a | tee -a one.txt two.txt"), ["one.txt", "two.txt"]);
  });

  it("does not read an arrow in text as a redirect", () => {
    assert.deepEqual(redirectTargets("echo 'a -> b' >> .env"), [".env"]);
  });
});

function runHook(payload, hook = HOOK) {
  return spawnSync(process.execPath, [hook], { input: JSON.stringify(payload), encoding: "utf8" });
}

function repo() {
  const dir = tempDir();
  execFileSync("git", ["init", "-q"], { cwd: dir });
  writeFileSync(join(dir, ".gitignore"), ".env*\n");
  return dir;
}

const write = (cwd, file_path, content) =>
  runHook({ hook_event_name: "PreToolUse", cwd, tool_name: "Write", tool_input: { file_path, content } });

describe("the hook end to end", () => {
  it("answers a secret-bearing prompt with decision: block", () => {
    const out = runHook({ hook_event_name: "UserPromptSubmit", prompt: `token ${fake.github()}` });
    assert.equal(out.status, 0);
    const json = JSON.parse(out.stdout);
    assert.equal(json.decision, "block");
    assert.match(json.reason, /GitHub token/);
    // Without the flag Claude Code appends "Original prompt: <text>" to the
    // block message, which would print the secret back.
    assert.deepEqual(json.hookSpecificOutput, {
      hookEventName: "UserPromptSubmit",
      suppressOriginalPrompt: true,
    });
  });

  it("prints nothing for a clean prompt", () => {
    const out = runHook({ hook_event_name: "UserPromptSubmit", prompt: "hello" });
    assert.equal(out.status, 0);
    assert.equal(out.stdout, "");
  });

  it("exits 2 for a secret written into a tracked-path file in a real repo", () => {
    const cwd = repo();
    const out = write(cwd, join(cwd, "src", "config.ts"), fake.aws());
    assert.equal(out.status, 2);
    assert.match(out.stderr, /AWS access key/);
  });

  it("exits 0 for the same secret written into the repo's gitignored .env", () => {
    const cwd = repo();
    assert.equal(write(cwd, join(cwd, ".env"), `AWS_ACCESS_KEY_ID=${fake.aws()}`).status, 0);
  });

  it("exits 2 for a write reached through a symlink into the repo, which git refuses to check", () => {
    const cwd = repo();
    mkdirSync(join(cwd, "real"));
    symlinkSync(join(cwd, "real"), join(cwd, "link"));
    assert.equal(write(cwd, join(cwd, "link", "config.ts"), fake.aws()).status, 2);
  });

  it("exits 0 for a write that keeps a secret the file on disk already holds, and 2 for one that adds another", () => {
    const cwd = repo();
    const token = fake.github();
    mkdirSync(join(cwd, "src"));
    writeFileSync(join(cwd, "src", "config.ts"), `const t = "${token}";\n`);
    const relative = join("src", "config.ts");
    assert.equal(write(cwd, relative, `const t = "${token}";\nconst ttl = 2;\n`).status, 0);
    const blocked = write(cwd, relative, `const t = "${token}";\nconst u = "${fake.figma()}";\n`);
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /Figma token/);
  });

  it("exits 0 for a secret written outside any repo", () => {
    const cwd = tempDir();
    assert.equal(write(cwd, join(cwd, "notes.txt"), fake.aws()).status, 0);
  });

  it("exits 2 for a commit whose -F file carries a token, and 0 once the file is clean", () => {
    const cwd = repo();
    const commit = () =>
      runHook({
        hook_event_name: "PreToolUse",
        cwd,
        tool_name: "Bash",
        tool_input: { command: "git commit -F msg.txt" },
      });
    writeFileSync(join(cwd, "msg.txt"), `fix: rotate ${fake.github()}\n`);
    const blocked = commit();
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /msg\.txt/);
    writeFileSync(join(cwd, "msg.txt"), "fix: rotate the token\n");
    assert.equal(commit().status, 0);
  });

  it("exits 0 on unparseable input", () => {
    const out = spawnSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8" });
    assert.equal(out.status, 0);
  });
});

describe("the hook run from the path a plugin cache gives it", () => {
  // Claude Code starts the hook by the cache's path, which can hold a space or
  // a non-ASCII letter, or reach the file through a symlink. import.meta.url
  // is percent-encoded and symlink-resolved, so comparing it with argv[1] as
  // strings would leave the hook running nothing and answering "all clear".
  const install = (dir) => {
    mkdirSync(dir, { recursive: true });
    for (const file of ["secrets-guard.mjs", "shell.mjs"]) {
      copyFileSync(join(HOOKS_DIR, file), join(dir, file));
    }
    return join(dir, "secrets-guard.mjs");
  };
  const blocks = (hook) => {
    const out = runHook({ hook_event_name: "UserPromptSubmit", prompt: `token ${fake.github()}` }, hook);
    assert.equal(out.status, 0, out.stderr);
    assert.equal(JSON.parse(out.stdout).decision, "block");
  };

  it("blocks from a directory whose name has a space and a non-ASCII letter", () => {
    blocks(install(join(tempDir(), "plugin cache é", "hooks")));
  });

  it("blocks when the file is reached through a symlink", () => {
    const real = join(tempDir(), "real");
    install(real);
    const link = join(tempDir(), "link");
    symlinkSync(real, link);
    blocks(join(link, "secrets-guard.mjs"));
  });
});

describe("the registration in hooks.json", () => {
  const { hooks } = JSON.parse(readFileSync(HOOKS_JSON, "utf8"));
  const guarded = hooks.PreToolUse.find((group) =>
    group.hooks.some((hook) => hook.command.includes("secrets-guard.mjs")),
  );

  // A tool the guard checks but the matcher omits is never sent to it.
  for (const tool of [
    "Bash",
    "Write",
    "Edit",
    "MultiEdit",
    "NotebookEdit",
    "mcp__bond-bitbucket__create_pull_request",
    "mcp__bond-bitbucket__create_draft_pull_request",
  ]) {
    it(`sends ${tool} to the guard`, () => {
      assert.match(tool, new RegExp(`^(?:${guarded.matcher})$`));
    });
  }

  it("also guards the prompt", () => {
    const registered = hooks.UserPromptSubmit.flatMap((group) => group.hooks);
    assert.ok(registered.some((hook) => hook.command.includes("secrets-guard.mjs")));
  });
});
