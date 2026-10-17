// shell-guards 0.1.0 (devmaxxx/shell-guards@0c6a747), bundled by tsdown.
// Vendored because plugin hooks run with no install step; rebuild there and copy
// dist/index.mjs here to update.
//#region src/defaults.ts
/**
* A starting deny-list for commands an unattended process should not run on its own: privilege escalation,
* wiping the disk or the home directory, powering the machine off, and publishing work beyond the local checkout.
*
* Each entry is a word prefix: `'git push'` denies `git push origin main` but not `git pushd`. Extend it with
* {@link effectiveDeny}, or pass your own list to {@link deniedBy}.
*/
const DEFAULT_DENY = [
	"sudo",
	"su",
	"doas",
	"pkexec",
	"run0",
	"rm -rf /",
	"rm -rf /*",
	"rm -rf ~",
	"rm -rf ~/",
	"rm -rf ~/*",
	"rm -fr /",
	"rm -fr ~",
	"mkfs",
	"dd",
	"shutdown",
	"reboot",
	"halt",
	"poweroff",
	"git push",
	"git reset --hard",
	"git clean",
	"npm publish",
	"pnpm publish",
	"yarn publish"
];
//#endregion
//#region src/word-reader.ts
var Unreadable = class extends Error {};
var WordReader = class {
	s;
	constructor(s) {
		this.s = s;
	}
	part(i, dq) {
		const s = this.s;
		switch (s[i]) {
			case "\\": return [i + 2, s.slice(i, i + 2)];
			case "'": return dq ? null : this.single(i);
			case "\"": return this.double(i);
			case "`": return [this.backquote(i), "\0"];
			case "$": {
				const [end, text] = this.dollar(i, dq);
				return [end, "\0" + text];
			}
			default: return null;
		}
	}
	dollar(i, dq) {
		const s = this.s;
		const next = s[i + 1];
		if (s.startsWith("$((", i)) {
			const [end, text] = this.arith(i + 3, true);
			return [end, `$((${text}))`];
		}
		if (next === "(") return [this.comsub(i + 2), ""];
		if (next === "[") {
			const [end, text] = this.arith(i + 2, false);
			return [end, `$[${text}]`];
		}
		if (next === "{") return this.param(i + 2, dq);
		if (next === "'" && !dq) return this.ansiC(i);
		return next === "$" ? [i + 2, "$$"] : [i + 1, "$"];
	}
	single(i) {
		const end = this.s.indexOf("'", i + 1);
		if (end < 0) throw new Unreadable();
		return [end + 1, this.s.slice(i, end + 1)];
	}
	double(i) {
		let text = "\"";
		for (let j = i + 1; j < this.s.length;) {
			if (this.s[j] === "\"") return [j + 1, `${text}"`];
			const p = this.part(j, true);
			text += p ? p[1] : this.s[j];
			j = p ? p[0] : j + 1;
		}
		throw new Unreadable();
	}
	ansiC(i) {
		let text = "";
		for (let j = i + 2; j < this.s.length; j++) {
			if (this.s[j] === "'") return [j + 1, `'${text.replaceAll("'", "")}'`];
			if (this.s[j] === "\\") j++;
			text += this.s[j] ?? "";
		}
		throw new Unreadable();
	}
	param(i, dq) {
		let text = "${";
		for (let j = i; j < this.s.length;) {
			const c = this.s[j];
			if (c === "}") return [j + 1, `${text}}`];
			if (c === "'" && dq) throw new Unreadable();
			const p = this.part(j, dq);
			text += p ? p[1] : c;
			j = p ? p[0] : j + 1;
		}
		throw new Unreadable();
	}
	arith(i, parens) {
		const [open, close] = parens ? ["(", ")"] : ["[", "]"];
		let depth = 0;
		let text = "";
		for (let j = i; j < this.s.length;) {
			const c = this.s[j];
			if (c === close && depth === 0) {
				if (!parens) return [j + 1, text];
				if (this.s[j + 1] === ")") return [j + 2, text];
				throw new Unreadable();
			}
			if (c === "'") throw new Unreadable();
			if (c === open) depth++;
			else if (c === close) depth--;
			const p = this.part(j, false);
			text += p ? p[1] : c;
			j = p ? p[0] : j + 1;
		}
		throw new Unreadable();
	}
	subscript(i) {
		let depth = 0;
		let text = "";
		for (let j = i; j < this.s.length;) {
			const c = this.s[j];
			if (c === "]" && depth === 0) return [j + 1, text];
			if (this.s.startsWith("<<", j) || c === "#" && (this.s[j - 1] === " " || this.s[j - 1] === "	")) throw new Unreadable();
			if (c === "[") depth++;
			else if (c === "]") depth--;
			const p = this.part(j, false);
			text += p ? p[1] : c;
			j = p ? p[0] : j + 1;
		}
		throw new Unreadable();
	}
};
//#endregion
//#region src/shell-reader.ts
const KEYWORD = String.raw`(?:!|\{|if|then|do|else|elif|while|until|time)[ \t]+`;
const COMMAND_START = new RegExp(String.raw`^[ \t]*(?:${KEYWORD})*$`);
const CASE_START = new RegExp(String.raw`^[ \t]*(?:${KEYWORD})*case[ \t]`);
const ASSIGNMENT_START = new RegExp(String.raw`^[ \t]*(?:${KEYWORD}|[A-Za-z_]\w*(?:\[[^\]]*\])?\+?=[^\s'"\\$]*[ \t]+)*$`);
function heredocAt(s, i) {
	let j = i + 2;
	const strip = s[j] === "-";
	if (strip) j++;
	while (s[j] === " " || s[j] === "	") j++;
	const start = j;
	let delim = "";
	let quoted = false;
	while (j < s.length && !/[ \t\n;&|()<>]/.test(s.charAt(j))) {
		const c = s.charAt(j);
		if (c === "$" || c === "`" || c === "\\" && j + 1 >= s.length) throw new Unreadable();
		if (c === "\\" || c === "'" || c === "\"") quoted = true;
		if (c === "\\") {
			delim += s[j + 1];
			j += 2;
		} else if (c === "'") {
			const end = s.indexOf("'", j + 1);
			if (end < 0) throw new Unreadable();
			delim += s.slice(j + 1, end);
			j = end + 1;
		} else if (c === "\"") {
			const [end, text] = doubleQuotedDelim(s, j + 1);
			delim += text;
			j = end;
		} else {
			delim += c;
			j++;
		}
	}
	if (j === start) throw new Unreadable();
	return {
		end: j,
		doc: {
			delim,
			strip,
			quoted
		}
	};
}
function doubleQuotedDelim(s, from) {
	let text = "";
	for (let j = from; j < s.length; j++) {
		const c = s.charAt(j);
		if (c === "\"") return [j + 1, text];
		if (c === "$" || c === "`") throw new Unreadable();
		if (c === "\\" && "$`\"\\\n".includes(s[j + 1] ?? "x")) j++;
		text += s[j] ?? "";
	}
	throw new Unreadable();
}
var Reader = class Reader extends WordReader {
	mode;
	base;
	found;
	docsEndAtEof;
	constructor(s, mode, base, found, docsEndAtEof = false) {
		super(s);
		this.mode = mode;
		this.base = base;
		this.found = found;
		this.docsEndAtEof = docsEndAtEof;
	}
	commands(from, inner) {
		const scan = {
			cur: "",
			start: from,
			atWord: true,
			word: 0,
			parens: 0,
			sawCase: false,
			pending: [],
			i: from
		};
		while (scan.i < this.s.length) {
			const closed = this.step(scan, inner);
			if (closed !== null) return closed;
		}
		if (inner) throw new Unreadable();
		this.flush(scan, scan.i);
		if (scan.pending.length > 0 && !this.docsEndAtEof) throw new Unreadable();
		return scan.i;
	}
	flush(scan, next) {
		scan.sawCase ||= CASE_START.test(scan.cur);
		this.found.push({
			start: this.base + scan.start,
			text: scan.cur
		});
		scan.cur = "";
		scan.start = next;
		scan.atWord = true;
	}
	step(scan, inner) {
		const s = this.s;
		const c = s.charAt(scan.i);
		if (c === "\\" && s[scan.i + 1] === "\n") scan.i += 2;
		else if (c === "#" && scan.atWord && this.mode.comments) {
			const nl = s.indexOf("\n", scan.i);
			scan.i = nl < 0 ? s.length : nl;
		} else if (s.startsWith("<<<", scan.i)) {
			scan.cur += "<<<";
			scan.i += 3;
			scan.atWord = true;
		} else if (s.startsWith("<<", scan.i)) {
			const h = heredocAt(s, scan.i);
			if (this.mode.heredocs !== "off") scan.pending.push(h.doc);
			scan.cur += s.slice(scan.i, h.end);
			scan.i = h.end;
			scan.atWord = true;
		} else if (c === " " || c === "	" || c === "<" || c === ">") {
			scan.cur += c;
			scan.i++;
			scan.atWord = true;
		} else if (c === "\n") {
			this.flush(scan, scan.i + 1);
			scan.i = scan.pending.length > 0 ? this.bodies(scan.i + 1, scan.pending.splice(0)) : scan.i + 1;
			scan.start = scan.i;
		} else if (c === ")" && scan.parens === 0 && inner) {
			this.flush(scan, scan.i);
			if (scan.pending.length > 0) throw new Unreadable();
			if (!scan.sawCase) return scan.i;
			scan.start = ++scan.i;
		} else this.word(scan);
		return null;
	}
	word(scan) {
		const s = this.s;
		const c = s.charAt(scan.i);
		if (c === "(" && s[scan.i + 1] === "(" && COMMAND_START.test(scan.cur)) {
			const [end, text] = this.arith(scan.i + 2, true);
			scan.cur += `((${text}))`;
			scan.i = end;
			scan.atWord = false;
		} else if (c === "(" && !scan.atWord && /^[A-Z_]\w*\+?=$/i.test(scan.cur.slice(scan.word)) && ASSIGNMENT_START.test(scan.cur.slice(0, scan.word))) {
			scan.i = this.arrayList(scan.i + 1);
			scan.cur += "\0";
		} else if (c === "(" || c === ")") {
			scan.parens = Math.max(0, scan.parens + (c === "(" ? 1 : -1));
			this.flush(scan, scan.i + 1);
			scan.i++;
		} else if (c === "&" && (scan.cur.endsWith(">") || scan.cur.endsWith("<") || s[scan.i + 1] === ">")) {
			scan.cur += c;
			scan.i++;
		} else if (c === ";" || c === "&" || c === "|") {
			this.flush(scan, scan.i + 1);
			scan.i++;
		} else if (c === "[" && !scan.atWord && /^[A-Z_]\w*$/i.test(scan.cur.slice(scan.word)) && ASSIGNMENT_START.test(scan.cur.slice(0, scan.word))) {
			const [end, text] = this.subscript(scan.i + 1);
			scan.cur += `[${text}]`;
			scan.i = end;
		} else {
			if (scan.atWord) {
				scan.word = scan.cur.length;
				scan.atWord = false;
			}
			const p = this.part(scan.i, false);
			scan.cur += p ? p[1] : c;
			scan.i = p ? p[0] : scan.i + 1;
		}
	}
	arrayList(i) {
		const s = this.s;
		for (let j = i; j < s.length;) {
			const c = s.charAt(j);
			if (c === ")") return j + 1;
			if ("(;&|<>".includes(c)) throw new Unreadable();
			if (c === "#" && this.mode.comments && /[ \t\n(]/.test(s[j - 1] ?? "")) {
				const nl = s.indexOf("\n", j);
				j = nl < 0 ? s.length : nl;
				continue;
			}
			const p = this.part(j, false);
			j = p ? p[0] : j + 1;
		}
		throw new Unreadable();
	}
	bodies(i, docs) {
		const s = this.s;
		for (const doc of docs) {
			const from = i;
			let to = -1;
			while (to < 0 && i < s.length) {
				const lineStart = i;
				let line = "";
				for (;;) {
					const nl = s.indexOf("\n", i);
					const piece = s.slice(i, nl < 0 ? s.length : nl);
					i = nl < 0 ? s.length : nl + 1;
					if (doc.quoted || nl < 0 || !/(?:^|[^\\])(?:\\\\)*\\$/.test(piece)) {
						line += piece;
						break;
					}
					line += piece.slice(0, -1);
				}
				if ((doc.strip ? line.replace(/^\t+/, "") : line) === doc.delim) to = lineStart;
			}
			if (!doc.quoted) new Reader(s.slice(from, to < 0 ? s.length : to), this.mode, this.base + from, this.found).body();
			if (to < 0 && !this.docsEndAtEof) throw new Unreadable();
		}
		return i;
	}
	body() {
		for (let i = 0; i < this.s.length;) {
			const c = this.s[i];
			const p = c === "\\" || c === "$" || c === "`" ? this.part(i, true) : null;
			i = p ? p[0] : i + 1;
		}
	}
	backquote(i) {
		let j = i + 1;
		while (j < this.s.length && this.s[j] !== "`") j += this.s[j] === "\\" ? 2 : 1;
		if (j >= this.s.length) throw new Unreadable();
		new Reader(this.s.slice(i + 1, j).replace(/\\([\\`$])/g, "$1"), this.mode, this.base + i + 1, this.found).commands(0, false);
		return j + 1;
	}
	comsub(i) {
		if (this.mode.heredocs !== "bash32") return this.commands(i, true) + 1;
		const end = new Reader(this.s, {
			...this.mode,
			heredocs: "off"
		}, this.base, []).commands(i, true);
		new Reader(this.s.slice(i, end), this.mode, this.base + i, this.found, true).commands(0, false);
		return end + 1;
	}
};
//#endregion
//#region src/segments.ts
const ASSIGNMENT_VALUE = String.raw`(?:[^\s'"\\]|\\[\s\S]|'[^']*'|"(?:[^"\\]|\\[\s\S])*")*`;
const LEADING_ASSIGNMENTS = new RegExp(String.raw`^(?:[A-Z_]\w*(?:\[[^\]]*\])?\+?=${ASSIGNMENT_VALUE}(?:\s+|$))+`, "i");
const ASSIGNMENT_WORD = /^[A-Z_]\w*(?:\[[^\]]*\])?\+?=/i;
const READINGS = [true, false].flatMap((comments) => [
	"on",
	"bash32",
	"off"
].map((heredocs) => ({
	comments,
	heredocs
})));
function read(cmd, mode) {
	const found = [];
	let complete = true;
	try {
		new Reader(cmd, mode, 0, found).commands(0, false);
	} catch (e) {
		if (!(e instanceof Unreadable || e instanceof RangeError)) throw e;
		complete = false;
	}
	return {
		segments: found.toSorted((a, b) => a.start - b.start).map((f) => f.text),
		complete
	};
}
/**
* Splits a command line into the simple commands bash would run, in source order: the parts of pipelines and
* `&&`/`||`/`;` lists, subshells, and the commands inside `$(…)` and backquotes, including those inside unquoted
* here-documents. Leading `NAME=value` assignments are dropped, expansions are removed, and whitespace is collapsed.
* Quoted here-document bodies and comments are data and yield nothing.
*
* When the line cannot be read to the end (an open quote, say), the commands found before that point are returned.
*
* @example
* commandSegments('FOO=1 pnpm lint && echo $(gh pr list) | cat') // ['pnpm lint', 'echo', 'gh pr list', 'cat']
*/
function commandSegments(cmd) {
	return read(cmd, {
		comments: true,
		heredocs: "on"
	}).segments.map((s) => s.replaceAll("\0", "").trim().replace(LEADING_ASSIGNMENTS, "").replace(/\s+/g, " ")).filter(Boolean);
}
const BRACE_EXPANSION = /^\{[^\s,]*,\S*\}|^\{[^\s,.]*\.\.\S*\}/;
const GLOB_START = /^(?:[*?]|\[\S+\])/;
function tokenize(seg) {
	const tokens = [];
	let cur = null;
	let q = null;
	let dropNext = false;
	function end() {
		if (cur !== null && !dropNext) tokens.push(cur);
		if (cur !== null) dropNext = false;
		cur = null;
	}
	for (let i = 0; i < seg.length; i++) {
		const c = seg.charAt(i);
		if (q) {
			if (c === q) q = null;
			else if (c === "\\" && q === "\"" && seg[i + 1] === "\n") i++;
			else if (c === "\\" && q === "\"" && i + 1 < seg.length) cur = (cur ?? "") + seg[++i];
			else cur = (cur ?? "") + c;
		} else if (c === "\"" || c === "'") {
			q = c;
			cur ??= "";
		} else if (c === "\\" && seg[i + 1] === "\n") i++;
		else if (c === "\\" && i + 1 < seg.length) cur = (cur ?? "") + seg[++i];
		else if (c === "{" && BRACE_EXPANSION.test(seg.slice(i))) cur = (cur ?? "") + "\0" + c;
		else if (GLOB_START.test(seg.slice(i))) cur = (cur ?? "") + "" + c;
		else if (/\s/.test(c)) end();
		else if (c === "<" || c === ">") {
			if (cur !== null && /^\d+$/.test(cur)) cur = null;
			end();
			while ("<>&|".includes(seg[i + 1] ?? " ")) i++;
			dropNext = true;
		} else cur = (cur ?? "") + c;
	}
	end();
	return tokens;
}
//#endregion
//#region src/wrappers.ts
const NONE = /* @__PURE__ */ new Set();
function opts(...names) {
	return new Set(names);
}
const WRAPPERS = {
	"arch": { opts: opts("-arch", "-e", "-d") },
	"builtin": { opts: NONE },
	"busybox": { opts: NONE },
	"caffeinate": { opts: opts("-t", "-w") },
	"chronic": { opts: NONE },
	"chroot": {
		opts: opts("--userspec", "--groups"),
		operands: 1
	},
	"chrt": {
		opts: opts("-T", "--sched-runtime", "-P", "--sched-period", "-D", "--sched-deadline"),
		operands: 1
	},
	"command": { opts: NONE },
	"dbus-launch": { opts: NONE },
	"doas": { opts: opts("-u", "-C") },
	"env": { opts: opts("-u", "--unset", "-C", "--chdir", "-a", "--argv0", "-P") },
	"exec": { opts: opts("-a") },
	"faketime": {
		opts: opts("-p", "--date-prog"),
		operands: 1
	},
	"firejail": { opts: NONE },
	"ionice": { opts: opts("-c", "--class", "-n", "--classdata", "-p", "--pid", "-P", "--pgid", "-u", "--uid") },
	"ltrace": { opts: opts("-a", "-A", "-D", "-e", "-F", "-l", "-n", "-o", "-p", "-s", "-u", "-w", "-x") },
	"nice": { opts: opts("-n", "--adjustment") },
	"nohup": { opts: NONE },
	"nsenter": { opts: opts("-t", "--target", "-S", "--setuid", "-G", "--setgid") },
	"pkexec": { opts: opts("--user") },
	"run0": { opts: opts("-u", "--user", "-g", "--group", "-D", "--chdir", "--nice", "--setenv", "--unit", "--property", "--description", "--slice", "--machine", "--background") },
	"setsid": { opts: NONE },
	"stdbuf": { opts: opts("-i", "--input", "-o", "--output", "-e", "--error") },
	"strace": { opts: opts("-a", "-b", "-e", "-E", "-I", "-o", "-O", "-p", "-P", "-s", "-S", "-u", "-U", "-X") },
	"sudo": { opts: opts("-u", "--user", "-g", "--group", "-h", "--host", "-p", "--prompt", "-C", "--close-from", "-D", "--chdir", "-R", "--chroot", "-r", "--role", "-t", "--type", "-T", "--command-timeout", "-U", "--other-user") },
	"systemd-run": { opts: opts("-u", "--unit", "-p", "--property", "--description", "--slice", "--service-type", "-E", "--setenv", "--uid", "--gid", "--nice", "-D", "--working-directory", "-M", "--machine", "-H", "--host", "--on-active", "--on-boot", "--on-startup", "--on-unit-active", "--on-unit-inactive", "--on-calendar", "--timer-property", "--path-property", "--socket-property") },
	"taskset": {
		opts: NONE,
		operands: 1
	},
	"time": { opts: opts("-f", "--format", "-o", "--output") },
	"timeout": {
		opts: opts("-s", "--signal", "-k", "--kill-after"),
		operands: 1
	},
	"toybox": { opts: NONE },
	"gtimeout": {
		opts: opts("-s", "--signal", "-k", "--kill-after"),
		operands: 1
	},
	"gnice": { opts: opts("-n", "--adjustment") },
	"gnohup": { opts: NONE },
	"gstdbuf": { opts: opts("-i", "--input", "-o", "--output", "-e", "--error") },
	"fakeroot": { opts: opts("-i", "-s", "-b", "--lib", "--faked") },
	"eatmydata": { opts: NONE },
	"sandbox-exec": { opts: opts("-f", "-n", "-p", "-D") },
	"unshare": { opts: opts("-S", "--setuid", "-G", "--setgid", "-R", "--root", "-w", "--wd", "--propagation", "--monotonic", "--boottime") },
	"unbuffer": { opts: NONE },
	"xvfb-run": { opts: opts("-e", "--error-file", "-f", "--auth-file", "-n", "--server-num", "-p", "--xauth-protocol", "-s", "--server-args", "-w", "--wait") },
	"-": {
		opts: NONE,
		zsh: true
	},
	"noglob": {
		opts: NONE,
		zsh: true
	},
	"nocorrect": {
		opts: NONE,
		zsh: true
	}
};
const XARGS_OPTS = opts("-a", "--arg-file", "-d", "--delimiter", "-E", "-I", "-L", "--max-lines", "-n", "--max-args", "-P", "--max-procs", "-s", "--max-chars", "--process-slot-var");
const GIT_OPTS = opts("-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env", "--super-prefix");
const SHELL_OPTS = opts("-o", "+o", "-O", "+O", "--rcfile", "--init-file");
const SSH_OPTS = opts("-B", "-b", "-c", "-D", "-E", "-e", "-F", "-I", "-i", "-J", "-L", "-l", "-m", "-O", "-o", "-p", "-Q", "-R", "-S", "-W", "-w");
const PARALLEL_OPTS = opts("-a", "--arg-file", "-C", "--colsep", "-d", "--delimiter", "-E", "-I", "-j", "--jobs", "-L", "-n", "--max-args", "-N", "-S", "--sshlogin", "--delay", "--halt", "--header", "--tagstring", "--sshloginfile", "--slf", "--load", "--nice", "--rpl", "--env", "--joblog", "--results", "--retries", "--timeout", "--tmpdir", "--workdir");
const WATCH_OPTS = opts("-n", "--interval", "-q", "--equexit");
const FLOCK_OPTS = opts("-w", "--wait", "--timeout", "-E", "--conflict-exit-code", "-c", "--command");
const AWK_OPTS = opts("-F", "-v", "-f", "-e", "--source", "-i", "--include");
const RUNNER_OPTS = opts("-p", "--package", "-w", "--workspace", "--registry", "--cache", "--prefix", "--userconfig", "--loglevel");
const RUNNER_SUBCOMMANDS = {
	pnpm: {
		opts: opts("-C", "--dir", "-F", "--filter", "--loglevel", "--reporter"),
		run: ["exec", "dlx"],
		shell: []
	},
	npm: {
		opts: opts("-w", "--workspace", "--prefix", "--loglevel", "--userconfig"),
		run: ["exec", "x"],
		shell: []
	},
	yarn: {
		opts: opts("--cwd"),
		run: ["dlx"],
		shell: ["exec"]
	},
	bun: {
		opts: opts("--cwd"),
		run: ["x"],
		shell: ["exec"]
	}
};
const RUNNERS = opts("npx", "pnpx", "bunx");
const SHELLS = opts("bash", "sh", "zsh", "dash", "ash", "ksh", "mksh", "fish", "csh", "tcsh");
const FIND_EXEC = opts("-exec", "-execdir", "-ok", "-okdir");
const FD_EXEC = opts("-x", "--exec", "-X", "--exec-batch");
const INTERPRETERS = {
	python: ["-c"],
	python2: ["-c"],
	python3: ["-c"],
	node: [
		"-e",
		"--eval",
		"-p",
		"--print"
	],
	nodejs: [
		"-e",
		"--eval",
		"-p",
		"--print"
	],
	bun: [
		"-e",
		"--eval",
		"-p",
		"--print"
	],
	perl: ["-e", "-E"],
	ruby: ["-e"],
	php: ["-r"],
	lua: ["-e"],
	osascript: ["-e"],
	Rscript: ["-e"]
};
const AWKS = opts("awk", "gawk", "mawk", "nawk");
const GIT_SCRIPT_OPTS = {
	"rebase": ["-x", "--exec"],
	"difftool": ["-x", "--extcmd"],
	"filter-branch": [
		"--env-filter",
		"--tree-filter",
		"--index-filter",
		"--parent-filter",
		"--msg-filter",
		"--commit-filter",
		"--tag-name-filter"
	]
};
const SCRIPT_OPTS = opts("-B", "--log-io", "-E", "--echo", "-F", "-I", "--log-in", "-m", "--logging-format", "-O", "--log-out", "-o", "--output-limit", "-T", "--log-timing", "-t");
const RUNUSER_OPTS = opts("-u", "--user", "-g", "--group", "-G", "--supp-group", "-s", "--shell", "-w", "--whitelist-environment");
//#endregion
//#region src/judge.ts
/**
* The reasons {@link deniedBy} returns when it cannot tell what a command runs, in place of a matched pattern.
*/
const DENY_REASONS = {
	expansion: "command word comes from an expansion",
	unbalanced: "unbalanced quoting",
	gitAlias: "git -c alias.*",
	stdinScript: "shell reads script from stdin",
	scriptFile: "shell runs a script file"
};
const BASH_READING = [{
	comments: true,
	heredocs: "on"
}];
const KEYWORDS = /* @__PURE__ */ new Set([
	"!",
	"{",
	"}",
	"if",
	"then",
	"do",
	"else",
	"elif",
	"while",
	"until"
]);
const PARALLEL_SEPARATOR = /^:{3,4}\+?$/;
const PARALLEL_REPLACEMENT = /\{[\d./#%]*\}/g;
const STDIN_FILE = /^(?:-|\/dev\/stdin|\/dev\/fd\/\d+|\/proc\/self\/fd\/\d+)$/;
function firstHit(items, judgeItem) {
	for (const item of items) {
		const hit = judgeItem(item);
		if (hit) return hit;
	}
	return null;
}
function needsArg(t, takesArg) {
	if (takesArg.has(t)) return true;
	if (t.startsWith("--") || t.length <= 2) return false;
	for (let j = 1; j < t.length; j++) if (takesArg.has(`${t[0]}${t[j]}`)) return j === t.length - 1;
	return false;
}
function skipOptions(tokens, from, takesArg, plus = false) {
	let i = from;
	const isOption = (t) => t.startsWith("-") || plus && t.startsWith("+");
	for (let t = tokens[i]; t !== void 0 && isOption(t); t = tokens[i]) {
		if (t === "--") return i + 1;
		i += needsArg(t, takesArg) ? 2 : 1;
	}
	return i;
}
function isLongOption(t, name) {
	const given = t.split("=", 1)[0] ?? "";
	return given.length >= 3 && name.startsWith(given);
}
function match(tokens, judge) {
	const line = tokens.join(" ").replaceAll("", "");
	const cut = line.indexOf("\0");
	const literal = cut < 0 ? line : line.slice(0, cut);
	const certain = (p) => literal === line && line === p || literal.startsWith(`${p} `);
	const possible = (p) => literal !== line && `${p} `.startsWith(literal);
	return judge.patterns.find((p) => certain(p) || judge.strict && possible(p)) ?? null;
}
function unknowable(judge, reason) {
	return judge.strict ? reason : null;
}
const MAX_DEPTH = 8;
const FLOCK_SCRIPT_OPTS = ["-c", "--command"];
function scriptVerdict(script, name, judge, depth) {
	return depth >= MAX_DEPTH ? unknowable(judge, name) : judgeCommand(script, judge, depth + 1);
}
function nestedScript(script, name, judge, depth) {
	return { verdict: scriptVerdict(script, name, judge, depth) };
}
function matchTokens(start, outer, depth) {
	let tokens = start;
	let judge = outer;
	while (tokens.length > 0) {
		const head = tokens[0];
		if (head === void 0) return null;
		const word = head.replaceAll("", "");
		const prefix = KEYWORDS.has(word) || ASSIGNMENT_WORD.test(word);
		if (!prefix && (head.includes("\0") || head.includes(""))) return unknowable(judge, DENY_REASONS.expansion);
		const hit = match(tokens, judge);
		if (hit) return hit;
		if (prefix) {
			if (!judge.gitAliasEnv && definesGitAliasEnv(word)) judge = {
				...judge,
				gitAliasEnv: true
			};
			tokens = tokens.slice(1);
			continue;
		}
		const next = unwrap(tokens, head, judge, depth);
		if ("verdict" in next) return next.verdict;
		tokens = next.tokens;
	}
	return null;
}
function unwrap(tokens, head, judge, depth) {
	const exe = head.slice(head.lastIndexOf("/") + 1);
	const wrapper = Object.hasOwn(WRAPPERS, exe) ? WRAPPERS[exe] : void 0;
	const runner = Object.hasOwn(RUNNER_SUBCOMMANDS, exe) ? RUNNER_SUBCOMMANDS[exe] : void 0;
	if (judge.strict && head.length > 1 && head.startsWith("=")) return { tokens: [head.slice(1), ...tokens.slice(1)] };
	if (exe !== head) return { tokens: [exe, ...tokens.slice(1)] };
	if (exe === "command" && tokens.slice(1, skipOptions(tokens, 1, NONE)).some((t) => /^-\w*v/i.test(t))) return { verdict: null };
	if (wrapper && (judge.strict || !wrapper.zsh)) {
		const end = skipOptions(tokens, 1, wrapper.opts) + (wrapper.operands ?? 0);
		return { tokens: (exe === "env" ? splitEnvString(tokens) : null) ?? tokens.slice(end) };
	}
	if (runner) {
		const at = skipOptions(tokens, 1, runner.opts);
		const subcommand = tokens[at] ?? "";
		if (runner.run.includes(subcommand)) return packageRunner(tokens, at + 1, judge, depth);
		if (runner.shell.includes(subcommand)) return nestedScript(tokens.slice(at + 1).join(" "), exe, judge, depth);
	}
	return unwrapProgram(tokens, exe, judge, depth);
}
function unwrapProgram(tokens, exe, judge, depth) {
	switch (exe) {
		case "coproc": return { tokens: tokens.slice(tokens[2] === "{" ? 2 : 1) };
		case "function": return { tokens: tokens.slice(2) };
		case "[[": return zshShortCondition(tokens, judge);
		case "xargs": return { tokens: xargs(tokens) };
		case "parallel": return parallel(tokens, judge, depth);
		case "watch": return watch(tokens, judge, depth);
		case "flock": return flock(tokens, judge, depth);
		case "find":
		case "fd": return { verdict: firstHit(execCommands(tokens, exe === "find" ? FIND_EXEC : FD_EXEC), (sub) => matchTokens(sub, judge, depth)) };
		case "eval": return nestedScript(tokens.slice(tokens[1] === "--" ? 2 : 1).join(" "), "eval", judge, depth);
		case "ssh": return ssh(tokens, judge, depth);
		case "script": return script(tokens, judge, depth);
		case "su":
		case "runuser": return switchUser(tokens, exe, judge, depth);
		case "trap": return trap(tokens, judge, depth);
		case "alias": return alias(tokens, judge, depth);
		case "source":
		case ".": return source(tokens, judge);
		case "git": return git(tokens, judge, depth);
		case "rm": return { verdict: rmByFlags(tokens, judge) };
	}
	if (RUNNERS.has(exe)) return packageRunner(tokens, 1, judge, depth);
	if (SHELLS.has(exe)) return shellScript(tokens, exe, judge, depth);
	const interpreter = Object.hasOwn(INTERPRETERS, exe) ? exe : exe.replace(/[\d.]+$/, "");
	if (Object.hasOwn(INTERPRETERS, interpreter) || AWKS.has(exe)) {
		const program = AWKS.has(exe) ? exe : interpreter;
		return { verdict: judge.strict ? firstHit(inlinePrograms(tokens, program), (p) => wordsMatch(p, judge)) : null };
	}
	return { verdict: null };
}
function zshShortCondition(tokens, judge) {
	const end = tokens.indexOf("]]");
	return judge.strict && end > 0 ? { tokens: tokens.slice(end + 1) } : { verdict: null };
}
function xargs(tokens) {
	const end = skipOptions(tokens, 1, XARGS_OPTS);
	const replace = replaceString(tokens.slice(1, end));
	const command = end < tokens.length ? tokens.slice(end) : ["echo"];
	return replace === null ? [...command, "\0"] : command.map((t) => t.replaceAll(replace, "\0"));
}
function replaceString(options) {
	let replace = null;
	for (let i = 0; i < options.length; i++) {
		const t = options[i] ?? "";
		if (t.startsWith("--")) {
			if (t === "--replace") replace = "{}";
			else if (t.startsWith("--replace=")) replace = t.slice(10);
			continue;
		}
		for (let j = 1; j < t.length; j++) {
			const letter = t[j] ?? "";
			const rest = t.slice(j + 1);
			if (letter === "I" || letter === "i") {
				replace = rest || (letter === "i" ? "{}" : options[++i] ?? null);
				break;
			}
			if (XARGS_OPTS.has(`-${letter}`)) {
				i += rest === "" ? 1 : 0;
				break;
			}
		}
	}
	return replace || null;
}
function parallel(tokens, judge, depth) {
	const end = skipOptions(tokens, 1, PARALLEL_OPTS);
	const separator = tokens.findIndex((t, i) => i >= end && PARALLEL_SEPARATOR.test(t));
	const command = tokens.slice(end, separator < 0 ? tokens.length : separator);
	if (command.length > 0) return nestedScript([...command, "\0"].join(" ").replace(PARALLEL_REPLACEMENT, "\0"), "parallel", judge, depth);
	if (separator < 0) return { verdict: unknowable(judge, DENY_REASONS.stdinScript) };
	if (tokens.some((t) => t.startsWith("::::"))) return { verdict: unknowable(judge, DENY_REASONS.scriptFile) };
	return { verdict: firstHit(tokens.slice(separator).filter((t) => !PARALLEL_SEPARATOR.test(t)), (input) => scriptVerdict(input, "parallel", judge, depth)) };
}
function ssh(tokens, judge, depth) {
	const afterHost = tokens.slice(skipOptions(tokens, 1, SSH_OPTS) + 1);
	const script = afterHost.slice(skipOptions(afterHost, 0, SSH_OPTS));
	return script.length === 0 ? { verdict: null } : nestedScript(script.join(" "), "ssh", judge, depth);
}
function script(tokens, judge, depth) {
	const scripts = optionValues(tokens, ["-c", "--command"]);
	if (scripts.length > 0) return { verdict: firstHit(scripts, (s) => scriptVerdict(s, "script", judge, depth)) };
	return { tokens: tokens.slice(skipOptions(tokens, 1, SCRIPT_OPTS) + 1) };
}
function switchUser(tokens, exe, judge, depth) {
	const scripts = optionValues(tokens, ["-c", "--command"]);
	if (scripts.length > 0) return { verdict: firstHit(scripts, (s) => scriptVerdict(s, exe, judge, depth)) };
	return exe === "runuser" ? { tokens: tokens.slice(skipOptions(tokens, 1, RUNUSER_OPTS)) } : { verdict: null };
}
function trap(tokens, judge, depth) {
	const at = tokens[1] === "--" ? 2 : 1;
	const action = tokens[at];
	if (!judge.strict || action === void 0 || action.startsWith("-") || tokens.length <= at + 1) return { verdict: null };
	return nestedScript(action, "trap", judge, depth);
}
function alias(tokens, judge, depth) {
	if (!judge.strict) return { verdict: null };
	return { verdict: firstHit(tokens.slice(1).filter((t) => t.includes("=")).map((t) => `${t.slice(t.indexOf("=") + 1)}  `), (value) => scriptVerdict(value, "alias", judge, depth)) };
}
function source(tokens, judge) {
	const file = tokens[tokens[1] === "--" ? 2 : 1];
	return { verdict: file === void 0 || STDIN_FILE.test(file) ? unknowable(judge, DENY_REASONS.stdinScript) : null };
}
function attachedAt(t, name) {
	if (t.startsWith(`${name}=`)) return name.length + 1;
	return !name.startsWith("--") && t.startsWith(name) && !/^-[a-z]+$/i.test(t) ? name.length : -1;
}
function optionValues(tokens, names) {
	const values = [];
	for (let i = 1; i < tokens.length; i++) {
		const t = tokens[i] ?? "";
		const name = names.find((n) => n.startsWith("--") ? t === n || t.startsWith(`${n}=`) : t === n || (/^-[a-z]+$/i.test(t) ? t.endsWith(n.charAt(1)) : t.startsWith(n)));
		if (name === void 0) continue;
		const attached = attachedAt(t, name);
		const value = attached < 0 ? tokens[++i] : t.slice(attached);
		if (value !== void 0) values.push(value);
	}
	return values;
}
function inlinePrograms(tokens, exe) {
	if (!AWKS.has(exe)) return optionValues(tokens, INTERPRETERS[exe] ?? []);
	const end = skipOptions(tokens, 1, AWK_OPTS);
	const program = tokens.slice(1, end).some((t) => t.startsWith("-f") || isLongOption(t, "--file")) ? [] : tokens.slice(end, end + 1);
	return [...optionValues(tokens.slice(0, end), ["-e", "--source"]), ...program];
}
function wordsMatch(program, judge) {
	const words = program.split(/[\s"'`,;()[\]{}|&$=<>]+/).filter(Boolean);
	const width = Math.max(0, ...judge.patterns.map((p) => p.split(" ").length)) + 1;
	const certain = {
		...judge,
		strict: false
	};
	for (let i = 0; i < words.length; i++) {
		const hit = match(words.slice(i, i + width), certain);
		if (hit) return hit;
	}
	return null;
}
function splitEnvString(tokens) {
	for (let i = 1; i < tokens.length; i++) {
		const t = tokens[i] ?? "";
		if (t === "--" || !t.startsWith("-")) return null;
		if (t.startsWith("--")) {
			if (isLongOption(t, "--split-string")) return splitEnvWords(t.includes("=") ? t.slice(t.indexOf("=") + 1) : tokens[i + 1], tokens.slice(t.includes("=") ? i + 1 : i + 2));
			i += t === "--unset" || t === "--chdir" ? 1 : 0;
			continue;
		}
		for (let j = 1; j < t.length; j++) {
			const letter = t[j];
			if (letter === "S") return splitEnvWords(j + 1 < t.length ? t.slice(j + 1) : tokens[i + 1], tokens.slice(j + 1 < t.length ? i + 1 : i + 2));
			if (letter === "u" || letter === "C") {
				i += j === t.length - 1 ? 1 : 0;
				break;
			}
		}
	}
	return null;
}
function splitEnvWords(value, rest) {
	return [
		"env",
		...tokenize((value ?? "").replace(/\$\{[^}]*\}/g, "\0")),
		...rest
	];
}
function packageRunner(tokens, from, judge, depth) {
	const end = skipOptions(tokens, from, RUNNER_OPTS);
	const options = tokens.slice(from, end);
	const call = options.find((t) => t.startsWith("--call="));
	if (call === void 0 && !options.some((t) => [
		"-c",
		"--call",
		"--shell-mode"
	].includes(t))) return { tokens: tokens.slice(end) };
	return nestedScript([...call === void 0 ? [] : [call.slice(7)], ...tokens.slice(end)].join(" "), tokens[0] ?? "", judge, depth);
}
function watch(tokens, judge, depth) {
	const end = skipOptions(tokens, 1, WATCH_OPTS);
	return tokens.slice(1, end).some((t) => t === "--exec" || /^-[a-z]*x/i.test(t)) ? { tokens: tokens.slice(end) } : nestedScript(tokens.slice(end).join(" "), "watch", judge, depth);
}
function flock(tokens, judge, depth) {
	const end = skipOptions(tokens, 1, FLOCK_OPTS);
	const rest = tokens.slice(end + 1);
	const trailing = rest[0]?.startsWith("-") ? optionValues(["flock", ...rest.slice(0, 2)], FLOCK_SCRIPT_OPTS) : [];
	const scripts = [...optionValues(tokens.slice(0, end), FLOCK_SCRIPT_OPTS), ...trailing];
	return scripts.length > 0 ? { verdict: firstHit(scripts, (script) => scriptVerdict(script, "flock", judge, depth)) } : { tokens: rest };
}
function execCommands(tokens, exec) {
	const commands = [];
	for (let i = 1; i < tokens.length; i++) {
		if (!exec.has(tokens[i] ?? "")) continue;
		let j = i + 1;
		while (j < tokens.length && tokens[j] !== ";" && !(tokens[j] === "+" && tokens[j - 1] === "{}")) j++;
		commands.push(tokens.slice(i + 1, j));
		i = j;
	}
	return commands;
}
function shellScript(tokens, exe, judge, depth) {
	const end = skipOptions(tokens, 1, SHELL_OPTS, true);
	const options = tokens.slice(1, end);
	const script = tokens[end];
	if (options.some((t) => /^-[abd-z]*c[a-z]*$/.test(t))) return script === void 0 ? { verdict: null } : nestedScript(script, exe, judge, depth);
	if (options.some((t) => t === "--version" || t === "--help")) return { verdict: null };
	if (script === void 0 || options.some((t) => /^-[a-z]+$/.test(t) && t.includes("s"))) return { verdict: unknowable(judge, DENY_REASONS.stdinScript) };
	return { verdict: unknowable(judge, DENY_REASONS.scriptFile) };
}
function git(tokens, judge, depth) {
	const subcommand = tokens[1] ?? "";
	if (subcommand.startsWith("-")) {
		const end = skipOptions(tokens, 1, GIT_OPTS);
		const globals = tokens.slice(1, end);
		if (definesGitAlias(globals)) return { verdict: unknowable(judge, DENY_REASONS.gitAlias) };
		const hit = firstHit(judge.strict ? configValues(globals) : [], (v) => scriptVerdict(v.replace(/^!/, ""), "git", judge, depth));
		return hit ? { verdict: hit } : { tokens: ["git", ...tokens.slice(end)] };
	}
	if (subcommand === "config" && tokens.some((t) => /^alias\./i.test(t))) return { verdict: unknowable(judge, DENY_REASONS.gitAlias) };
	if (subcommand === "bisect" && tokens[2] === "run") return { tokens: tokens.slice(3) };
	return { verdict: firstHit(gitScripts(tokens), (script) => scriptVerdict(script, "git", judge, depth)) ?? (judge.gitAliasEnv ? unknowable(judge, DENY_REASONS.gitAlias) : null) };
}
function configValues(globals) {
	return globals.flatMap((t, i) => {
		const pair = globals[i - 1] === "-c" ? t : /^-c./.test(t) ? t.slice(2) : "";
		return pair.includes("=") ? [pair.slice(pair.indexOf("=") + 1)] : [];
	});
}
function gitScripts(tokens) {
	const subcommand = tokens[1] ?? "";
	const foreach = subcommand === "submodule" ? tokens.indexOf("foreach") : -1;
	if (foreach > 0) return [tokens.slice(foreach + 1).filter((t) => t !== "--recursive").join(" ")];
	return Object.hasOwn(GIT_SCRIPT_OPTS, subcommand) ? optionValues(tokens, GIT_SCRIPT_OPTS[subcommand] ?? []) : [];
}
function definesGitAlias(globals) {
	return globals.some((t, i) => /^alias\./i.test(t) && ["-c", "--config-env"].includes(globals[i - 1] ?? "") || /^(?:--config-env=|-c)alias\./i.test(t));
}
function definesGitAliasEnv(assignment) {
	const key = /^GIT_CONFIG_KEY_\d+\+?=([\s\S]*)$/.exec(assignment)?.[1];
	return /^GIT_CONFIG_PARAMETERS\+?=/.test(assignment) || key !== void 0 && (/^alias\./i.test(key) || key.includes("\0"));
}
function rmByFlags(tokens, judge) {
	let recursive = false;
	let force = false;
	let options = true;
	const operands = [];
	for (const t of tokens.slice(1)) if (options && t === "--") options = false;
	else if (options && t.startsWith("--")) {
		recursive ||= isLongOption(t, "--recursive");
		force ||= isLongOption(t, "--force");
	} else if (options && t.startsWith("-") && t.length > 1) {
		recursive ||= /r/i.test(t);
		force ||= t.includes("f");
	} else operands.push(t.replace(/^\0\$(?:HOME|\{HOME\})(?=\/|$)/, "~"));
	const flags = `${recursive ? "r" : ""}${force ? "f" : ""}`;
	if (flags === "") return null;
	return firstHit(operands.flatMap((operand) => [
		operand,
		foldPath(operand),
		foldPath(resolveDots(operand))
	]), (operand) => match([
		"rm",
		`-${flags}`,
		operand
	], judge));
}
function resolveDots(path) {
	const [root = "", ...segments] = path.split("/");
	if (root !== "" && root !== "~") return path;
	const kept = [];
	for (const segment of segments) if (segment === "..") kept.pop();
	else if (segment !== "" && segment !== ".") kept.push(segment);
	return kept.length > 0 ? [root, ...kept].join("/") : root || "/";
}
function foldPath(path) {
	let folded = path.replace(/\/{2,}/g, "/").replace(/\/\.(?=\/)/g, "");
	for (let prev = ""; prev !== folded;) {
		prev = folded;
		folded = folded.replace(/(?<=.)\/$/, "").replace(/\/\.$/, "");
	}
	return folded || "/";
}
function quoteBlindMatch(cmd, judge) {
	for (const seg of cmd.split(/&&|\|\||[;|\n`)]|\$\(/)) {
		const hit = match(seg.trim().replace(LEADING_ASSIGNMENTS, "").split(/\s+/), judge);
		if (hit) return hit;
	}
	return null;
}
function judgeCommand(cmd, judge, depth) {
	const segments = /* @__PURE__ */ new Set();
	let complete = false;
	for (const mode of judge.strict ? READINGS : BASH_READING) {
		const r = read(cmd, mode);
		complete ||= r.complete;
		for (const seg of r.segments) segments.add(seg);
	}
	for (const seg of segments) {
		const hit = matchTokens(tokenize(seg), judge, depth);
		if (hit) return hit;
	}
	if (!judge.strict) return null;
	return quoteBlindMatch(cmd, judge) ?? quoteBlindMatch(cmd.replace(/\\\n/g, " "), judge) ?? (complete ? null : DENY_REASONS.unbalanced);
}
/**
* Decides whether a shell command may run under a deny-list, failing closed.
*
* Each pattern is a word prefix (`'git push'`, `'rm -rf /'`) matched against every command the line could run:
* each part of a pipeline or `&&`/`;` list, each `$(…)` and backquoted substitution, including those inside double
* quotes and unquoted here-documents, each script given to `bash -c`/`sh -c`/`eval`/`ssh`/`trap`/`git rebase -x`,
* and each command behind a wrapper such as `env` (and `env -S`), `sudo`, `nohup`, `timeout`, `nice`, `xargs`,
* `parallel`, `flock`, `watch`, `find -exec`, `npx`, `pnpm exec`, `busybox` or `git -C dir`. `rm` is matched by its
* flag set, so `rm -r -f /` matches `'rm -rf /'`. The inline program of `python -c`, `node -e` and similar is
* searched for a pattern's words.
*
* @param cmd - The command line, as a shell would receive it.
* @param deny - Word-prefix patterns to deny.
* @returns The first pattern matched; or one of {@link DENY_REASONS} (or the name of a wrapper nested too deep)
* when what the command runs cannot be known; or `null` when the command may run.
*
* @example
* deniedBy('FOO=1 sudo -u ci git push origin', ['git push']) // 'git push'
* deniedBy('grep "git push" notes.md', ['git push']) // null
* deniedBy('$TOOL push', ['git push']) // 'command word comes from an expansion'
*/
function deniedBy(cmd, deny) {
	return judgeCommand(cmd, {
		patterns: deny,
		strict: true
	}, 0);
}
/**
* Tells whether a shell command certainly runs a program or subcommand, as opposed to merely mentioning it in a
* quoted argument, a comment or a here-document body.
*
* It sees through the same wrappers and substitutions as {@link deniedBy} but reads the line as bash does and never
* guesses: an expansion that could become the command, or text it cannot parse, counts as not running it. Use it to
* decide whether a check applies to a command, not to enforce a deny-list.
*
* @param cmd - The command line, as a shell would receive it.
* @param command - One word-prefix pattern (`'git commit'`, `'gh pr create'`) or a list of them.
* @returns `true` when some command the line runs starts with one of the patterns.
*
* @example
* runsCommand('git add -A && git -C repo commit -m "x"', 'git commit') // true
* runsCommand('echo "then git commit"', 'git commit') // false
*/
function runsCommand(cmd, command) {
	return judgeCommand(cmd, {
		patterns: typeof command === "string" ? [command] : command,
		strict: false
	}, 0) !== null;
}
/**
* Builds a deny-list from {@link DEFAULT_DENY} followed by a policy's own patterns and any extra ones.
*
* @example
* effectiveDeny({ deny: ['docker'] }, ['kubectl delete']) // [...DEFAULT_DENY, 'docker', 'kubectl delete']
*/
function effectiveDeny(policy, extra = []) {
	return [
		...DEFAULT_DENY,
		...policy.deny,
		...extra
	];
}
//#endregion
export { DEFAULT_DENY, DENY_REASONS, commandSegments, deniedBy, effectiveDeny, runsCommand };
