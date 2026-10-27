// agent-base-kit 0.3.0, dist/index.mjs built from devmaxxx/agent-base-kit commit 3e5a3849c66ff5dfa22c731603afca7b730de1ab.
// UNPUBLISHED: 0.3.0 is not on npm yet. Once it is, refresh with scripts/vendor-agent-base-kit.sh 0.3.0.
// Vendored, do not edit: refresh with scripts/vendor-agent-base-kit.sh <version>.
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
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
	],
	tool: []
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
	if (tools.length === 0 && plugin.tools.length === 0) throw new Error(`${plugin.name} checks ${plugin.kinds.join(", ")} calls, which ${AGENTS[agent].label} does not make`);
	const unseen = tools.filter(([, kind]) => !plugin.kinds.includes(kind)).map(([tool]) => tool);
	if (unseen.length > 0) throw new Error(`${AGENTS[agent].label} sends file changes as ${unseen.join(", ")}, which ${plugin.name} does not take; add 'patch' to its kinds`);
	return [...tools.map(([tool]) => tool), ...plugin.tools].join("|");
}
const hookFlags = (event, agent) => `--event ${event} --agent ${agent}`;
// src/claude-plugin.ts
const MARKETPLACE_NAME = /^[a-z0-9][\w.-]*$/i;
const RESERVED = /^(?:claude|anthropics?)(?:-|$)|^cc-plugin-|(?:claude|anthropic)s?-?official|official-?(?:claude|anthropic)/;
const ENTRY = /^[\w-][\w.-]*(?:\/[\w-][\w.-]*)*\.mjs$/;
function pluginHooks(plugin, matcher, entry) {
	const command = (event) => `node "\${CLAUDE_PLUGIN_ROOT}/${entry}" hook ${hookFlags(event, "claude")}`;
	const hooks = { PreToolUse: [{
		matcher,
		hooks: [{
			type: "command",
			command: `${command("PreToolUse")} || exit 2`,
			timeout: plugin.timeout,
			statusMessage: plugin.statusMessage,
			onFailure: "block"
		}]
	}] };
	for (const [event, hook] of Object.entries(plugin.events)) hooks[event] = [{ hooks: [{
		type: "command",
		command: command(event),
		timeout: hook.timeout,
		statusMessage: hook.statusMessage
	}] }];
	return hooks;
}
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
* The PreToolUse hook runs `node "${CLAUDE_PLUGIN_ROOT}/<entry>" hook --event
* PreToolUse --agent claude || exit 2` with `onFailure: "block"`, so a plugin that cannot start or times out blocks
* the call; each of the plugin's other events runs the same command, naming
* its own event, without either, so it passes instead. Claude Code copies the plugin and installs
* nothing into it, and the plugin's `onInstall` does not run, so the entry's
* directory must hold the whole build. Throws when the plugin checks
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
		"hooks/hooks.json": json({ hooks: pluginHooks(plugin, matcher, entry) })
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
const OPEN_EVENTS = ["Stop", "UserPromptSubmit"];
const EVENTS$2 = ["PreToolUse", ...OPEN_EVENTS];
const isOpen = (event) => OPEN_EVENTS.includes(event);
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
function toToolCalls(plugin, tool, input) {
	if (tool !== "MultiEdit") return [toToolCall(plugin, tool, input)];
	const path = stringField(input, "file_path");
	const edits = editList(input);
	if (edits.length === 0) return [{
		kind: "edit",
		path,
		before: "",
		after: ""
	}];
	return edits.map((edit) => ({
		kind: "edit",
		path,
		before: stringField(edit, "old_string"),
		after: stringField(edit, "new_string")
	}));
}
function toToolCall(plugin, tool, input) {
	if (plugin.tools.includes(tool)) return {
		kind: "tool",
		name: tool,
		input
	};
	const text = (key, from = input) => stringField(from, key);
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
const messageOf = (error) => error instanceof Error ? error.message : String(error);
/**
* The event a hook payload is for when it names one the hook lets pass on a
* fault, else `undefined`. Read before the Node.js check and the hang guard,
* which must not block these either.
*/
function openEventOf(stdin) {
	try {
		const event = JSON.parse(stdin)?.hook_event_name;
		return OPEN_EVENTS.find((open) => open === event);
	} catch {
		return;
	}
}
/**
* Whether a fault lets the event pass: the named event when the command names
* one, else the event the payload names.
*/
function passesOnFault(event, stdin) {
	return event === void 0 ? openEventOf(stdin) !== void 0 : isOpen(event);
}
function payloadOf(stdin) {
	const payload = JSON.parse(stdin);
	if (!isObject$1(payload)) throw new TypeError("payload is not an object");
	return payload;
}
async function runOpenEvent(plugin, event, read, options) {
	if (!plugin.events[event]) return 0;
	const stderr = options.stderr ?? ((text) => void process.stderr.write(text));
	const stdout = options.stdout ?? ((text) => void process.stdout.write(text));
	try {
		const payload = read();
		if (payload.hook_event_name !== void 0 && payload.hook_event_name !== event) throw new TypeError(`hook_event_name ${JSON.stringify(payload.hook_event_name)} is not ${event}`);
		if (options.agent !== void 0 && options.agent !== "claude" && options.agent !== "codex") throw new TypeError(`agent ${JSON.stringify(options.agent)} is neither claude nor codex`);
		if (event === "Stop" && payload.stop_hook_active === true) return 0;
		const cwd = stringField(payload, "cwd") || (options.cwd ?? process.cwd());
		const verdict = event === "Stop" ? verdictOf(await plugin.events.Stop.check({ reply: stringField(payload, "last_assistant_message") }, { cwd })) : verdictOf(await plugin.events.UserPromptSubmit.check({ prompt: stringField(payload, "prompt") }, { cwd }));
		if (!verdict.block) return 0;
		const codex = options.agent === void 0 ? payload.turn_id !== void 0 : options.agent === "codex";
		const hidden = event === "UserPromptSubmit" && plugin.events.UserPromptSubmit.hidePrompt && !codex;
		stdout(`${JSON.stringify({
			decision: "block",
			reason: verdict.reason,
			...hidden ? { hookSpecificOutput: {
				hookEventName: "UserPromptSubmit",
				suppressOriginalPrompt: true
			} } : {}
		})}\n`);
	} catch (error) {
		stderr(`${plugin.name} could not check the ${event === "Stop" ? "reply" : "prompt"}, so it let it pass: ${messageOf(error)}\n`);
	}
	return 0;
}
/**
* Runs one hook payload through the plugin and returns the exit code the
* agent reads.
*
* A PreToolUse call returns 2 to block it and 0 to let it run, and fails
* closed: a payload that is not JSON or names no tool, a field of the wrong
* shape, a check that throws or rejects, and a result that is not a verdict
* all return 2 with the error on stderr, because any other exit lets the call
* run unchecked. A tool the plugin did not ask for returns 0 without calling
* the check. A MultiEdit calls the check once per edit and blocks on the first
* edit it blocks. A payload with no `hook_event_name` is read as PreToolUse;
* one naming any event other than PreToolUse, Stop or UserPromptSubmit, or
* a `hook_event_name` that is not a string, returns 2.
*
* Stop and UserPromptSubmit always return 0. A block goes to stdout as
* `{"decision":"block","reason":…}`, and a fault to stderr, letting the event
* pass. A Stop with `stop_hook_active` set passes unchecked, and so does an
* event the plugin has no check for.
*
* With `options.event`, the event is the one named, not the payload's: a
* Stop or UserPromptSubmit returns 0 on any fault, a payload that is not JSON
* included, and a payload naming another event is a fault for that event.
*/
async function runHook(plugin, stdin, options = {}) {
	const stderr = options.stderr ?? ((text) => void process.stderr.write(text));
	if (isOpen(options.event)) return runOpenEvent(plugin, options.event, () => payloadOf(stdin), options);
	let verdict;
	try {
		if (options.event !== void 0 && !EVENTS$2.includes(options.event)) throw new TypeError(`event ${JSON.stringify(options.event)} is not an event the hook runs`);
		const payload = payloadOf(stdin);
		const event = payload.hook_event_name;
		if (options.event === void 0 && isOpen(event)) return runOpenEvent(plugin, event, () => payload, options);
		if (event !== void 0 && event !== "PreToolUse") throw new TypeError(`hook_event_name ${JSON.stringify(event)} is not ${options.event ?? "an event the hook runs"}`);
		const tool = payload.tool_name;
		if (typeof tool !== "string" || tool === "") throw new TypeError("tool_name is not a tool name");
		const kind = plugin.tools.includes(tool) ? "tool" : KIND_OF_TOOL.get(tool);
		if (kind === void 0 || !plugin.kinds.includes(kind)) return 0;
		const calls = toToolCalls(plugin, tool, record(payload.tool_input, "tool_input"));
		const cwd = stringField(payload, "cwd") || (options.cwd ?? process.cwd());
		verdict = { block: false };
		for (const call of calls) {
			verdict = verdictOf(await plugin.check(call, { cwd }));
			if (verdict.block) break;
		}
	} catch (error) {
		stderr(`Blocked by ${plugin.name}, it could not check the call: ${messageOf(error)}\n`);
		return 2;
	}
	if (!verdict.block) return 0;
	stderr(verdict.reason.endsWith("\n") ? verdict.reason : `${verdict.reason}\n`);
	return 2;
}
// src/install.ts
const EVENTS$1 = [
	"PreToolUse",
	"Stop",
	"UserPromptSubmit"
];
/** The agent config a scope writes: `~/.claude/settings.json`, `<cwd>/.codex/hooks.json` and so on. */
function configFile(agent, scope, place) {
	const { dir, file } = AGENTS[agent];
	return join(scope === "project" ? place.cwd : place.home, dir, file);
}
const quote = (word) => `'${word.replaceAll("'", `'\\''`)}'`;
const escape = (text) => text.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&");
function hookCommand(plugin, scope, script, node) {
	if (scope === "project") return `npx --no-install ${plugin.packageName} hook`;
	return `n=${quote(node)}; [ -x "$n" ] || n=node; "$n" ${quote(script)} hook`;
}
function entriesFor(plugin, agent, command) {
	const entry = (event, status, timeout) => {
		const run = `${command} ${hookFlags(event, agent)}`;
		return {
			type: "command",
			command: event === "PreToolUse" ? `${run} || exit 2` : run,
			timeout,
			statusMessage: status
		};
	};
	const { Stop, UserPromptSubmit } = plugin.events;
	return {
		PreToolUse: {
			matcher: requireMatcher(agent, plugin),
			hooks: [{
				...entry("PreToolUse", plugin.statusMessage, plugin.timeout),
				...agent === "claude" ? { onFailure: "block" } : {}
			}]
		},
		...Stop ? { Stop: { hooks: [entry("Stop", Stop.statusMessage, Stop.timeout)] } } : {},
		...UserPromptSubmit ? { UserPromptSubmit: { hooks: [entry("UserPromptSubmit", UserPromptSubmit.statusMessage, UserPromptSubmit.timeout)] } } : {}
	};
}
const QUOTED = String.raw`(?:[^']|'\\'')*`;
function ownHook(plugin, entry) {
	const name = escape(plugin.name);
	const pinned = String.raw`n='${QUOTED}'; \[ -x "\$n" \] \|\| n=node; "\$n" '${QUOTED}/\.${name}/current/[^/']+' hook`;
	const bare = `node '${QUOTED}/${name}/(?:${QUOTED}/)?${escape(entry)}' hook`;
	const project = `npx --no-install ${escape(plugin.packageName)} hook`;
	const flags = String.raw`(?: --event (?:PreToolUse|Stop|UserPromptSubmit))?(?: --agent (?:claude|codex))?`;
	const own = new RegExp(`^(?:${pinned}|${bare}|${project})${flags}(?: \\|\\| exit 2)?$`);
	const earlier = plugin.ownCommands.map((pattern) => new RegExp(`^(?:${pattern.source})$`, pattern.flags));
	return (command) => own.test(command) || earlier.some((pattern) => pattern.test(command));
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
function restoreCurrent(root, id) {
	const current = join(root, "current");
	const target = () => {
		try {
			return readlinkSync(current);
		} catch {
			return null;
		}
	};
	const previous = target();
	return () => {
		if (target() !== id) return;
		if (previous === null) rmSync(current, { force: true });
		else linkCurrent(root, previous);
	};
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
	const wrongHooks = hooks !== void 0 && hooks !== null && !isObject(hooks);
	const wrongList = EVENTS$1.find((event) => {
		const list = isObject(hooks) ? hooks[event] : void 0;
		return list !== void 0 && list !== null && !Array.isArray(list);
	});
	if (!isObject(settings) || wrongHooks) throw new Error(`${file} does not hold a settings object with a hooks object; it was left unchanged`);
	if (wrongList) throw new Error(`${file} has a ${wrongList} that is not a list; it was left unchanged`);
	return settings;
}
function writeConfig(file, text) {
	const real = existsSync(file) ? realpathSync(file) : file;
	mkdirSync(dirname(real), { recursive: true });
	const temp = `${real}.${process.pid}.tmp`;
	const mode = existsSync(real) ? statSync(real).mode & 4095 : void 0;
	try {
		rmSync(temp, { force: true });
		writeFileSync(temp, text, {
			mode: mode ?? 438,
			flag: "wx"
		});
		if (mode !== void 0) chmodSync(temp, mode);
		renameSync(temp, real);
	} finally {
		rmSync(temp, { force: true });
	}
}
function configure(file, settings, own, entries) {
	const hooks = { ...settings.hooks };
	let changed = false;
	for (const event of EVENTS$1) {
		const kept = (Array.isArray(hooks[event]) ? hooks[event] : []).map((item) => {
			if (!Array.isArray(item?.hooks)) return item;
			const rest = item.hooks.filter((hook) => !(typeof hook?.command === "string" && own(hook.command)));
			changed ||= rest.length < item.hooks.length;
			return {
				...item,
				hooks: rest
			};
		}).filter((item) => !Array.isArray(item?.hooks) || item.hooks.length > 0);
		const entry = entries[event];
		if (entry) {
			kept.push(entry);
			changed = true;
		}
		if (kept.length > 0) hooks[event] = kept;
		else if (Array.isArray(hooks[event])) delete hooks[event];
	}
	if (!changed) return;
	settings.hooks = hooks;
	writeConfig(file, `${JSON.stringify(settings, null, 2)}\n`);
}
function linesOf(value, field) {
	if (value === void 0) return [];
	if (!Array.isArray(value) || value.some((line) => typeof line !== "string")) throw new TypeError(`${field} is not a list of strings`);
	return [...value];
}
function withExtra(file, place, write, extra) {
	const before = existsSync(file) ? readFileSync(file, "utf8") : null;
	write();
	if (!extra) return {
		notes: [],
		warnings: []
	};
	try {
		const result = extra({
			...place,
			file
		});
		if (result !== void 0 && !isObject(result)) throw new TypeError("an install step returned neither nothing nor { notes, warnings }");
		return {
			notes: linesOf(result?.notes, "notes"),
			warnings: linesOf(result?.warnings, "warnings")
		};
	} catch (error) {
		if (before === null) rmSync(file, { force: true });
		else if (readFileSync(file, "utf8") !== before) writeConfig(file, before);
		throw error;
	}
}
/**
* Adds the plugin's hooks to one agent's config, PreToolUse and each event in
* its `events`, replacing any entry it wrote before, for any event, and
* keeping every other one.
*
* The user scope copies the bin's directory to `~/.<name>/<build-id>/`, checks
* the copy runs, points `~/.<name>/current` at it and runs it from there on
* `execPath`. The project scope runs `npx --no-install <packageName> hook`.
* Each command names its event and agent, `hook --event <event> --agent
* <agent>`, and the PreToolUse one ends in `|| exit 2`, so a hook that cannot start
* blocks the call, and the Claude Code entry sets `onFailure: "block"` for one
* that times out. The other events' commands do not, so they pass instead.
* Then the plugin's `onInstall` runs.
*
* Throws, and leaves the config and `current` as they were, when the config
* is not a settings object it can extend, when the plugin's kinds leave tools
* the agent routes to it unchecked, when the build cannot be copied or does
* not run, or when `onInstall` throws.
*/
function install(options) {
	const { plugin, agent, scope, script } = options;
	requireMatcher(agent, plugin);
	const file = configFile(agent, scope, options);
	const settings = readSettings(file);
	let target = script;
	let restore = () => {};
	if (scope === "user") {
		const root = join(options.home, `.${plugin.name}`);
		const id = copyBuild(plugin, script, root);
		probe(join(root, id, basename(script)), options.execPath);
		restore = restoreCurrent(root, id);
		target = join(linkCurrent(root, id), basename(script));
	}
	const entries = entriesFor(plugin, agent, hookCommand(plugin, scope, target, options.execPath));
	const place = {
		agent,
		scope,
		home: options.home,
		cwd: options.cwd,
		script
	};
	let lines;
	try {
		lines = withExtra(file, place, () => configure(file, settings, ownHook(plugin, basename(script)), entries), plugin.onInstall);
	} catch (error) {
		try {
			restore();
		} catch {}
		throw error;
	}
	const commands = Object.fromEntries(Object.entries(entries).map(([event, entry]) => [event, entry.hooks[0].command]));
	return {
		file,
		command: commands.PreToolUse,
		commands,
		...lines
	};
}
/**
* Removes the plugin's hooks from one agent's config, for every event and
* whichever form an earlier install wrote, keeps every other entry, and runs
* the plugin's `onUninstall`. The stable copy stays: another agent may still
* run it. Throws, and leaves the file as it was, when it is not a settings
* object or `onUninstall` throws.
*/
function uninstall(options) {
	const { plugin, agent, scope, script } = options;
	const file = configFile(agent, scope, options);
	return {
		file,
		...withExtra(file, {
			agent,
			scope,
			home: options.home,
			cwd: options.cwd,
			script
		}, () => {
			if (existsSync(file)) configure(file, readSettings(file), ownHook(plugin, basename(script)), {});
		}, plugin.onUninstall)
	};
}
// src/cli.ts
const isAgent = (word) => word === "claude" || word === "codex";
const isEvent = (word) => word === "PreToolUse" || word === "Stop" || word === "UserPromptSubmit";
function hookArgs(args) {
	const parsed = {};
	for (let i = 0; i < args.length; i += 2) {
		const [flag, value] = [args[i], args[i + 1]];
		if (flag === "--event" && isEvent(value) && parsed.event === void 0) parsed.event = value;
		else if (flag === "--agent" && isAgent(value) && parsed.agent === void 0) parsed.agent = value;
		else return {
			...parsed,
			error: `${[flag, value].filter((word) => word !== void 0).join(" ")} is not an argument hook takes`
		};
	}
	return parsed;
}
function usage(plugin, bin) {
	const events = ["PreToolUse", ...Object.keys(plugin.events)];
	const rows = [
		["install <claude|codex> [--project]", `add the ${events.join(" and ")} hook${events.length > 1 ? "s" : ""}`],
		["uninstall <claude|codex> [--project]", "remove it"],
		["hook [--event <event>] [--agent <claude|codex>]", "run as the hook (reads the agent's payload on stdin)"]
	];
	const width = Math.max(...rows.map(([command]) => command.length)) + 1;
	return `Usage:\n${rows.map(([command, what]) => `  ${bin} ${command.padEnd(width)}${what}`).join("\n")}\n`;
}
/**
* Builds the plugin's command line: `install` and `uninstall <claude|codex>
* [--project]`, and `hook [--event <event>] [--agent <claude|codex>]`, which
* reads the payload from `io.stdin` and hands the flags to {@link runHook}.
*
* Exit codes: `hook` returns what {@link runHook} returns, 0 or 2; an
* argument it does not take is a fault, 0 at Stop or UserPromptSubmit and 2
* otherwise. `install`
* and `uninstall` return 0, or 1 with the reason on stderr; the notes the
* plugin's `onInstall` or `onUninstall` returns follow the config file on
* stdout, its warnings go to stderr. Anything else, including an unknown flag
* or an extra argument, prints the usage and returns 1. On a Node.js older
* than 22, `hook` returns 2 for PreToolUse and 0 for Stop and
* UserPromptSubmit, and `install` 1, each with a message naming the fix;
* `uninstall` still runs.
*/
function createCli(plugin, options = {}) {
	const bin = options.bin ?? plugin.name;
	return async (argv, io) => {
		const [command, agent, ...flags] = argv;
		const args = command === "hook" ? hookArgs(argv.slice(1)) : {};
		const major = Number(/^v(\d+)\./.exec(io.node)?.[1] ?? 0);
		if ((command === "hook" || command === "install") && major < 22) {
			io.stderr(`${bin} needs Node.js 22 or later, and this one is ${io.node}. Run \`npx ${plugin.packageName} install claude\` (or codex) again with Node.js 22 or later, or put one first on PATH and restart the agent.\n`);
			if (command === "install") return 1;
			return passesOnFault(args.event, io.stdin()) ? 0 : 2;
		}
		if (command === "hook") {
			if (args.error) {
				const open = passesOnFault(args.event, io.stdin());
				io.stderr(open ? `${plugin.name} let it pass: ${args.error}\n` : `Blocked by ${plugin.name}: ${args.error}\n`);
				return open ? 0 : 2;
			}
			return runHook(plugin, io.stdin(), {
				cwd: io.cwd,
				stderr: io.stderr,
				stdout: io.stdout,
				event: args.event,
				agent: args.agent
			});
		}
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
			let result;
			try {
				result = command === "install" ? install({
					...place,
					execPath: io.execPath
				}) : uninstall(place);
			} catch (error) {
				io.stderr(`${bin}: ${error instanceof Error ? error.message : String(error)}\n`);
				return 1;
			}
			io.stdout(`${command === "install" ? "Installed in" : "Removed from"} ${result.file}\n`);
			for (const note of result.notes) io.stdout(`${note}\n`);
			for (const warning of result.warnings) io.stderr(`${bin}: ${warning}\n`);
			if (command === "install" && agent === "codex") io.stdout("Codex runs a new hook only after you trust it: open /hooks in Codex once.\n");
			return 0;
		}
		io.stderr(usage(plugin, bin));
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
* For a PreToolUse `hook` the exit code is 2 until a verdict is in. Node.js
* exits 0 once nothing is left to run, so a check whose promise never settles
* would otherwise let the call run. A Stop or UserPromptSubmit check that
* never settles exits 0, as any other fault there does.
*/
async function runCli(plugin, entryUrl, options = {}) {
	const argv = process.argv.slice(2);
	const hook = argv[0] === "hook";
	const { event } = hook ? hookArgs(argv.slice(1)) : {};
	let done = false;
	let open = false;
	if (hook) {
		process.exitCode = 2;
		process.once("beforeExit", () => {
			if (!done) process.stderr.write(open ? `${plugin.name} let it pass, its check never finished\n` : `Blocked by ${plugin.name}, its check never finished\n`);
		});
	}
	try {
		const input = hook ? await readStdin() : "";
		if (hook && passesOnFault(event, input)) {
			open = true;
			process.exitCode = 0;
		}
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
		process.exitCode = hook ? open ? 0 : 2 : 1;
	}
}
// src/define.ts
const KINDS = [
	"shell",
	"write",
	"edit",
	"patch",
	"tool"
];
const TOOL_NAME = /^[\w-]+$/;
const EVENTS = ["Stop", "UserPromptSubmit"];
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
/**
* Checks a hook definition and returns the plugin every other function takes.
* Throws a `TypeError` naming the field when the definition is malformed, so a
* broken plugin fails when it is built, not when the hook runs.
*/
function defineHook(definition) {
	const { name, kinds, check, packageName = name, statusMessage = `Running ${name}`, timeout = 10, ownCommands = [], tools = [], events = {}, onInstall, onUninstall } = definition;
	if (typeof name !== "string" || !NAME.test(name)) throw new TypeError(`name ${JSON.stringify(name)} is not kebab-case (lowercase letters and digits, joined by single hyphens)`);
	if (typeof packageName !== "string" || !PACKAGE.test(packageName)) throw new TypeError(`packageName ${JSON.stringify(packageName)} is not an npm package name`);
	if (!Array.isArray(kinds) || kinds.length === 0 || kinds.some((kind) => !KINDS.includes(kind))) throw new TypeError(`kinds must list one or more of ${KINDS.join(", ")}`);
	if (typeof check !== "function") throw new TypeError("check is not a function");
	checkStatus(statusMessage, "statusMessage");
	checkTimeout(timeout, "timeout");
	const patterns = Array.isArray(ownCommands) ? [...ownCommands] : null;
	if (patterns === null || patterns.some((pattern) => !(pattern instanceof RegExp) || pattern.global || pattern.multiline || pattern.sticky)) throw new TypeError("ownCommands must list regular expressions without the g, m or y flag");
	const names = Array.isArray(tools) ? [...tools] : null;
	if (names === null || names.some((tool) => typeof tool !== "string" || !TOOL_NAME.test(tool))) throw new TypeError("tools must list tool names of letters, digits, _ and -");
	const builtIn = names.find((tool) => KIND_OF_TOOL.has(tool));
	if (builtIn !== void 0) throw new TypeError(`${builtIn} is one of the agents' own tools; list its kind instead`);
	if (kinds.includes("tool") !== names.length > 0) throw new TypeError("kinds lists tool exactly when tools names one or more tools");
	for (const [key, hook] of [["onInstall", onInstall], ["onUninstall", onUninstall]]) if (hook !== void 0 && typeof hook !== "function") throw new TypeError(`${key} is not a function`);
	return Object.freeze({
		name,
		packageName,
		kinds: Object.freeze([...new Set(kinds)]),
		statusMessage,
		timeout,
		ownCommands: Object.freeze(patterns),
		tools: Object.freeze([...new Set(names)]),
		events: eventHooks(events, statusMessage, timeout),
		onInstall,
		onUninstall,
		check
	});
}
function checkStatus(value, field) {
	if (typeof value !== "string" || value === "") throw new TypeError(`${field} is not a non-empty string`);
}
function checkTimeout(value, field) {
	if (!Number.isInteger(value) || value < 1) throw new TypeError(`${field} ${JSON.stringify(value)} is not a whole number of seconds`);
}
function eventHook(event, definition, statusMessage, timeout) {
	if (typeof definition !== "object" || definition === null || typeof definition.check !== "function") throw new TypeError(`events.${event}.check is not a function`);
	const hook = {
		check: definition.check,
		statusMessage: definition.statusMessage ?? statusMessage,
		timeout: definition.timeout ?? timeout
	};
	checkStatus(hook.statusMessage, `events.${event}.statusMessage`);
	checkTimeout(hook.timeout, `events.${event}.timeout`);
	return hook;
}
function eventHooks(events, statusMessage, timeout) {
	if (typeof events !== "object" || events === null || Array.isArray(events)) throw new TypeError("events is not an object");
	const unknown = Object.keys(events).find((event) => !EVENTS.includes(event));
	if (unknown !== void 0) throw new TypeError(`events.${unknown} is not one of ${EVENTS.join(", ")}`);
	const { Stop, UserPromptSubmit } = events;
	const hidePrompt = UserPromptSubmit?.hidePrompt ?? false;
	if (typeof hidePrompt !== "boolean") throw new TypeError("events.UserPromptSubmit.hidePrompt is not a boolean");
	return Object.freeze({
		...Stop ? { Stop: Object.freeze(eventHook("Stop", Stop, statusMessage, timeout)) } : {},
		...UserPromptSubmit ? { UserPromptSubmit: Object.freeze({
			...eventHook("UserPromptSubmit", UserPromptSubmit, statusMessage, timeout),
			hidePrompt
		}) } : {}
	});
}
export { claudePluginFiles, configFile, createCli, defineHook, install, matcherFor, readStdin, runCli, runHook, uninstall, writeClaudePlugin };
