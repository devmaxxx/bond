// agent-base-kit 0.1.0, dist/index.mjs from npm (sha512-sbR9rMTW4ZC+mdjAx4KR8ZyVqG2Ubo+tKR3976TRe5JSI6IM4M27OvvyP/PVf8DfPdyJQIvxapOiyMe2wdi13w==).
// Vendored, do not edit: refresh with scripts/vendor-agent-base-kit.sh <version>.
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { Buffer } from "node:buffer";
import { homedir } from "node:os";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
// src/agents.ts
const AGENTS = {
	claude: {
		label: "Claude Code",
		dir: ".claude",
		file: "settings.json"
	},
	codex: {
		label: "Codex",
		dir: ".codex",
		file: "hooks.json"
	}
};
const TOOLS = {
	claude: {
		Bash: "shell",
		Write: "write",
		Edit: "edit",
		MultiEdit: "edit",
		NotebookEdit: "write"
	},
	codex: {
		Bash: "shell",
		apply_patch: "patch"
	}
};
const SELECTED_BY = {
	shell: ["shell"],
	write: ["write"],
	edit: ["edit"],
	patch: [
		"write",
		"edit",
		"patch"
	]
};
const KIND_OF_TOOL = new Map(Object.values(TOOLS).flatMap((tools) => Object.entries(tools)));
function selected(agent, kinds) {
	return Object.entries(TOOLS[agent]).filter(([, kind]) => SELECTED_BY[kind].some((by) => kinds.includes(by)));
}
/**
* The PreToolUse matcher that routes the given kinds of call to the hook in
* one agent, such as `Bash|Write|Edit|MultiEdit|NotebookEdit` for every kind
* in Claude Code; empty when the agent has no tool of those kinds.
*/
function matcherFor(agent, kinds) {
	return selected(agent, kinds).map(([tool]) => tool).join("|");
}
function requireMatcher(agent, plugin) {
	const tools = selected(agent, plugin.kinds);
	if (tools.length === 0) throw new Error(`${plugin.name} checks ${plugin.kinds.join(", ")} calls, which ${AGENTS[agent].label} does not make`);
	const unseen = tools.filter(([, kind]) => !plugin.kinds.includes(kind)).map(([tool]) => tool);
	if (unseen.length > 0) throw new Error(`${AGENTS[agent].label} sends file changes as ${unseen.join(", ")}, which ${plugin.name} does not take; add 'patch' to its kinds`);
	return tools.map(([tool]) => tool).join("|");
}
// src/claude-plugin.ts
const MARKETPLACE_NAME = /^[a-z0-9][\w.-]*$/i;
const RESERVED = /^(?:claude|anthropics?)(?:-|$)|^cc-plugin-|(?:claude|anthropic)s?-?official|official-?(?:claude|anthropic)/;
const ENTRY = /^[\w-][\w.-]*(?:\/[\w-][\w.-]*)*\.mjs$/;
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
function entryOf(entry) {
	const relative = entry.replace(/^\.\//, "");
	if (!ENTRY.test(relative)) throw new TypeError(`entry ${JSON.stringify(entry)} is not a .mjs path inside the package`);
	return relative;
}
/**
* The files that make a plugin package a Claude Code plugin, by path relative
* to the package root: `.claude-plugin/plugin.json`, `hooks/hooks.json`, and
* with `marketplace`, `.claude-plugin/marketplace.json`.
*
* The hook runs `node "${CLAUDE_PLUGIN_ROOT}/<entry>" hook || exit 2` with
* `onFailure: "block"`, so a plugin that cannot start or times out blocks the
* call. Claude Code copies the plugin and installs nothing into it, so the
* entry's directory must hold the whole build. Throws when the plugin checks
* no tool Claude Code has, or a field would make Claude Code refuse the
* plugin.
*/
function claudePluginFiles(options) {
	const { plugin, version, description, author, homepage, repository, license, keywords, marketplace } = options;
	const matcher = requireMatcher("claude", plugin);
	const entry = entryOf(options.entry);
	if (RESERVED.test(plugin.name)) throw new TypeError(`Claude Code reserves plugin names like ${plugin.name} for Anthropic's own; name it for what it does`);
	if (homepage !== void 0 && !URL.canParse(homepage)) throw new TypeError(`homepage ${JSON.stringify(homepage)} is not a URL`);
	const files = {
		".claude-plugin/plugin.json": json({
			name: plugin.name,
			version,
			description,
			author,
			homepage,
			repository,
			license,
			keywords
		}),
		"hooks/hooks.json": json({ hooks: { PreToolUse: [{
			matcher,
			hooks: [{
				type: "command",
				command: `node "\${CLAUDE_PLUGIN_ROOT}/${entry}" hook || exit 2`,
				timeout: plugin.timeout,
				statusMessage: plugin.statusMessage,
				onFailure: "block"
			}]
		}] } })
	};
	if (marketplace) {
		if (!MARKETPLACE_NAME.test(marketplace.name)) throw new TypeError(`marketplace name ${JSON.stringify(marketplace.name)} may hold only letters, digits, '.', '_' and '-', and must start with a letter or digit`);
		files[".claude-plugin/marketplace.json"] = json({
			name: marketplace.name,
			owner: marketplace.owner,
			description,
			plugins: [{
				name: plugin.name,
				source: {
					source: "npm",
					package: plugin.packageName,
					version: marketplace.version
				},
				description
			}]
		});
	}
	return files;
}
/**
* Writes {@link claudePluginFiles} under `dir`, the plugin package's root, and
* returns the paths written. Run it from the package's build, and publish the
* written files with the build.
*/
function writeClaudePlugin(dir, options) {
	return Object.entries(claudePluginFiles(options)).map(([path, text]) => {
		const file = join(dir, path);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, text);
		return file;
	});
}
// src/hook.ts
const isObject$1 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function stringField(input, key) {
	const value = input[key];
	if (value === void 0 || value === null) return "";
	if (typeof value !== "string") throw new TypeError(`${key} is not a string`);
	return value;
}
function record(value, key) {
	if (value === void 0 || value === null) return {};
	if (!isObject$1(value)) throw new TypeError(`${key} is not an object`);
	return value;
}
function editList(input) {
	const edits = input.edits ?? [];
	if (!Array.isArray(edits)) throw new TypeError("edits is not a list");
	return edits.map((edit) => record(edit, "edit"));
}
function toToolCall(tool, input) {
	const text = (key, from = input) => stringField(from, key);
	const joined = (key) => editList(input).map((edit) => text(key, edit)).join("\n");
	switch (tool) {
		case "Bash": return {
			kind: "shell",
			command: text("command")
		};
		case "Write": return {
			kind: "write",
			path: text("file_path"),
			content: text("content")
		};
		case "NotebookEdit": return {
			kind: "write",
			path: text("notebook_path"),
			content: text("new_source")
		};
		case "Edit": return {
			kind: "edit",
			path: text("file_path"),
			before: text("old_string"),
			after: text("new_string")
		};
		case "MultiEdit": return {
			kind: "edit",
			path: text("file_path"),
			before: joined("old_string"),
			after: joined("new_string")
		};
		case "apply_patch": return {
			kind: "patch",
			patch: text("command") || text("input") || text("patch")
		};
		default: throw new TypeError(`${tool} is not a tool the hook reads`);
	}
}
function verdictOf(value) {
	if (isObject$1(value) && value.block === false) return { block: false };
	if (isObject$1(value) && value.block === true && typeof value.reason === "string" && value.reason.trim() !== "") return {
		block: true,
		reason: value.reason
	};
	throw new TypeError("check returned neither { block: false } nor { block: true, reason }");
}
/**
* Runs one PreToolUse call through the plugin and returns the exit code the
* agent reads: 2 blocks the call, 0 lets it run.
*
* It fails closed. A payload that is not JSON or names no tool, a field of the
* wrong shape, a check that throws or rejects, and a result that is not a
* verdict all return 2 with the error on stderr, because any other exit lets
* the call run unchecked. A tool the plugin did not ask for returns 0 without
* calling the check.
*/
async function runHook(plugin, stdin, options = {}) {
	const stderr = options.stderr ?? ((text) => void process.stderr.write(text));
	let verdict;
	try {
		const payload = JSON.parse(stdin);
		if (!isObject$1(payload)) throw new TypeError("payload is not an object");
		const tool = payload.tool_name;
		if (typeof tool !== "string" || tool === "") throw new TypeError("tool_name is not a tool name");
		const kind = KIND_OF_TOOL.get(tool);
		if (kind === void 0 || !plugin.kinds.includes(kind)) return 0;
		const call = toToolCall(tool, record(payload.tool_input, "tool_input"));
		const cwd = stringField(payload, "cwd") || (options.cwd ?? process.cwd());
		verdict = verdictOf(await plugin.check(call, { cwd }));
	} catch (error) {
		stderr(`Blocked by ${plugin.name}, it could not check the call: ${error instanceof Error ? error.message : String(error)}\n`);
		return 2;
	}
	if (!verdict.block) return 0;
	stderr(verdict.reason.endsWith("\n") ? verdict.reason : `${verdict.reason}\n`);
	return 2;
}
// src/install.ts
/** The agent config a scope writes: `~/.claude/settings.json`, `<cwd>/.codex/hooks.json` and so on. */
function configFile(agent, scope, place) {
	const { dir, file } = AGENTS[agent];
	return join(scope === "project" ? place.cwd : place.home, dir, file);
}
const quote = (word) => `'${word.replaceAll("'", `'\\''`)}'`;
const escape = (text) => text.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&");
function hookCommand(plugin, scope, script, node) {
	if (scope === "project") return `npx --no-install ${plugin.packageName} hook || exit 2`;
	return `n=${quote(node)}; [ -x "$n" ] || n=node; "$n" ${quote(script)} hook || exit 2`;
}
const QUOTED = String.raw`(?:[^']|'\\'')*`;
function ownHook(plugin, entry) {
	const name = escape(plugin.name);
	const pinned = String.raw`n='${QUOTED}'; \[ -x "\$n" \] \|\| n=node; "\$n" '${QUOTED}/\.${name}/current/[^/']+' hook`;
	const bare = `node '${QUOTED}/${name}/(?:${QUOTED}/)?${escape(entry)}' hook`;
	const project = `npx --no-install ${escape(plugin.packageName)} hook`;
	return new RegExp(`^(?:${pinned}|${bare}|${project})(?: \\|\\| exit 2)?$`);
}
const builtFiles = (dir) => readdirSync(dir).filter((name) => name.endsWith(".mjs")).sort();
function buildId(dir) {
	const hash = createHash("sha256");
	for (const name of builtFiles(dir)) hash.update(name).update("\0").update(readFileSync(join(dir, name)));
	return hash.digest("hex").slice(0, 12);
}
function copyBuild(plugin, script, root) {
	if (!script.endsWith(".mjs") || !existsSync(script)) throw new Error(`${script} is not a built ${plugin.name} entry; run install from the published package or a build`);
	const source = dirname(script);
	const id = buildId(source);
	const target = join(root, id);
	if (!existsSync(target) || buildId(target) !== id) {
		mkdirSync(root, { recursive: true });
		const staging = mkdtempSync(`${target}-`);
		try {
			for (const name of builtFiles(source)) copyFileSync(join(source, name), join(staging, name));
			if (existsSync(target) && buildId(target) !== id) renameSync(target, `${staging}-stale`);
			if (!existsSync(target)) renameSync(staging, target);
		} catch (error) {
			if (!existsSync(target) || buildId(target) !== id) throw error;
		} finally {
			rmSync(staging, {
				recursive: true,
				force: true
			});
			rmSync(`${staging}-stale`, {
				recursive: true,
				force: true
			});
		}
	}
	return id;
}
function probe(file, node) {
	const ran = spawnSync(node, [file, "hook"], {
		input: "{\"tool_name\":\"Read\"}",
		encoding: "utf8",
		timeout: 1e4
	});
	if (ran.status === 0) return;
	const why = ran.error?.message ?? ran.stderr.trim().split("\n").find((line) => /error/i.test(line)) ?? `exit ${ran.status ?? ran.signal}`;
	throw new Error(`the copy of the build at ${file} does not run on its own (${why}); the bin's directory must hold the whole build as .mjs files, with its dependencies bundled in`);
}
function linkCurrent(root, id) {
	const current = join(root, "current");
	if (existsSync(current) && !lstatSync(current).isSymbolicLink()) throw new Error(`${current} is not the link install writes; move it away and install again`);
	const link = `${current}.${process.pid}`;
	try {
		rmSync(link, { force: true });
		symlinkSync(id, link);
		renameSync(link, current);
	} finally {
		rmSync(link, { force: true });
	}
	return current;
}
const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function readSettings(file) {
	if (!existsSync(file)) return {};
	let settings;
	try {
		settings = JSON.parse(readFileSync(file, "utf8"));
	} catch (error) {
		throw new Error(`${file} is not valid JSON (${error.message}); it was left unchanged`);
	}
	const hooks = isObject(settings) ? settings.hooks : void 0;
	const preToolUse = isObject(hooks) ? hooks.PreToolUse : void 0;
	const wrongHooks = hooks !== void 0 && hooks !== null && !isObject(hooks);
	const wrongPreToolUse = preToolUse !== void 0 && preToolUse !== null && !Array.isArray(preToolUse);
	if (!isObject(settings) || wrongHooks || wrongPreToolUse) throw new Error(`${file} does not hold a settings object with a hooks object and a PreToolUse list; it was left unchanged`);
	return settings;
}
function writeConfig(file, text) {
	const real = existsSync(file) ? realpathSync(file) : file;
	mkdirSync(dirname(real), { recursive: true });
	const temp = `${real}.${process.pid}.tmp`;
	try {
		writeFileSync(temp, text);
		if (existsSync(real)) chmodSync(temp, statSync(real).mode & 4095);
		renameSync(temp, real);
	} finally {
		rmSync(temp, { force: true });
	}
}
function configure(file, settings, own, entry) {
	const hooks = settings.hooks ?? {};
	const before = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
	let removed = 0;
	const kept = before.map((item) => {
		if (!Array.isArray(item?.hooks)) return item;
		const rest = item.hooks.filter((hook) => !(typeof hook?.command === "string" && own.test(hook.command)));
		removed += item.hooks.length - rest.length;
		return {
			...item,
			hooks: rest
		};
	}).filter((item) => !Array.isArray(item?.hooks) || item.hooks.length > 0);
	if (!entry && removed === 0) return;
	if (entry) kept.push(entry);
	settings.hooks = {
		...hooks,
		PreToolUse: kept
	};
	if (kept.length === 0) delete settings.hooks.PreToolUse;
	writeConfig(file, `${JSON.stringify(settings, null, 2)}\n`);
}
/**
* Adds the plugin's PreToolUse hook to one agent's config, replacing any entry
* it wrote before and keeping every other one.
*
* The user scope copies the bin's directory to `~/.<name>/<build-id>/`, checks
* the copy runs, points `~/.<name>/current` at it and runs it from there on
* `execPath`. The project scope runs `npx --no-install <packageName> hook`.
* Either command ends in `|| exit 2`, so a hook that cannot start blocks the
* call. The Claude Code entry also sets `onFailure: "block"` for a hook that
* times out.
*
* Throws, and leaves the config as it was, when the config is not a settings
* object it can extend, when the plugin's kinds leave tools the agent routes
* to it unchecked, or when the build cannot be copied or does not run.
*/
function install(options) {
	const { plugin, agent, scope, script } = options;
	const matcher = requireMatcher(agent, plugin);
	const file = configFile(agent, scope, options);
	const settings = readSettings(file);
	let target = script;
	if (scope === "user") {
		const root = join(options.home, `.${plugin.name}`);
		const id = copyBuild(plugin, script, root);
		probe(join(root, id, basename(script)), options.execPath);
		target = join(linkCurrent(root, id), basename(script));
	}
	const command = hookCommand(plugin, scope, target, options.execPath);
	configure(file, settings, ownHook(plugin, basename(script)), {
		matcher,
		hooks: [{
			type: "command",
			command,
			timeout: plugin.timeout,
			statusMessage: plugin.statusMessage,
			...agent === "claude" ? { onFailure: "block" } : {}
		}]
	});
	return {
		file,
		command
	};
}
/**
* Removes the plugin's hook from one agent's config, whichever form an earlier
* install wrote, and keeps every other entry. The stable copy stays: another
* agent may still run it. Throws, and leaves the file as it was, when it is not
* a settings object.
*/
function uninstall(options) {
	const file = configFile(options.agent, options.scope, options);
	if (!existsSync(file)) return { file };
	configure(file, readSettings(file), ownHook(options.plugin, basename(options.script)), null);
	return { file };
}
// src/cli.ts
const isAgent = (word) => word === "claude" || word === "codex";
function usage(bin) {
	const rows = [
		["install <claude|codex> [--project]", "add the PreToolUse hook"],
		["uninstall <claude|codex> [--project]", "remove it"],
		["hook", "run as the hook (reads the tool call on stdin)"]
	];
	const width = Math.max(...rows.map(([command]) => command.length)) + 1;
	return `Usage:\n${rows.map(([command, what]) => `  ${bin} ${command.padEnd(width)}${what}`).join("\n")}\n`;
}
/**
* Builds the plugin's command line: `install` and `uninstall <claude|codex>
* [--project]`, and `hook`, which reads the tool call from `io.stdin`.
*
* Exit codes: `hook` returns what {@link runHook} returns, 0 or 2. `install`
* and `uninstall` return 0, or 1 with the reason on stderr. Anything else,
* including an unknown flag or an extra argument, prints the usage and
* returns 1. On a Node.js older than 22, `hook` returns 2
* and `install` 1, each with a message naming the fix; `uninstall` still runs.
*/
function createCli(plugin, options = {}) {
	const bin = options.bin ?? plugin.name;
	return async (argv, io) => {
		const [command, agent, ...flags] = argv;
		const major = Number(/^v(\d+)\./.exec(io.node)?.[1] ?? 0);
		if ((command === "hook" || command === "install") && major < 22) {
			io.stderr(`${bin} needs Node.js 22 or later, and this one is ${io.node}. Run \`npx ${plugin.packageName} install claude\` (or codex) again with Node.js 22 or later, or put one first on PATH and restart the agent.\n`);
			return command === "hook" ? 2 : 1;
		}
		if (command === "hook") return runHook(plugin, io.stdin(), {
			cwd: io.cwd,
			stderr: io.stderr
		});
		const project = flags.length === 1 && flags[0] === "--project";
		if ((command === "install" || command === "uninstall") && isAgent(agent) && (flags.length === 0 || project)) {
			const place = {
				plugin,
				agent,
				scope: project ? "project" : "user",
				script: io.script,
				home: io.home,
				cwd: io.cwd
			};
			let file;
			try {
				file = command === "install" ? install({
					...place,
					execPath: io.execPath
				}).file : uninstall(place).file;
			} catch (error) {
				io.stderr(`${bin}: ${error instanceof Error ? error.message : String(error)}\n`);
				return 1;
			}
			io.stdout(`${command === "install" ? "Installed in" : "Removed from"} ${file}\n`);
			if (command === "install" && agent === "codex") io.stdout("Codex runs a new hook only after you trust it: open /hooks in Codex once.\n");
			return 0;
		}
		io.stderr(usage(bin));
		return 1;
	};
}
/**
* Reads a stream to its end as UTF-8, `process.stdin` by default. A
* synchronous read of fd 0 fails with EAGAIN on a non-blocking pipe once the
* payload outgrows its buffer, so the hook reads this way. A read that fails
* resolves to `''`, which {@link runHook} blocks.
*/
async function readStdin(stream = process.stdin) {
	const chunks = [];
	try {
		for await (const chunk of stream) chunks.push(Buffer.from(chunk));
	} catch {
		return "";
	}
	return Buffer.concat(chunks).toString("utf8");
}
/**
* The whole bin: runs {@link createCli} on `process.argv`, reads stdin only for
* `hook`, and sets `process.exitCode`. Call it without `await`, passing the
* bin's own `import.meta.url`, which is what install copies and runs.
*
* For `hook` the exit code is 2 until a verdict is in. Node.js exits 0 once
* nothing is left to run, so a check whose promise never settles would
* otherwise let the call run.
*/
async function runCli(plugin, entryUrl, options = {}) {
	const argv = process.argv.slice(2);
	const hook = argv[0] === "hook";
	let done = false;
	if (hook) {
		process.exitCode = 2;
		process.once("beforeExit", () => {
			if (!done) process.stderr.write(`Blocked by ${plugin.name}, its check never finished\n`);
		});
	}
	try {
		const input = hook ? await readStdin() : "";
		process.exitCode = await createCli(plugin, options)(argv, {
			stdin: () => input,
			script: fileURLToPath(entryUrl),
			node: process.version,
			execPath: process.execPath,
			home: homedir(),
			cwd: process.cwd(),
			stdout: (text) => void process.stdout.write(text),
			stderr: (text) => void process.stderr.write(text)
		});
		done = true;
	} catch (error) {
		done = true;
		process.stderr.write(`${options.bin ?? plugin.name}: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = hook ? 2 : 1;
	}
}
// src/define.ts
const KINDS = [
	"shell",
	"write",
	"edit",
	"patch"
];
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
/**
* Checks a hook definition and returns the plugin every other function takes.
* Throws a `TypeError` naming the field when the definition is malformed, so a
* broken plugin fails when it is built, not when the hook runs.
*/
function defineHook(definition) {
	const { name, kinds, check, packageName = name, statusMessage = `Running ${name}`, timeout = 10 } = definition;
	if (typeof name !== "string" || !NAME.test(name)) throw new TypeError(`name ${JSON.stringify(name)} is not kebab-case (lowercase letters and digits, joined by single hyphens)`);
	if (typeof packageName !== "string" || !PACKAGE.test(packageName)) throw new TypeError(`packageName ${JSON.stringify(packageName)} is not an npm package name`);
	if (!Array.isArray(kinds) || kinds.length === 0 || kinds.some((kind) => !KINDS.includes(kind))) throw new TypeError(`kinds must list one or more of ${KINDS.join(", ")}`);
	if (typeof check !== "function") throw new TypeError("check is not a function");
	if (typeof statusMessage !== "string" || statusMessage === "") throw new TypeError("statusMessage is not a non-empty string");
	if (!Number.isInteger(timeout) || timeout < 1) throw new TypeError(`timeout ${JSON.stringify(timeout)} is not a whole number of seconds`);
	return Object.freeze({
		name,
		packageName,
		kinds: Object.freeze([...new Set(kinds)]),
		statusMessage,
		timeout,
		check
	});
}
export { claudePluginFiles, configFile, createCli, defineHook, install, matcherFor, readStdin, runCli, runHook, uninstall, writeClaudePlugin };
