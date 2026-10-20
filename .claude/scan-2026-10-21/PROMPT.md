# Full multi-agent scan of beauty-crm — night of 2026-10-20 → 2026-10-21

You are the **orchestrator** of a read-only, multi-agent scan of the whole beauty-crm repository at one
commit of `origin/main`. By **12:00 on 2026-10-21** the owner must have, in their hands, a verified and
prioritised picture of the project — architecture, code, correctness, security, performance,
operations, tests, gaps against the PRD, the plans and the market — and a concrete list of what to do
next. Read this file once, top to bottom, before your first tool call. You do not need to re-read the
lane briefs (§11): agents read their own.

**Assumptions the owner can override** (stated when this file was written):

- The deadline is 12:00 Warsaw time on 2026-10-21. Target delivery 09:30; hard stop 12:00.
- The scan is **read-only**. "Improve the project" means proposals — task lines, decisions, quick
  wins, ADR candidates — never edits, claims, commits, pushes or forge writes. Turning proposals into
  work is a later session's job, on the owner's word.
- All files are English (repository rule); the owner gets a Russian digest (`DIGEST.ru.md`) and a
  short Russian chat reply.
- Nothing is published as an Artifact by default: the report holds security findings. Offer it in
  one line at the end.
- Every agent runs on Opus 5.5 at `xhigh` (owner, 2026-10-20). More agents than the plan are allowed
  when the work needs them — a lane re-run, extra verify packs — as long as the cuts of §4 hold.
- The person running this session may not be the owner. "The owner" is the product owner who reads
  the result; "the operator" is whoever started this session. Tool steps that exist only in the
  Claude desktop app (keep-awake, SendUserFile, a memory directory) are done when the tool exists and
  skipped, with a line in `STATE.md`, when it does not.

---

## 1. Deliverables (all under `RUN/`)

| File | Content | Written by |
| --- | --- | --- |
| `REPORT.md` | executive summary, scorecard, top risks, themes and root causes, architecture recommendations and ADR candidates, optimizations, gap map, pilot readiness, strengths, roadmap, coverage | synthesis agent 1 |
| `owner-decisions.md` | ≤ 25 decisions with options, pros/cons, recommendation | synthesis agent 2 |
| `tasks-proposed.md` | milestone-format task lines in batches; closable-now; re-scope/merge | synthesis agent 2 |
| `quick-wins.md` | ≤ 30 confirmed S-size fixes, grouped into PR-sized batches | synthesis agent 2 |
| `final/findings.tsv` `final/findings.json` `final/dropped.tsv` `final/counts.json` | the verified list, by priority | `bin/scan.mjs apply` |
| `coverage.md` `metrics.md` `DIGEST.ru.md` `STATE.md` | coverage, aggregated lane metrics, Russian digest, run state | you |
| `lanes/<id>.json|.md`, `merged/*`, `verify/*` | raw lane output, merge, verdicts | agents |

Priority = S × C × R / E with S critical 8 · high 5 · medium 3 · low 1 · info 0; C proven 1 · high 0.85 ·
medium 0.6 · low 0.3; R stage pilot 1.5 · beta 1 · later 0.7; E effort S 1 · M 1.5 · L 2.5 · XL 4.

## 2. Hard rules — for you and every agent

1. **Read-only everywhere except `RUN/` and `SANDBOX`.** No edits in `WT` or in the main checkout
   `<REPO>` — other sessions work there, and its uncommitted files are
   theirs. No `git commit|push|checkout|reset|stash|rebase|merge` anywhere except the SANDBOX reset
   below; no `pnpm tasks claim|done|release|reopen|handoff`; no `gh` writes; no labels; no PRs.
2. **No contact with staging or production** (`urody.xyz` and subdomains, `151.115.46.168`, Scaleway
   consoles). No docker, wsl, terraform, ssh. Nothing that sends an SMS or an e-mail or calls a paid API.
3. **No installs or builds by agents.** You install and build once in Phase 0. Agents run at most
   targeted single-file unit tests that need no database.
4. **The repository's rules are those of `WT`**, not of the injected CLAUDE.md (the main checkout is
   behind `origin/main` and may still say `repograph`; at the scan commit the graph CLI is `zerograph`).
   Build configuration is never changed silently; `prd/02` is the only schema truth; third-party APIs
   are checked against official docs for the pinned version — agents cite URLs.
5. **Secrets** found by anyone are recorded as type + `path:line`, never the value.
6. **No silent caps.** Anything skipped, cut or unverified is counted and named in `coverage.md`.
7. **The session must run without permission prompts** (bypass or an equivalent mode). One prompt at
   02:00 stops the night.

## 3. Paths and environment

**Placeholders.** `<RUN>` is the absolute path of the folder holding this file, with forward slashes
(for example `C:/Users/you/beauty-crm/.claude/scan-2026-10-21`); the kit must sit at
`<checkout>/.claude/scan-2026-10-21/` of a beauty-crm clone, where `.gitignore` already ignores it.
`<REPO>`, `<WT>`, `<SHA>` are printed by Phase 0 step 0. Replace every placeholder with its literal value
in each command and in the args you pass — shell state does not persist between calls.

Every Bash block starts with `. <RUN>/bin/env.sh`. It sets:

| Var | Value | Use |
| --- | --- | --- |
| `REPO` | the top level of the clone holding `RUN` | main checkout — read nothing from its working tree, write nothing |
| `RUN` | the folder of this file (gitignored) | this file, `bin/`, briefs, context, all outputs |
| `WT` | `$REPO/.claude/worktrees/scan-2026-10-21` | detached worktree at `SHA`, read-only for agents |
| `SANDBOX` | `$REPO/.claude/worktrees/scan-2026-10-21-sandbox` | detached worktree at `SHA` where chain-1 lanes plant violations; reset after each proof |
| `SHA` | from `RUN/context/sha.txt` | the scanned commit (`origin/main` after Phase 0's fetch) |

Windows traps: Bash is Git Bash — `export MSYS_NO_PATHCONV=1` (in env.sh) or `git show origin/main:path`
breaks; forward slashes in paths; a foreground `sleep` is refused — timers run in the background (§6).
Linux works as is; macOS needs GNU `date` (`gdate`) for the timers.

Prerequisites on the machine: Claude Code with the Workflow tool and Opus 5.5; git with access to
`origin` (smaragdove-nebo/beauty-crm); node and pnpm at the versions the repository pins; about 15 GB
free disk for two worktrees with `node_modules`; `gh` authenticated for the repository (only lane D3
needs it — without it D3 works from the workflow files and says so).

`bin/scan.mjs` (pure node, no dependencies): `split` the briefs out of this file · `tasks` milestone
task lines → TSV · `check` lane files · `compact` lane findings → TSV · `merge` a map → `SCAN-###` list ·
`show` findings by id · `apply` verdicts → `final/`.

## 4. Timeline, cuts and stop files

Backward from the hard deadline. "Target" is the plan; "cut" is when you act.

| Phase | Target end | Cut | Action at the cut |
| --- | --- | --- | --- |
| 0 setup (you) | 22:45 | 23:30 | Ending after 23:30 → drop the chain tails I1 I2 F3 J2 K1 before launch; after 00:30 drop A2 too |
| 1 lanes (29 agents, 5 chains) | 03:45 | 05:15 | `touch RUN/STOP`: not-started lanes skip in one call, running ones write what they have (their preamble stops them at 05:15 anyway) |
| 2 merge (1) | 05:00 | 06:00 | Merge starting after 06:00 → `maxPacks: 10` |
| 3 verify (≤ 18 packs) | 07:00 | 07:45 | `touch RUN/STOP-VERIFY`: unverified findings go to the report labelled UNVERIFIED |
| 4 synthesis (2) | 09:00 | 09:30 | Not started by 09:30 → run the report agent only, then write `owner-decisions.md` and `quick-wins.md` yourself from `final/` |
| 5 delivery (you) | 09:30 | 11:30 | At 11:30 deliver whatever exists, with an honest `coverage.md` |

Timers wake you only if a phase hangs; normally a finished workflow re-invokes you. On every wake,
read `STATE.md` first.

## 5. Fleet arithmetic — print this before launch, in Russian, with the real start time

| Phase | Agents | Model · effort | Concurrency | Wall (est.) |
| --- | --- | --- | --- | --- |
| 1 lanes | 29, ≤ 50 min each | Opus 5.5 · xhigh | 5 chains | ≤ 5 h |
| 2 merge | 1 | Opus 5.5 · xhigh | 1 | ≈ 1 h |
| 3 verify | ≤ 18 packs × ≤ 8 findings (≤ 144) | Opus 5.5 · xhigh | 5 chains | ≈ 2 h |
| 4 synthesis | 2, sequential | Opus 5.5 · xhigh | 1 | 1.5–2 h |
| **Total** | **≤ 50 agents** (+ re-runs, §10) | | **≤ 5 at a time** | **≈ 10–10.5 h** |

Tokens, estimated: 15–25 M (lanes ≈ 70 %). Why five at a time and not more: on 2026-09-02 five or six
parallel Opus agents at `max` crashed the Claude Code process twice, and a 228 KB tool output did too.
`xhigh` is one step below `max`, so five is the ceiling and a crash drops it to three (§10); returns are
kept to a small summary object and everything else goes to files. Why one verifier per pack and no
critic stage: the verifier is a different agent from the finder (one independent vote on another
stage's artifact), and the owner reads the decisions themself.

## 6. Phase 0 — setup (inline, you)

0. **Paths.** `. <RUN>/bin/env.sh && echo "REPO=$REPO RUN=$RUN WT=$WT SANDBOX=$SANDBOX"` — from here
   on, put these literal values wherever this file says `<REPO>`, `<RUN>`, `<WT>`.
1. **Time and power.** `date '+%F %T'`. If `mcp__ccd_host__request_keep_awake` exists (load it with
   ToolSearch, `select:mcp__ccd_host__request_keep_awake`), keep the machine awake until 12:00;
   otherwise tell the operator to disable sleep until noon. Tell the operator in one line to pause
   Windows Update until noon if they have not.
2. **Worktrees at the latest `origin/main`:**
   ```bash
   . <RUN>/bin/env.sh
   git -C "$REPO" fetch origin --quiet
   mkdir -p "$RUN"/{context,lanes,merged,verify,final,scratch,args}
   git -C "$REPO" rev-parse origin/main > "$RUN/context/sha.txt"; SHA=$(cat "$RUN/context/sha.txt")
   for d in "$WT" "$SANDBOX"; do
     if [ -e "$d" ]; then echo "$d exists at $(git -C "$d" rev-parse HEAD) (want $SHA)"
     else git -C "$REPO" worktree add --detach "$d" "$SHA"; fi
   done
   git -C "$REPO" check-ignore -q "$WT" && echo "worktrees ignored" || echo "WARN: worktrees not ignored by the main checkout"
   ```
   An existing worktree at another SHA is one of these two paths from an earlier attempt: remove it
   with `git -C "$REPO" worktree remove --force <path>` and re-add. Touch no other worktree.
3. **Install WT** (foreground, timeout 600000): `pnpm -C "$WT" install --frozen-lockfile --prefer-offline`.
4. **SANDBOX in the background** (`run_in_background: true`) — the chain-1 lanes that use it start
   about 45 minutes after launch:
   ```bash
   . <RUN>/bin/env.sh
   if ( pnpm -C "$SANDBOX" install --frozen-lockfile --prefer-offline && pnpm -C "$SANDBOX" exec turbo run build --filter='./packages/*' ) > "$RUN/context/sandbox.log" 2>&1
   then echo ok > "$RUN/context/sandbox.ready"; else echo failed > "$RUN/context/sandbox.ready"; fi
   ```
5. **Warm the graph once** so concurrent readers can use `--stale`:
   `cd "$WT" && time pnpm exec zerograph ask "availability core FR-CAL-40" | head -n 40`. If the WT root
   CLAUDE.md names a different CLI or flags, use those and correct §11's preamble before splitting. If
   the graph will not run at all, `touch "$RUN/context/no-graph"`: agents then use `git grep` instead.
6. **Context files:**
   ```bash
   . <RUN>/bin/env.sh
   node "$RUN/bin/scan.mjs" tasks "$WT" "$RUN/context"
   (cd "$WT" && pnpm tasks report 2>&1 | head -c 30000) > "$RUN/context/tasks-report.txt"
   {
   echo "# Scan facts — generated $(date '+%F %T')"
   echo "SHA: $SHA — $(git -C "$WT" log -1 --format='%h %ad %s' --date=short)"
   echo "REPO (main checkout — never read its working tree, never write): $REPO"; echo "WT: $WT"; echo "RUN: $RUN"
   echo "SANDBOX: $SANDBOX — chain-1 lanes B2 E2 B4 only; ready flag: RUN/context/sandbox.ready"
   echo "Forge: smaragdove-nebo/beauty-crm · CI on self-hosted runners on the owner's PC · one PR on the forge at a time · squash-only main"
   echo "Test domain: urody.xyz (OQ-7, will change) — never contact it"
   echo; echo "## Workspaces — tracked source / test files"
   for d in apps/* packages/* mobile/* tools/*; do [ -d "$WT/$d" ] || continue
     all=$(git -C "$WT" ls-files "$d" | grep -E '\.(ts|tsx|kt|kts|mjs|js)$')
     t=$(printf '%s\n' "$all" | grep -c -E '(\.test\.|\.spec\.|/test/|/tests/|__tests__|/commonTest/)')
     s=$(( $(printf '%s\n' "$all" | grep -c .) - t )); echo "- $d: $s src, $t test"; done
   echo; echo "## API modules (tracked files)"
   for m in "$WT"/apps/api/src/modules/*/; do n=$(basename "$m"); printf '%s %s · ' "$n" "$(git -C "$WT" ls-files "apps/api/src/modules/$n" | wc -l)"; done; echo
   printf 'apps/api/src/shared: %s files\n' "$(git -C "$WT" ls-files apps/api/src/shared | wc -l)"
   echo; echo "## CI jobs in ci.yml"
   awk '/^jobs:/{j=1;next} j&&/^[^ #]/{j=0} j&&/^  [A-Za-z0-9_-]+:/{gsub(/[ :]/,"");printf "%s ",$0}' "$WT/.github/workflows/ci.yml"; echo
   echo; echo "## Workflows"; ls "$WT/.github/workflows" | tr '\n' ' '; echo
   echo; echo "## Gates"; ls "$WT/gates" | tr '\n' ' '; echo
   echo; echo "## ADRs ($(ls "$WT/docs/adr" | wc -l))"; ls "$WT/docs/adr" | tr '\n' ' '; echo
   echo; echo "## PRD"; ls "$WT/docs/prd-2026-08-16/prd" | tr '\n' ' '; echo
   echo; echo "## DB: $(ls "$WT/packages/db/migrations" | grep -c '\.sql$') migration .sql files · $(git -C "$WT" ls-files packages/db/src/schema | wc -l) schema files"
   echo; echo "## Toolchain"; node -e "const p=require(process.argv[1]);console.log(JSON.stringify({packageManager:p.packageManager,engines:p.engines,typescript:(p.devDependencies||{}).typescript,turbo:(p.devDependencies||{}).turbo}))" "$WT/package.json"
   echo; echo "## Tasks"; echo "open $(( $(wc -l < "$RUN/context/open-tasks.tsv") - 1 )) · done $(( $(wc -l < "$RUN/context/done-tasks.tsv") - 1 )) task lines (context/open-tasks.tsv, done-tasks.tsv: mid task stage title file); milestone summary in context/tasks-report.txt"
   echo; echo "## Last 40 commits on main"; git -C "$WT" log --oneline -n 40
   } > "$RUN/context/facts.md"
   node "$RUN/bin/scan.mjs" split "$RUN/PROMPT.md" "$RUN/briefs"
   wc -c "$RUN/context/facts.md"; ls "$RUN/briefs" | wc -l
   ```
   Expect 34 briefs (29 lanes + `_preamble`, `merge`, `verify`, `synth-architect`, `synth-planner`).
   Read `facts.md` once and fix anything obviously broken (it is every agent's orientation).
7. **Timers** — one background Bash per checkpoint (`run_in_background: true`), each
   `. …/env.sh; sleep $(( $(date -d '2026-10-21 05:15' +%s) - $(date +%s) )); echo TIMER 05:15` —
   for 05:15, 07:45, 09:30 and 11:30. If a background sleep is refused, use the Monitor tool with an
   until-loop on the clock.
8. **STATE.md** — create it:
   ```markdown
   # Scan state — SHA <sha>
   | Phase | Status | Started | Ended | Run id / script path | Notes |
   | 0 setup | done | | | | sandbox.ready=<pending/ok/failed> |
   | 1 lanes | running | | | | args: args/lanes.json |
   | 2–4 finish | pending | | | | args: args/finish.json |
   | 5 delivery | pending | | | | |
   ## Events
   ```
   Update it at every phase change, every wake and every recovery action — it is the only memory that
   survives a crash of this session.
9. **Print the fleet arithmetic (§5) in Russian with real times, then launch Phase 1.**

## 7. Phase 1 — lanes (Workflow A)

Save the args to `RUN/args/lanes.json` (fill `sha`), then call Workflow with the script below inline and
the same object as `args` (a JSON object, not a string). Lanes in a chain run one after another; the five
chains run in parallel. Chain 1 holds every SANDBOX lane (B2, E2, B4), so the SANDBOX is never shared.
Position in a chain is priority: a late cut loses the tail.

```json
{
  "run": "<RUN>",
  "wt": "<WT>",
  "sha": "<SHA>",
  "chains": [
    [{"id":"B1","effort":"xhigh"},{"id":"B2","effort":"xhigh"},{"id":"E2","effort":"xhigh"},{"id":"B4","effort":"xhigh"},{"id":"H2","effort":"xhigh"},{"id":"I1","effort":"xhigh"}],
    [{"id":"C1","effort":"xhigh"},{"id":"C2","effort":"xhigh"},{"id":"L1","effort":"xhigh"},{"id":"A3","effort":"xhigh"},{"id":"G1","effort":"xhigh"},{"id":"I2","effort":"xhigh"}],
    [{"id":"B3","effort":"xhigh"},{"id":"C3","effort":"xhigh"},{"id":"D1","effort":"xhigh"},{"id":"E1","effort":"xhigh"},{"id":"F2","effort":"xhigh"},{"id":"F3","effort":"xhigh"}],
    [{"id":"K2","effort":"xhigh"},{"id":"H1","effort":"xhigh"},{"id":"A1","effort":"xhigh"},{"id":"D3","effort":"xhigh"},{"id":"D2","effort":"xhigh"},{"id":"J2","effort":"xhigh"}],
    [{"id":"J1","effort":"xhigh"},{"id":"M1","effort":"xhigh"},{"id":"F1","effort":"xhigh"},{"id":"A2","effort":"xhigh"},{"id":"K1","effort":"xhigh"}]
  ]
}
```

| Lane | Area | Lane | Area |
| --- | --- | --- | --- |
| C1 | security: authn, authz, tenancy, RLS | E1 | test quality, FR traceability |
| C2 | input, integrations, secrets, supply chain | D3 | CI/CD speed, developer loop |
| C3 | privacy, GDPR, PL/EU legal | H2 | ops, observability, deploy, `urody.xyz` table |
| B1 | schema truth prd/02 ↔ DB ↔ contracts | G1 | mobile Kotlin core, sync |
| B2 | money, VAT, fiscal, time (SANDBOX) | F2 | public booking site: funnel, SEO, a11y |
| B3 | calendar and availability | D2 | frontend performance |
| B4 | constitution INV, conformance (SANDBOX) | F1 | panel UX, a11y, i18n |
| E2 | gates that look armed (SANDBOX) | M1 | dependencies, toolchain |
| L1 | reliability, concurrency | J1 | plans vs reality |
| D1 | DB performance | A2 | ADR drift |
| H1 | migrations, data lifecycle | I1 / I2 | backend / frontend code quality |
| A1 | workspace and module boundaries | F3 | UI kit, design system |
| A3 | API surface, contracts | J2 | docs, agent tooling, hygiene |
| K2 | pilot launch readiness | K1 | product gaps vs PL market (web) |

```js
export const meta = {
  name: 'scan-lanes',
  description: 'Read-only full-repo scan of beauty-crm: one agent per lane brief, five chains in parallel, lanes in a chain in turn',
  phases: [{ title: 'Scan' }],
}
const { run: RUN, wt: WT, sha: SHA, chains: CHAINS } = args
const N = { type: 'integer' }
const SUMMARY = {
  type: 'object',
  properties: {
    lane: { type: 'string' },
    file: { type: 'string' },
    findings: N,
    by_severity: { type: 'object', properties: { critical: N, high: N, medium: N, low: N, info: N }, required: ['critical', 'high', 'medium', 'low', 'info'] },
    top: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    coverage_gaps: { type: 'string' },
  },
  required: ['lane', 'file', 'findings', 'by_severity', 'top', 'coverage_gaps'],
}
const prompt = (l) => [
  'beauty-crm full scan — lane agent.',
  `Scan worktree (read-only, detached at ${SHA}): ${WT}`,
  `Run directory (write only here): ${RUN}`,
  `Read ${RUN}/briefs/_preamble.md fully, then ${RUN}/context/facts.md, then your lane brief.`,
  `Write the full result to ${RUN}/lanes/<lane>.json and ${RUN}/lanes/<lane>.md as the preamble specifies; return only the summary object.`,
  `Your lane: ${l.id} — brief at ${RUN}/briefs/${l.id}.md`,
].join('\n')
phase('Scan')
const chains = await parallel(CHAINS.map((chain) => async () => {
  const out = []
  for (const l of chain) {
    const r = await agent(prompt(l), { label: `lane:${l.id}`, phase: 'Scan', schema: SUMMARY, effort: l.effort })
    out.push(r || { lane: l.id, failed: true })
    log(`${l.id}: ${r ? `${r.findings} findings (${r.by_severity.critical} crit, ${r.by_severity.high} high)` : 'FAILED'}`)
  }
  return out
}))
return chains.filter(Boolean).flat()
```

Record the run id and the persisted script path in `STATE.md`. Then stop and wait: the workflow
re-invokes you when it ends; a timer re-invokes you if it hangs.

## 8. Phases 2–4 — merge, verify, synthesis (Workflow B)

When Workflow A ends (or after the 05:15 cut): `node "$RUN/bin/scan.mjs" check "$RUN"`. Missing or
invalid lanes with time left before 05:15 → recovery (§10), otherwise they become coverage gaps. Then
save `RUN/args/finish.json` and launch:

```json
{ "run": "<RUN>", "wt": "<WT>", "sha": "<SHA>", "conc": 5, "maxPacks": 18 }
```

```js
export const meta = {
  name: 'scan-finish',
  description: 'Merge lane findings, verify them in area packs, write the report, task proposals and owner decisions',
  phases: [{ title: 'Merge' }, { title: 'Verify' }, { title: 'Synthesis' }],
}
const { run: RUN, wt: WT, sha: SHA, conc: CONC, maxPacks: MAXP } = args
const N = { type: 'integer' }
const PACKS = {
  type: 'object',
  properties: {
    merged: N, verify_queue: N, unverified: N,
    packs: { type: 'array', maxItems: 18, items: { type: 'object', properties: { id: { type: 'string' }, area: { type: 'string' }, scan_ids: { type: 'array', items: { type: 'string' }, maxItems: 8 } }, required: ['id', 'area', 'scan_ids'] } },
  },
  required: ['merged', 'verify_queue', 'unverified', 'packs'],
}
const VERDICTS = {
  type: 'object',
  properties: {
    pack: { type: 'string' }, file: { type: 'string' },
    counts: { type: 'object', properties: { confirmed: N, adjusted: N, known: N, decided: N, refuted: N, uncertain: N }, required: ['confirmed', 'adjusted', 'known', 'decided', 'refuted', 'uncertain'] },
  },
  required: ['pack', 'file', 'counts'],
}
const FILES = { type: 'object', properties: { files: { type: 'array', items: { type: 'string' } }, note: { type: 'string' } }, required: ['files', 'note'] }
const head = (role) => [
  `beauty-crm full scan — ${role}.`,
  `Scan worktree (read-only, detached at ${SHA}): ${WT}`,
  `Run directory (write only here): ${RUN}`,
  `Read ${RUN}/briefs/_preamble.md (section A; section B for the rubric and the known-state method), then ${RUN}/context/facts.md.`,
]
phase('Merge')
const m = await agent([...head('merge agent'), `Your brief: ${RUN}/briefs/merge.md`].join('\n'), { label: 'merge', phase: 'Merge', schema: PACKS, effort: 'xhigh' })
if (!m) return { failed: 'merge' }
const packs = m.packs.slice(0, MAXP)
log(`merged ${m.merged}; verifying ${packs.reduce((s, p) => s + p.scan_ids.length, 0)} in ${packs.length} packs; ${m.unverified} unverified${m.packs.length > MAXP ? `; ${m.packs.length - MAXP} packs cut by maxPacks` : ''}`)
phase('Verify')
const chains = Array.from({ length: CONC }, (_, c) => packs.filter((_, i) => i % CONC === c))
const verdicts = (await parallel(chains.map((chain) => async () => {
  const out = []
  for (const p of chain) {
    const r = await agent([...head('verify agent'), `Your brief: ${RUN}/briefs/verify.md`, `Your pack: ${p.id} (${p.area}) — ${p.scan_ids.join(' ')}`].join('\n'), { label: `verify:${p.id}`, phase: 'Verify', schema: VERDICTS, effort: 'xhigh' })
    out.push(r || { pack: p.id, failed: true })
  }
  return out
}))).filter(Boolean).flat()
log(`verified packs: ${verdicts.filter((v) => !v.failed).length}/${packs.length}`)
phase('Synthesis')
const report = await agent([...head('synthesis agent 1 (report)'), `Your brief: ${RUN}/briefs/synth-architect.md`].join('\n'), { label: 'synth:report', phase: 'Synthesis', schema: FILES, effort: 'xhigh' })
const plan = await agent([...head('synthesis agent 2 (tasks and decisions)'), `Your brief: ${RUN}/briefs/synth-planner.md`].join('\n'), { label: 'synth:plan', phase: 'Synthesis', schema: FILES, effort: 'xhigh' })
return { merge: { merged: m.merged, verify_queue: m.verify_queue, unverified: m.unverified, packs: packs.length }, verdicts, report, plan }
```

## 9. Phase 5 — delivery (inline, you)

1. All deliverables of §1 exist; `final/counts.json` numbers match what `REPORT.md` states (spot-check
   the executive summary and the scorecard).
2. Re-read 10 citations from the top risks at SHA (`sed -n '<l-3>,<l+3>p' "$WT/<path>"`): the quote
   is there and says what the report claims. A wrong citation → fix the report and note it in `STATE.md`.
3. `coverage.md`: lanes ok / skipped / failed and each lane's `coverage_gaps`; findings by status
   (from `final/counts.json`); what no lane covered; method limits (no database, no builds, no staging).
4. `metrics.md`: the lanes' `metrics` objects, one section per lane, numbers only.
5. `DIGEST.ru.md` (Russian, ≤ 60 lines): state of the project in 5 lines, top 10 risks one line each,
   pilot readiness, the decisions the owner must take first, the first batch to start, links to files.
6. If SendUserFile exists: send `REPORT.md`, `owner-decisions.md`, `DIGEST.ru.md` (`status: proactive`).
   Either way, zip the deliverables of §1 (without `lanes/`, `scratch/`, `briefs/`) into
   `RUN/scan-result-2026-10-21.zip` so the operator can hand them to the owner in one file.
7. `git -C "$REPO" worktree remove --force "$SANDBOX"`. Keep `WT` (the owner may read code at SHA).
8. If this session has a memory directory, save a project memory `scan-2026-10-21.md` (pointer to
   `RUN`, SHA, counts, top 3 decisions) and its line in `MEMORY.md`.
9. Chat reply in Russian, starting with the operator's name if the repository's CLAUDE.md asks for it,
   ≤ 30 lines: the result, the counts, the first decisions, where the files are (and the zip); one line
   offering to publish the report as a private Artifact.

## 10. Recovery

Write every action into `STATE.md` → Events.

| Symptom | Action |
| --- | --- |
| Workflow A ended, lanes missing or invalid | `scan.mjs check`. Before 05:15: relaunch Workflow A (new run, same script) with chains holding only the missing lanes — keep B2/E2/B4 in one chain; after a crash use ≤ 3 chains. A lane failing twice is a coverage gap |
| An agent "returned" but its file is missing | Read `journal.jsonl` in the workflow's transcript directory; treat as failed |
| Lane JSON invalid | Repair inline if trivial (trailing comma, truncation at the end); else relaunch the lane if time allows; else mark it md-only for the merge |
| The desktop process or this session crashed | On restart read `STATE.md`; `scan.mjs check`; continue from the first phase not done. Resume a workflow with `{scriptPath, resumeFromRunId}` and the same args only if the script is unchanged; otherwise relaunch only what is missing |
| Workflow B died in merge | Relaunch Workflow B (same args) |
| Workflow B died in verify or synthesis | Resume it (`scriptPath`, `resumeFromRunId`, same args): merge and finished verifies come from cache |
| Synthesis agent 1 failed, 2 succeeded | Resume; if it fails again, write a short `REPORT.md` yourself from `final/` and `merged/themes.md`, and say so in the digest |
| Rate-limit errors kill many agents at once | Wait 15 minutes, relaunch with half the concurrency (`conc: 2`, or two chains) |
| Weekly usage near its limit (`mcp__ccd_session_mgmt__get_usage` > 90 %, where it exists) | Launch no new phase; deliver what exists; tell the operator |
| Time is left and a lane's coverage gap is large | Allowed (owner, 2026-10-20): before 05:15, one more lane agent on the gap, same brief plus a "Focus:" line naming the gap, writing `lanes/<id>b.json` and `.md`; `check` does not expect it, `compact` and `merge` pick it up |
| A timer fires and the phase is still running | Read the journal: agents still progressing → apply the §4 cut (stop file); nothing for 30 min → `TaskStop` the workflow and continue with what is on disk |

---

## 11. Briefs

Split into `RUN/briefs/<id>.md` by `bin/scan.mjs split`. Each block starts with a `brief:<id>` HTML
comment at the beginning of a line and ends with a `/brief` comment.

<!-- brief:_preamble -->
# Scan preamble — read fully before your brief

## A. Rules for every agent of this scan

You are one agent of a read-only, multi-agent scan of the beauty-crm monorepo at one commit (SHA). The
owner reads the result in the morning and decides what to do. Nothing you do may change the repository,
the forge, staging or any external system.

1. **Paths.** Read code only in WT. Write only under RUN, only the files your brief names, plus scratch
   under `RUN/scratch/<your id>/`. Never read the working tree of the main checkout (REPO in
   `RUN/context/facts.md`) and never write there — other sessions work there. SANDBOX is writable
   only for the lanes whose brief says so.
2. **The repository's rules are WT's.** Read `WT/CLAUDE.md` and `WT/.claude/CLAUDE.md` once at the
   start. The CLAUDE.md injected into your context comes from the main checkout and may be stale (it may
   say `repograph`; at SHA the graph CLI is `zerograph`). Your final message is data, not a chat reply:
   no greeting, no name, no narration.
3. **Forbidden:** `pnpm install|add|update|remove`; full builds; full test suites; `pnpm verify`;
   `pnpm tasks claim|done|release|reopen|handoff` (read-only `report` is fine); docker, wsl, terraform,
   ssh, scp; `gh` writes (pr/issue create/edit/comment/merge, workflow run, label, `api` with
   POST/PATCH/PUT/DELETE); `git commit|push|checkout|switch|reset|stash|clean|rebase|merge|worktree`
   (except the SANDBOX reset your brief names); any request to staging or production (`urody.xyz` and its
   subdomains, `151.115.46.168`, Scaleway consoles); anything that sends an SMS or an e-mail or calls a
   paid API; memory files under `~/.claude`.
4. **Allowed:** reading files; read-only git (`git -C WT grep|log|show|blame|ls-files|diff`); zerograph
   in WT with `--stale` (the index was warmed once; `--stale` stops concurrent readers from
   rebuilding it) — `pnpm exec zerograph ask "<words with an id anchor>" --stale`, `impact <Symbol>
   --depth 1 --stale`, `trace <A> <B> --stale`, `explain <id> --stale` (if `RUN/context/no-graph`
   exists, use `git grep` instead and say so in coverage); node scripts you write in
   `RUN/scratch/<id>/` that only read; existing unit test files that need no database or docker —
   `pnpm -C WT --filter <pkg> exec vitest run <file>`, at most 5 per agent, ≤ 3 minutes each; read-only
   `gh` when your brief says so; WebSearch/WebFetch for official documentation, standards, laws and
   competitor pages.
5. **Bounded output.** Bound every command that can print a lot (`| head -n 200`, `| head -c 20000`,
   counts first). Exclude generated and archival trees unless your brief owns them: `node_modules`,
   `.turbo`, `dist`, `.next`, `coverage`, `.zerograph`, `graphify-out`, `research`, `.agents`,
   `prototype`. `graphify-out/` is tracked (≈ 2.4k files): `git -C WT grep … -- . ':!graphify-out'
   ':!research' ':!.agents' ':!prototype'`; ripgrep: `--glob '!graphify-out/**' --glob '!research/**'
   --glob '!.agents/**' --glob '!prototype/**'`.
6. **Secrets.** A credential, key or token you see is recorded as type + `path:line` only — never the
   value, not even partly. A live secret in the tree is critical.
7. **Third-party behaviour** (a library, framework, CLI, cloud service, standard or law) is backed by its
   official documentation for the version WT pins (read the pin from package.json, the lockfile or the
   gradle catalog): put the URL in `evidence` with `path` = the URL and `line` = 0. Without a URL the
   confidence is at most `low`.
8. **Time.** `date '+%F %T'` at the start; check it between checks. Your brief gives your budget (wall
   time). At 80 % of it stop exploring and write. Absolute stops: lanes **2026-10-21 05:15**, verifiers
   **07:45**. If `RUN/STOP` (lanes) or `RUN/STOP-VERIFY` (verifiers) exists when you start, write
   `RUN/lanes/<id>.skipped` (or `RUN/verify/<pack>.skipped`) containing `skipped: STOP`, return the
   summary with zeros and stop; if it appears while you work, write what you have and return.
9. **Shell.** Bash is Git Bash on Windows: `export MSYS_NO_PATHCONV=1` before `git show <rev>:<path>`;
   forward slashes; `cd "$WT"` before zerograph.
10. **Evidence discipline.** Every `path:line` you cite you have read yourself at SHA, and its `quote`
    is copied from that line (≤ 160 characters). Never cite from memory, from a document's description
    of the code, or from another agent's output.

## B. Lane agents — method and output

### Known state first: this repository is decision-dense
Earlier audits found most "open problems" already decided in a PRD file, parked by an owner ruling, or
tracked as a task. A finding that restates a tracked task costs the owner time. Before you record a gap
or a risk, check (≤ 2 minutes per finding):
1. `grep -i '<keyword>' RUN/context/open-tasks.tsv RUN/context/done-tasks.tsv | head` — milestone task
   lines (`mid task stage title file`).
2. `git -C WT grep -n -i '<keyword>' -- docs/prd-2026-08-16/prd/OPEN-POINTS.md docs/prd-2026-08-16/plans docs/adr docs/gates/required-checks.md | head -n 30`
   — open points, owner rulings in plan files, ADRs, parked CI jobs.
3. `pnpm exec zerograph ask "<anchor words>" --stale` in WT, anchored with an id (`FR-CAL-40`,
   `BE-M17`, `INV-07`) or a symbol.
4. `git -C WT log --oneline -i --grep '<keyword>' -n 20`.

Then set `known.status`: `new` · `known` (a task or open point tracks it — cite ids) · `partially-known`
(tracked, but the tracker misses part — say which) · `decided-accepted` (a decision accepted it; record
it only as `type: decision-challenge`, with evidence that the decision's premise is false now).

### Severity rubric (this product)
- **critical** — a salon reads or writes another salon's data; an authentication or authorization
  bypass; a live secret in the tree; a money, VAT or fiscal amount wrong on a document a client or the
  tax office receives; data loss or unrecoverable corruption; a legal breach with regulator exposure
  (special-category data, consent bypass, unlawful transfer); a pilot-blocking defect on the core booking
  path with no workaround.
- **high** — wrong behaviour a salon or a client hits in normal use (double booking, a wrong slot, a lost
  or duplicated notification, a wrong price shown, staff seeing what their role forbids); an invariant
  whose test does not test it; a gate that is green but cannot go red; a migration that locks a hot table
  or cannot be undone without a plan; an outage path without an alert.
- **medium** — an edge-case correctness defect; a measurable performance problem on realistic data; an
  FR with logic and no test; a WCAG 2.1 AA failure on a core screen; a maintainability problem that slows
  every change in an area.
- **low** — hygiene, naming, local duplication, doc drift without behavioural consequence.
- **info** — an observation or a metric worth the owner's attention.

**Confidence:** `proven` — reproduced by a command or a test, output summarised in `proof` · `high` —
traced in code end to end, all relevant branches read · `medium` — strong evidence, a path unread (name
it) · `low` — suspicion; say what would confirm it.
**Stage:** `pilot` — on the path of `docs/testing/alpha-script.md` or of a pilot salon's daily use ·
`beta` · `later`.
**Type:** `defect` · `gap` (specified or necessary, absent) · `risk` (works now, breaks under named
conditions) · `improvement` · `optimization` · `decision-challenge`.
**Category** (one): security, tenancy, privacy, legal, money, time, calendar, schema, api, contracts,
reliability, concurrency, performance, db, migrations, tests, gates, ci, ops, observability, mobile,
sync, ux, a11y, i18n, seo, frontend, backend, architecture, deps, docs, plans, product, dx.
**Effort of the fix:** S ≤ ½ day · M ≤ 2 days · L ≤ 1 week · XL more.

### What a good finding looks like
- One root cause per finding; the same cause in two places is one finding with two evidence entries.
- `scenario` is concrete — who does what, with which input, and what goes wrong. Not "could be insecure".
- `fix` is a direction a developer can start from (≤ 8 lines) and respects the repository's hard rules:
  build configuration (`packages/config/`, `turbo.json`, root `package.json`) changes only on explicit
  request — write "build-config: needs owner request"; a new entity, field, enum member or status is a
  `prd/02` change first — "PRD 02 first"; a new dependency needs owner approval — "new dependency: owner
  approval".
- `blast_radius` for a fix that changes a symbol: `pnpm exec zerograph impact <Symbol> --depth 1 --stale`
  → "N callers / M files / RISK". Otherwise "local".
- Outside your lane: record only high or critical, with `"foreign": "<owning lane id>"`, at most 3.
- Caps: ≤ 25 findings of type defect/gap/risk/decision-challenge and ≤ 10 of type
  improvement/optimization. Beyond that, keep the highest-priority ones and list the rest one line each
  under "Overflow" in your `.md`.
- Strengths go to `metrics.strengths` (≤ 5 one-liners), not into findings.

### Output files
`RUN/lanes/<id>.json` (≤ 150 KB), exactly this shape — finding ids are `<lane>-NN`:
```json
{
  "lane": "C1",
  "sha": "<SHA>",
  "started": "2026-10-20 22:31:05",
  "finished": "2026-10-20 23:24:40",
  "coverage": { "read": ["apps/api/src/shared/rbac (all)"], "not_covered": "what you did not reach and why" },
  "metrics": { "strengths": ["..."], "routes_total": 0 },
  "findings": [
    {
      "id": "C1-01",
      "title": "states the defect, not the area (≤ 100 chars)",
      "category": "tenancy",
      "severity": "high",
      "confidence": "high",
      "type": "defect",
      "stage": "pilot",
      "evidence": [{ "path": "apps/api/src/modules/x/y.ts", "line": 42, "quote": "exact text of the line" }],
      "scenario": "who, which input, what goes wrong",
      "impact": "the consequence for the salon, the client or the platform",
      "refs": ["FR-CAL-40", "INV-07", "ADR-012", "BE-M14-T11"],
      "known": { "status": "new", "ids": [], "note": "" },
      "proof": "command and observed result, or empty",
      "fix": "direction, ≤ 8 lines",
      "effort": "M",
      "blast_radius": "fnX: 7 callers / 4 files / MEDIUM",
      "owner_decision": "the question, if the fix needs one; else empty",
      "foreign": ""
    }
  ],
  "questions": ["questions for the owner that are not findings"]
}
```
Write it with the Write tool or a node script, then validate:
`node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" RUN/lanes/<id>.json`. Invalid
JSON loses the whole lane.

`RUN/lanes/<id>.md` (≤ 12 KB): `# <id> — <title>` · SHA, started–finished · **Verdict** (3–5 lines on the
state of the area) · **Top findings** (≤ 5, one line each: id, severity, title, path:line) · **Metrics** ·
**Coverage** · **Questions for the owner** · **Overflow**.

### Return
Only the summary object the schema asks for: `lane`, `file` (the .json path), `findings` (count),
`by_severity`, `top` (≤ 5 one-liners), `coverage_gaps` (one sentence).
<!-- /brief -->

<!-- brief:C1 -->
# C1 — Security: authentication, authorization, tenant isolation, RLS
Effort xhigh · chain 2 · budget 50 min

**Question:** can any actor — an anonymous visitor, a client, staff of another salon, staff with a lower
role, a platform operator, a mobile device — read or change data they must not?

**Read first:** `docs/security/threat-model.md`, `docs/security/service-role-review.md`;
`docs/prd-2026-08-16/prd/01-vision-and-roles.md` (permission catalogue FR-VIS-31) and
`12-security-prereqs.md`; the tenancy and permission rows of `docs/constitution.yaml`;
`apps/api/route-exemptions.json`, `system-pool.json`, `contact-reads.json`, `audit-coverage.json`;
`packages/db/src/tenancy.ts`, `packages/db/rls-exceptions.json`; `apps/api/src/shared/{rbac,context}`.

**Checks**
1. Route → guard: enumerate every controller route and the guard or permission key on it. Every
   unguarded route must be in `route-exemptions.json` with a reason that still holds. Report exempt
   routes without a valid reason and keys absent from FR-VIS-31.
2. Tenant scoping: how the salon (and location — multi-location) context enters a request; where it can
   come from client input instead of the session; queries taking a salon/location/client id from input
   without a membership check (IDOR). Sample ≥ 25 handlers across clients, availability, sales, catalog,
   staff, notifications, renter, reviews, sync, devices.
3. RLS: every tenant table has a policy (tables in `packages/db/src/schema` vs policies in migrations and
   `packages/db/sql`); exceptions justified; the role the API connects as; every use of the system pool
   or a bypass role and whether its caller re-checks tenancy. Are `service-role-review.md`'s fixes in code?
4. Authentication: staff sign-in (OTP, passkeys if present, Google OAuth), owner sign-up (ruling of
   #2186: the phone proves identity; the e-mail gates online booking), devices: token entropy, lifetime,
   single use, binding to the subject, brute-force limits (`docs/perf/auth-limits.md`, the rate-limit
   module), enumeration through different responses, session rotation on privilege change, revocation,
   session-cache invalidation when staff are removed or a role changes.
5. Signed links (manage-link, form-link, unsubscribe-link, guest-proof, public media): algorithm, key
   source (kms/crypto), expiry, replay, scope (one booking, not the client's history).
6. Websocket (`ws.wiring.ts`, `shared/ws`): auth on connect, authorization per room or message, tenant
   leakage in broadcasts.
7. Platform surfaces (`platform`, `moderation`, `support`, `grant-platform-role.cli.ts`): who becomes an
   operator; operator actions audited (`audit-coverage.json`, `auditChain.ts`); operator access to client
   PII beyond need.
8. Web hardening on the API and both Next apps: CORS, CSRF on cookie-authenticated mutations, cookie
   flags, security headers and CSP, `trustProxy` and client-IP derivation feeding rate limits.
9. Five sensitive staff actions (see client contacts, change prices, void/refund a sale, export clients,
   manage staff): trace the server-side check of each. UI hiding without server enforcement is a defect.

**Method:** trace from route to query; one end-to-end proven case beats ten suspicions. Existing unit tests
only — integration tests need a database.
**Metrics:** routes total / guarded / exempt; tenant tables / with RLS / excepted; system-pool call sites;
auth flows reviewed.
**Not yours:** input validation, uploads, webhooks, secrets, supply chain → C2; consent and retention →
C3; rate-limit capacity → D1.
<!-- /brief -->

<!-- brief:C2 -->
# C2 — Input handling, integrations, secrets, supply chain
Effort xhigh · chain 2 · budget 50 min

**Question:** can untrusted input or a third party make the system do what it must not, and can the build
or a dependency be the way in?

**Read first:** `docs/security/threat-model.md`, the latest report in `docs/security/zap/`,
`.github/workflows/*`, the gitleaks config, `apps/api/src/shared/{storage,public-media,messaging,kms,crypto,guest-channel,form-link}`,
`apps/api/src/modules/{media,notifications}`, `docs/prd-2026-08-16/prd/10-migration.md`.

**Checks**
1. Validation at every boundary: the DTO validation mechanism; handlers reading body/query/params around
   it; size, length and numeric limits; enum coercion; unknown keys stripped or rejected.
2. Uploads (media, public media, form attachments): type by content not extension, size caps before
   buffering, the image library and its pinned version, SVG/HTML served inline, guessable storage keys,
   bucket ACLs, signed-URL lifetime.
3. Outbound calls (SMS, e-mail, push, OAuth, geo/maps, S3): SSRF wherever a URL is user-influenced;
   timeouts; TLS verification.
4. Inbound callbacks (delivery reports, e-mail events, OAuth redirects, any payment provider): signature
   verification, replay window, redirect-URI allowlist, `state`/PKCE.
5. Injection: SQL built from strings or raw escapes with input; salon-editable notification templates
   rendered into SMS/e-mail/HTML; sanitisation of salon- and client-authored text (reviews, support,
   descriptions, forms); CSV/XLSX formula injection in exports; e-mail header injection.
6. Imports (Booksy/Versum files): parser limits, encoding, formula/HTML content carried into the panel,
   PII in import staging.
7. Secrets: key-like patterns outside `.env.example` (type + path only); tracked `.env*`; secrets in
   compose, terraform or workflow files; crypto usage — algorithm, nonce reuse, key rotation, at-rest
   encryption of contact data.
8. Supply chain: frozen lockfile in CI; install scripts allowed (`onlyBuiltDependencies` or equivalent);
   actions pinned by SHA or tag; `permissions:` per workflow; `pull_request_target`/`workflow_run` with
   untrusted checkout; self-hosted runners reachable from fork PRs; secrets in PR jobs; base images pinned
   by digest; gitleaks scope.

**Metrics:** boundaries reviewed; upload paths; outbound integrations; callbacks; actions pinned/total;
workflows with explicit permissions/total.
**Not yours:** authorization and tenancy → C1; privacy law → C3; outdated versions in general → M1 (you
own versions with a known vulnerability on an exposed path).
<!-- /brief -->

<!-- brief:C3 -->
# C3 — Privacy, GDPR, Polish and EU legal obligations
Effort xhigh · chain 3 · budget 50 min

**Question:** does the code do what the GDPR and the other laws this product touches require — and what
the PRD promised about them?

**Read first:** `docs/legal/` (all), `docs/prd-2026-08-16/prd/12-security-prereqs.md`, `04-crm-comm.md`,
`05-marketplace.md`; `gates/legal-register.yaml`, `gates/legal_gates.yaml`, `gates/eu-residency.yaml`,
`gates/ranking-input.yaml`; the privacy rows of `docs/constitution.yaml`;
`apps/api/src/shared/{masking,archive,audit,unsubscribe-link}`.

**Checks**
1. Roles: where the platform is controller and where processor; what the code assumes about the same
   person as a marketplace user and as a salon's client; data flows between those only on a lawful basis.
2. Consents: types (marketing SMS, marketing e-mail, terms, privacy notice, special-category data in
   forms) stored with version, time, channel and proof; withdrawal as easy as giving; marketing sends check
   consent at send time, not only at enqueue; transactional messages carry no marketing. Polish electronic
   communications law (PKE) on SMS/e-mail marketing — verify the article on an official source.
3. Special-category data (Art. 9): forms and client cards can hold health data (allergies,
   contraindications, treatment notes, photos). Identified? Role-restricted? Encrypted? Out of exports,
   logs and analytics? Explicit consent? A DPIA (Art. 35) in `docs/legal`?
4. Data-subject rights (Art. 15–22): access/export, rectification, erasure, restriction, portability;
   erasure vs tax retention duties (verify the Polish period); anonymisation leaving no PII in audit,
   outbox, logs, search index, object storage, mobile caches; the anonymisation-restore race a milestone
   records (find it) — fixed?
5. Retention: a period and an enforcing job per data class — outbox, notifications, logs, audit, guest
   tokens, import staging.
6. Residency and transfers (Art. 44–49): every processor in code and config (SMS, e-mail, push, maps,
   error tracking, analytics, CDN) — EU region? All in `eu-residency.yaml`? Records of processing (Art. 30)
   and the processor list in `docs/legal`.
7. Logs and telemetry: masking on log calls that carry contact data (sample them); telemetry events with
   PII; error-tracking payloads with request bodies.
8. Booking-site cookies: non-essential cookies or trackers before consent.
9. Marketplace law (DSA, Omnibus/UOKiK): notice and action, statement of reasons, complaints, trader
   information, ranking transparency, review authenticity — code vs `05`. Small-enterprise exemptions are an
   owner/lawyer question; record facts, do not decide.

**Method:** cite official sources (EUR-Lex, uodo.gov.pl, isap.sejm.gov.pl, uokik.gov.pl) or the repo's
`docs/legal`. This is not legal advice: open legal points become owner questions for the lawyer.
**Metrics:** consent types; data-subject rights implemented / total; processors / EU-resident; PII log call
sites sampled / masked.
**Not yours:** authorization → C1; secrets and crypto → C2; accessibility law → F2.
<!-- /brief -->

<!-- brief:B1 -->
# B1 — Schema truth: prd/02 ↔ database ↔ contracts ↔ code
Effort xhigh · chain 1 · budget 50 min

**Question:** does every layer name and shape the domain the way `prd/02` defines it — and is anything
invented or missing?

**Read first:** `docs/prd-2026-08-16/prd/02-domain-model.md` (the only schema truth — root CLAUDE.md rule
2), `GLOSSARY.md`, `packages/db/src/schema/`, `packages/contracts/`, `packages/api-client/`,
`gates/entity-slices.yaml`, `WT/.claude/skills/feature-slice/SKILL.md`.

**Checks**
1. Inventory: the entities `02` defines (FR-DM ids) → table(s), contract type(s), API DTOs, Kotlin model if
   any. Write `RUN/scratch/B1/matrix.tsv` (entity · 02 id · table · contract · dto · kotlin · status).
2. Invented: tables, columns, enum members, statuses in code that `02` does not define — a rule-2
   violation, unless `02` has them under another name (then naming drift).
3. Missing: entities or fields in `02` absent from code — check `open-tasks.tsv` before calling it a gap.
4. Mismatch: nullability, types, enum members, uniqueness, FKs; status machines (`02`'s allowed transitions
   vs the code's transition functions).
5. Contracts ↔ DB: contract fields the API fills from nowhere or drops; api-client vs contracts; renames.
6. The entity-slices gate: what it checks, and which of your findings it would have missed.

Prioritise the pilot path: salon, location, staff/membership, client, service/price, appointment and its
items, schedule/opening hours, time off, resource, notification, consent, sale/receipt.
**Metrics:** entities in `02`; fully aligned; invented items; missing (tracked/untracked); mismatches.
**Not yours:** migration mechanics → H1; query performance → D1; money and time semantics → B2.
<!-- /brief -->

<!-- brief:B2 -->
# B2 — Money, VAT, fiscal, time
Effort xhigh · chain 1 · budget 50 min · SANDBOX allowed

**Question:** is every amount and every instant computed, stored, displayed and transmitted correctly —
rounding, VAT, currency, time zone, DST?

**Read first:** `WT/.claude/skills/money-and-time/SKILL.md` (OD-1 vocabulary and its lints),
`docs/prd-2026-08-16/prd/06-payments.md`, `15-services-pricing-media.md`, `16-staff-payroll.md`, the money and
time ADRs (zerograph "money minor units", "wall clock time zone"), `apps/api/src/shared/money/`,
`apps/api/src/modules/{sales,commissions,renter}`, the money and time code of `packages/domain`.

**Checks**
1. Representation: integer minor units or a decimal type end to end (DB columns, contracts, JSON, UI);
   float arithmetic on money; currency carried with the amount; PLN only or EUR too — what the code assumes.
2. VAT: rates per service/product; per-line vs per-document rounding against the PRD's rule; discount
   allocation across lines and its VAT; gross/net consistency on receipts and reports; the rate snapshotted
   on the line at sale time.
3. Fiscal: what `06` requires (fiscal receipts, KSeF e-invoices — verify the current Polish dates on
   podatki.gov.pl / ksef.podatki.gov.pl), what `sales` implements, the fiscal document checks in sync.
4. Commissions, renter fees, notification billing (marketing SMS: a free allowance, then a price per SMS;
   transactional free): computation, rounding, period bounds in local time, idempotent charging.
5. Time: instants stored as UTC/timestamptz vs local wall-clock for schedules; Europe/Warsaw DST —
   ambiguous and non-existent wall times in opening hours, appointments, recurring schedules and reminders
   ("24 h before" across DST); local day bounds; date-only fields; clock injection (no direct `Date.now()`
   or `new Date()` in domain logic); TS vs Kotlin on ambiguous times (B4 owns the parity fixtures, you own
   the rule).
6. Formatting: `Intl` with explicit locale and time zone; server-rendered dates in the salon's zone.
7. Lints: do the OD-1 lints catch float money and raw `Date` where it matters? SANDBOX proofs (≤ 3): if
   `RUN/context/sandbox.ready` says `ok`, plant one violation per lint in a domain or api file, run that
   package's lint on the file, record red/green and the command, then reset
   `git -C SANDBOX checkout -- . && git -C SANDBOX clean -fd` (keeps node_modules). `failed` or missing →
   try one proof at most, else static analysis only, noted in coverage.

**Metrics:** money call sites sampled; float hazards; DST cases checked; lints proven red / tried.
**Not yours:** calendar slot logic → B3; schema naming → B1.
<!-- /brief -->

<!-- brief:B3 -->
# B3 — Calendar and availability correctness
Effort xhigh · chain 3 · budget 50 min

**Question:** does availability produce exactly the slots the rules allow, and does booking accept exactly
those?

**Read first:** `docs/prd-2026-08-16/prd/03-calendar.md` (FR-CAL-*), the availability core of
`packages/domain` and its fixtures in `packages/domain/conformance/`, `apps/api/src/modules/availability/`
(≈ 140 files — map it before reading), `schedules`, `locations`, `staff`, the calendar ADRs.

**Checks**
1. Rule coverage: FR-CAL rules with logic → where implemented → which fixture or test pins them. Neither →
   gap (check tasks first).
2. Edge cases — decide from code what happens and whether `03` agrees: overnight opening-hours rows;
   slots crossing closing time; DST days; breaks and buffers; multi-service bookings (sequential,
   different staff, shared resources); resource capacity; partial time off; salon closures; minimum notice
   and maximum horizon; grid vs service duration; per-location hours; channel restrictions (FR-CAL-41);
   staff at two locations on one day; inactive service or staff with future bookings.
3. Acceptance: the server re-validates the chosen slot against current availability rather than trusting
   the client; the two-clients-one-slot race — who stops it (L1 owns the primitive; you own whether the
   check is the same rule as availability).
4. Duplication: availability computed in more than one place (domain core, api module, Kotlin, SQL) —
   divergence risk.
5. Cost: complexity for 20 staff × 60-day horizon × 5-minute grid; caching and invalidation on schedule
   change.
6. Calendar views (the panel's calendar grid, the commit-safe calendar cursor ruling): range-query
   semantics vs what the grid shows — late-committing writes, deleted appointments, the grid's time zone.

**Proofs:** existing domain unit tests and fixtures for the cases you doubt (≤ 5 runs).
**Metrics:** FR-CAL rules with logic / implemented / pinned; edge cases checked / divergent.
**Not yours:** indexes → D1; Kotlin parity harness → B4; locking → L1.
<!-- /brief -->

<!-- brief:B4 -->
# B4 — Constitution invariants and conformance
Effort xhigh · chain 1 · budget 50 min · SANDBOX allowed

**Question:** is each of the twenty invariants actually guarded, and do the TS and Kotlin cores agree on
the fixtures?

**Read first:** `docs/constitution.yaml`, the `constitution_check` implementation (find it),
`packages/domain/conformance/`, `tools/conformance/`, the conformance jobs in `.github/workflows/ci.yml`
(`domain-conformance-ts`, `domain-conformance-kotlin`, `conformance-parity`, `conformance-lint`),
`docs/gates/required-checks.md` (parked jobs), `WT/.claude/skills/conformance-fixture/SKILL.md`.

**Checks**
1. For each INV-01…INV-20: the named test exists at SHA; it asserts the invariant itself (not a tautology,
   not a snapshot of whatever the code does, not mocked away); it runs in a CI job triggered by the paths
   that can break it and not parked; manual-owner rows have a dated record of the check. Write
   `RUN/scratch/B4/inv.tsv` (INV · test · asserts? · job · filter ok? · parked? · verdict).
2. `constitution_check`: what it compares; can a PR delete an invariant's test and stay green?
3. Conformance: fixture families vs the FR rules they cover; fixtures only one runtime runs; how parity is
   compared; where divergences are recorded; fixtures whose expected value contradicts `03`/`02`.
4. SANDBOX proofs (≤ 3, the riskiest rows): if `RUN/context/sandbox.ready` says `ok`, break the invariant in
   code (not in the test), run that single test file, record red/green, then reset
   `git -C SANDBOX checkout -- . && git -C SANDBOX clean -fd`.

**Metrics:** INV rows guarded / weak / unguarded; fixtures total / TS-only / Kotlin-only; proofs red / tried.
**Not yours:** general test quality → E1; other gates → E2.
<!-- /brief -->

<!-- brief:E2 -->
# E2 — Gates that look armed
Effort xhigh · chain 1 · budget 50 min · SANDBOX allowed

**Question:** can every gate this repository relies on go red when the thing it guards breaks?

**Read first:** `docs/gates/registry.md`, `docs/gates/break-on-purpose.md`, `docs/gates/required-checks.md`,
`gates/*.yaml`, `tools/gates/`, `.github/workflows/ci.yml` (the `changes` filters and `all-green`),
`tools/verify/verify.mjs` (JOBS), `WT/.claude/skills/gates/SKILL.md`.

**Checks**
1. Inventory: gate yaml → checker → CI job → in `all-green`? → required context on main? → parked behind a
   variable? Write `RUN/scratch/E2/gates.tsv`.
2. Aggregation: how `all-green` treats `skipped`, `cancelled`, `neutral`. For five realistic diffs — only
   `packages/domain`, only `mobile/shared`, only `packages/db/migrations`, only `gates/*.yaml`, only
   `packages/config` — decide from the filters which jobs run, and name jobs that should run and do not.
3. Checker logic: what input each gate reads; "0 items checked → pass"; fail-closed on a parse error;
   allowlists growing without review.
4. Drift: `verify.mjs` JOBS vs `ci.yml`; `registry.md` vs reality; break-on-purpose proofs older than the
   gate's last change.
5. SANDBOX proofs (≤ 8, by risk among permissions-catalog, check-rls, entity-slices, seam-check,
   conflict-codes, pii-detector, eu-residency, irreversible, rate-limits, paid-features): if
   `RUN/context/sandbox.ready` says `ok`, plant the smallest realistic violation, run the gate's local
   command, record red/green and the command, reset after each
   (`git -C SANDBOX checkout -- . && git -C SANDBOX clean -fd`). Green on a planted violation is high —
   critical if the gate guards an INV row.

**Metrics:** gates total / proven red / green on violation / not tried; jobs skippable by filter that
should not be.
**Not yours:** CI speed → D3; INV test semantics → B4; workflow security → C2.
<!-- /brief -->

<!-- brief:L1 -->
# L1 — Reliability and concurrency
Effort xhigh · chain 2 · budget 50 min

**Question:** under retries, crashes, duplicate deliveries, concurrent requests and several API instances,
does every write happen exactly as intended?

**Read first:** `apps/api/src/shared/{outbox,queue,idempotency,ws,rate-limit,session-cache,flags}`,
`apps/api/consumer-idempotency.json`, `apps/api/src/outbox-replay.cli.ts`,
`apps/api/src/queue-board.wiring.ts`, `docs/prd-2026-08-16/prd/17-platform-operations.md`, the reliability
ADRs (zerograph "outbox", "idempotency key").

**Checks**
1. Outbox: written in the state change's transaction; relay ordering, at-least-once, poison messages,
   backoff, dead letter; can the replay CLI send an SMS twice; cleanup.
2. Consumers: all idempotent (`consumer-idempotency.json` complete vs actual consumers?); dedupe keys;
   side effects before ack.
3. API idempotency: which POSTs take a key (booking, sync push, anything money-like); key scope; stored
   response replay; concurrent same-key requests.
4. Check-then-act races: booking create/move, schedule edits, client merge, voucher/pass use, invitation
   accept — DB constraint, row lock, advisory lock, serializable retry, or nothing. Name the primitive per
   site.
5. Transactions: external calls inside transactions; isolation assumptions; retry on serialization
   failure or deadlock.
6. Scheduled jobs (reminders, retention, recurring): exactly once with N instances; catch-up after
   downtime; the schedule's time zone.
7. External calls: timeouts, retry budgets, circuit breaking; does booking still succeed when the SMS or
   e-mail provider is down?
8. Websocket fan-out: reconnect and missed events, tenant rooms, back-pressure; the k6 `ws-fanout` baseline.
9. Shutdown and startup: graceful drain of HTTP, workers and ws; migrations racing app start;
   health vs readiness.

**Metrics:** consumers / idempotent; check-then-act sites / protected; jobs / single-run safe; external
calls / with timeout.
**Not yours:** availability rules → B3; indexes → D1; alerting → H2.
<!-- /brief -->

<!-- brief:D1 -->
# D1 — Database performance
Effort xhigh · chain 3 · budget 50 min

**Question:** which queries will be slow or lock-heavy at pilot and beta scale, and what is the cheapest fix?
Scale: a salon has 5–30 staff, 2–15 k clients, 50–300 appointments a day, two years of history; beta is
≈ 500 salons. No database is available — static analysis plus `docs/perf/` and `perf/k6/`.

**Read first:** `docs/perf/baseline.md`, `docs/perf/auth-limits.md`, `perf/k6/*`, `packages/db/src/schema/`,
`packages/db/src/partitions.ts`, `packages/db/src/connection.ts`, `apps/api/system-pool.json`.

**Checks**
1. Hot queries — calendar range, availability inputs, client search (phone/name: trigram?
   case-insensitive?), client history, reports, notifications due, outbox poll, audit writes: the query
   (path:line), its WHERE/ORDER BY/JOIN columns, the index that serves it or none.
2. FKs without an index; indexes no query uses; composite column order vs predicates; tenant column first.
3. RLS cost: per-row function calls in policies (`current_setting` without the initplan form) on large tables.
4. N+1 and chattiness: awaits inside loops, per-row lookups in list endpoints, `SELECT *` on wide tables,
   unbounded lists, OFFSET pagination on large tables.
5. Pooling: pool sizes per process vs `max_connections` in the staging config; long transactions; the
   system pool's size.
6. Growth: tables that grow without bound (audit, outbox, notifications, sync ops) — partitioning or
   retention; JSONB keys queried without an index.
7. Baselines: what k6 measured, on which data volume, and whether the seed is big enough to mean anything.

**Metrics:** hot queries reviewed / indexed; FKs without index; loops with queries; unbounded tables.
**Not yours:** migration lock safety → H1; availability algorithm cost → B3; frontend → D2.
<!-- /brief -->

<!-- brief:H1 -->
# H1 — Migrations and data lifecycle
Effort xhigh · chain 4 · budget 50 min

**Question:** can every migration run safely on a live database with data, and is data created, archived
and deleted on a plan?

**Read first:** `packages/db/migrations/`, `packages/db/drizzle.config.ts`, `packages/db/src/migrate.ts`,
`packages/db/src/preconditions.ts`, `packages/db/src/seed/`, `gates/irreversible.yaml`, the `migrations` and
`db-integration` jobs, `WT/.claude/skills/seed/SKILL.md`, the migration and backup runbooks in `docs/ops/`.

**Checks**
1. Journal integrity: ordering, gaps or duplicate numbers, schema vs generated SQL drift (what the
   `migrations` job checks).
2. Lock safety on hot tables (appointments, clients, notifications, outbox, audit): `CREATE INDEX` without
   `CONCURRENTLY`, `ALTER COLUMN TYPE`, `NOT NULL` with a volatile default, constraints without
   `NOT VALID` + `VALIDATE`, enum changes, rewrites.
3. Destructive operations: DROP/RENAME of columns the previous app version still reads (expand–contract);
   `irreversible.yaml` coverage of them.
4. Backfills inside schema migrations: batched, idempotent, time-bounded?
5. Deploy order: does the app tolerate the schema one migration ahead or behind during a deploy?
6. RLS and grants: new tables get policies and grants in the same migration?
7. Seed: deterministic (anchor date, fixed ids), realistic volume, no real PII.
8. Lifecycle: soft vs hard delete per entity; archive module; retention jobs; partition maintenance;
   backup and PITR restore drill dates (`docs/ops`).

**Metrics:** migrations / lock-risky / irreversible / covered by the gate; tables without a delete strategy.
**Not yours:** naming vs prd/02 → B1; query performance → D1; retention law → C3.
<!-- /brief -->

<!-- brief:A1 -->
# A1 — Workspace and module boundaries
Effort xhigh · chain 4 · budget 50 min

**Question:** do dependencies between workspaces and modules follow the intended architecture, and where
does the structure make change expensive?

**Read first:** every workspace `MODULE.md`, `apps/api/src/modules/README.md`,
`WT/.claude/skills/repo-map/SKILL.md`, `docs/prd-2026-08-16/prd/11-apps-stack.md`, the architecture ADRs,
`packages/ports/`.

**Checks**
1. Workspace graph from package.json dependencies: cycles; apps depending on apps; packages depending on
   apps; `packages/domain` purity (no IO, no framework, no DB).
2. MODULE.md "forbidden" and "public contract" vs actual imports (imports reaching past a module's index).
3. API modules: imports of another module's internals; circular module dependencies; `shared/`
   (≈ 235 files) — truly shared vs one module's code parked there.
4. Duplicated concepts: `catalog` vs `catalogue`; `sync` in shared and in modules; several money helpers;
   two mechanisms for one flow (queue vs outbox).
5. Hubs: `zerograph impact <Symbol> --depth 1 --stale` on the ten most-imported symbols you find; files
   over 800 lines; god services.
6. Ports and adapters: external services (SMS, e-mail, storage, maps) behind ports and testable with fakes;
   provider types leaking into domain.
7. Frontend ↔ API: apps importing server code or DB types instead of contracts/api-client.

**Metrics:** workspace edges / violations; cross-module internal imports; files > 800 lines; hubs with
caller counts.
**Not yours:** API contract shape → A3; code style → I1/I2; ADR-by-ADR drift → A2.
<!-- /brief -->

<!-- brief:A2 -->
# A2 — ADR drift
Effort xhigh · chain 5 · budget 50 min

**Question:** do the ADRs still describe the code, and which decisions live in the code without an ADR?

**Read first:** `docs/adr/` (titles, statuses, decision sections), `WT/.claude/skills/adr/SKILL.md`, the ADR
ledger in the PLAT-M01 milestone file.

**Checks**
1. Each accepted ADR: one or two concrete checks that the code follows it (an import, a config, a
   pattern). Verdict: followed / partial / contradicted / unverifiable.
2. Superseded ADRs marked; accepted ADRs contradicting each other; numbering vs the ledger.
3. Undocumented decisions visible in code (framework, ORM, queue, auth method, mobile stack, hosting,
   observability stack).
4. ADRs whose premise changed (a provider, a deadline, a scale assumption) → decision-challenge with evidence.

**Metrics:** ADRs followed / partial / contradicted / unverifiable; undocumented decisions.
**Not yours:** boundary violations in general → A1.
<!-- /brief -->

<!-- brief:A3 -->
# A3 — API surface and contracts
Effort xhigh · chain 2 · budget 50 min

**Question:** is the API consistent, versionable and safe to evolve for four client surfaces (panel,
booking site, business app, client app)?

**Read first:** `packages/contracts/`, `packages/api-client/`, `tools/contracts-smoke/`, `tools/codegen/`, the
`contracts`, `contracts-pack` and `conflict-codes` jobs, `apps/api/src/shared/errors/`,
`docs/prd-2026-08-16/prd/11-apps-stack.md`, `apps/api/route-exemptions.json`.

**Checks**
1. Route inventory (method, path, module, contract type, auth): naming, REST semantics, status codes,
   pagination (cursor/offset, limits), filtering and sorting conventions, id formats.
2. Error model: one shape everywhere; the conflict-code catalogue vs codes thrown; machine-readable
   validation errors for forms; no internal messages or stack traces leaked.
3. Contracts as the source: request/response types generated once and used by api-client and Kotlin;
   hand-written duplicates; declared fields never filled.
4. Evolution: versioning for mobile apps that cannot update instantly; breaking-change detection;
   deprecation; unknown enum members on clients.
5. Concurrency and idempotency on mutating routes: idempotency keys, ETag/If-Match or version fields
   (calendar edits from two devices).
6. Chattiness: calls per screen (calendar, client card, booking flow); per-row calls from clients.
7. Realtime contracts: ws event shapes and versioning.

**Metrics:** routes; error shapes found; routes with idempotency; contract types generated vs hand-written.
**Not yours:** authorization → C1; query performance → D1.
<!-- /brief -->

<!-- brief:E1 -->
# E1 — Test quality and FR traceability
Effort xhigh · chain 3 · budget 50 min

**Question:** where would a real regression pass every test?

**Read first:** `docs/prd-2026-08-16/prd/TRACEABILITY.md`, the vitest and playwright presets in
`packages/config/` (thresholds), `tools/mutation/` and any mutation reports, `docs/testing/`,
`WT/.claude/skills/integration-tests/SKILL.md`, the `unit`, `api-integration`, `db-integration` and `e2e` jobs.

**Checks**
1. Traceability: ≥ 60 FRs with logic across `03`, `04`, `06`, `14`, `15`, `16` → the test that pins each
   (TRACEABILITY plus FR ids in tests); FRs with none.
2. Weak tests (≥ 40 files across api, domain, db, panel, ui): no assertion or only
   `toBeDefined`/`toBeTruthy`; a whole-response snapshot as the only check; the unit under test mocked;
   asserting a mock was called instead of the outcome; tests that cannot fail.
3. Skips: `.skip`, `.only`, `.todo`, env-gated skips — count them and where they hide coverage.
4. Flake patterns: real timers and sleeps, wall-clock dates, unseeded randomness, order dependence, shared
   DB state; recently fixed flakes (`git log -i --grep flake`) — the same pattern elsewhere?
5. Integration: tenancy and RLS covered at the DB level; migrations tested from empty and from the
   previous release.
6. E2E: which steps of `docs/testing/alpha-script.md` have an e2e test.
7. Mutation testing: last results, score per package, survivors in money, time and availability.

**Metrics:** FRs sampled / pinned; weak files / sampled; skips; alpha-script steps with e2e.
**Not yours:** invariant tests → B4; gates → E2; CI speed → D3.
<!-- /brief -->

<!-- brief:D3 -->
# D3 — CI/CD speed and the developer loop
Effort xhigh · chain 4 · budget 50 min · read-only `gh` allowed

**Question:** where does the time go between a push and a green merge, and between an edit and a local signal?
Context: CI runs on self-hosted runners on the owner's PC (two heavy, one light); one PR on the forge at a
time (`ci-slot` label); squash-only main; repo `smaragdove-nebo/beauty-crm`. The active `gh` account may
belong to another project: on an auth failure retry the read with `GH_TOKEN=$(gh auth token -u <user>)`.

**Read first:** `.github/workflows/*.yml`, `turbo.json` (read only — rule 1), root `package.json` scripts,
`tools/verify/verify.mjs`, `docs/dev-setup.md`, `infra/runner/`, `docs/agent-context.md`.

**Checks**
1. Measure: the last 20 `ci.yml` runs on main and 20 PR runs — duration and queue time; per-job durations
   for 5 of them (`gh run list … --json`, `gh run view <id> --json jobs`, bounded); the critical path
   through `needs:`.
2. Waste: jobs serialised that could run in parallel; repeated install/build instead of shared artifacts;
   turbo cache hits (from logs if visible); cache keys too broad or narrow; images pulled each run;
   e2e/storybook/ui-perf on every PR vs path-filtered.
3. Flakiness: reruns and failure causes in the last 50 runs; jobs that failed then passed on rerun.
4. Local loop: time to first green from a fresh clone per `dev-setup.md` (by reading); `pnpm verify` vs
   the forge; incremental typecheck.
5. Runner capacity: concurrency vs job count; memory-heavy jobs sharing a runner.

Each proposal carries an expected saving (minutes per run × runs per day). Changes to `turbo.json`, root
`package.json` or `packages/config` are proposals marked "build-config: needs owner request".
**Metrics:** median and p90 run time (main, PR); critical path; five slowest jobs; rerun rate.
**Not yours:** workflow security → C2; gate semantics → E2.
<!-- /brief -->

<!-- brief:H2 -->
# H2 — Operations, observability, deploy
Effort xhigh · chain 1 · budget 50 min

**Question:** when something breaks during the pilot at 21:00 on a Saturday, does someone learn of it, and
can they fix it from a runbook?

**Read first:** `docs/ops/` (especially `runbook-deploy.md` and its table «Where `urody.xyz` is written
today»), `infra/` (staging terraform, compose, pgbackrest, grafana, alert `rules.yaml` and `routing.yaml`),
`apps/api/src/instrument.ts`, `apps/api/src/shared/{observability,logging}`, `packages/telemetry/`,
`tools/deploy-gate/`, `docs/prd-2026-08-16/prd/17-platform-operations.md`. Do not contact the staging host.

**Checks**
1. Alerts: each rule → what it detects, threshold, route, runbook link; uncovered failure modes (API down,
   queue backlog, outbox stuck, SMS provider failing, disk, certificate expiry, backup failure, DB
   connections exhausted, error-rate spike, booking site down).
2. Logs, metrics, traces: structured logs with request and tenant ids and without PII; business metrics
   (bookings created, notifications sent/failed); tracing API → queue → worker.
3. Deploy: how a release reaches staging and the plan for production; zero downtime; rollback with
   migrations; deploy-gate checks; image provenance; compose drift between repo and box (a known problem —
   is the runbook procedure automatable?).
4. Backups: pgbackrest config, PITR proof date, restore drill cadence, object-storage backup, off-site
   copy, encryption.
5. Configuration: secret distribution; staging vs dev parity; feature flags — defaults and kill switches.
6. `urody.xyz`: `git -C WT grep -n -i 'urody' -- . ':!graphify-out' ':!research' ':!.agents'` vs the
   table's rows; every hit missing from the table is a finding (the domain will change, OQ-7).
7. Production readiness: what is missing between staging and a production pilots can rely on (from `17`
   and `docs/testing/release-checklist.md`).

**Metrics:** alert rules / with runbook / with route; failure modes uncovered; `urody` hits / in the table.
**Not yours:** CI → D3; schema side of backups → H1.
<!-- /brief -->

<!-- brief:G1 -->
# G1 — Mobile shared core (Kotlin) and sync
Effort xhigh · chain 2 · budget 50 min

**Question:** will the business and client apps behave correctly offline and when they sync, and does the
shared core stay equal to the TS domain?

**Read first:** ADR-010 and the other mobile/sync ADRs (zerograph "sync offline"), `mobile/shared/`,
the structure of `mobile/bizApp` and `mobile/clientApp`, `apps/api/src/modules/sync`,
`apps/api/src/shared/sync`, `tools/sync-harness/`, `tools/sync-simulator/`, `gates/offline-matrix.yaml`,
`gates/shared-code-ratio.yaml`, `docs/prd-2026-08-16/prd/11-apps-stack.md`. No Gradle builds.

**Checks**
1. Sync protocol: the op lifecycle (queued → sent → accepted/rejected/conflicted); states with no verdict;
   conflict codes; server-changed fields; idempotency of a replayed op; ordering; partial batch failure;
   clock skew.
2. Offline matrix: actions `offline-matrix.yaml` allows offline vs what the apps allow; offline sales and
   fiscal references; device availability snapshots — staleness, refusing to book on stale data.
3. TS ↔ Kotlin at code level: local day bounds, ambiguous wall-clock handling, occupancy union, money
   rounding — read both implementations of 5 rules (B4 owns the fixture harness).
4. Data on the device: encryption at rest, cached PII, wipe on logout, several accounts on one device,
   device registration and revocation.
5. The shared-code-ratio gate: what it measures and whether it means anything.
6. Stack: Kotlin/Compose/Gradle versions in the catalog — EOL or risky; build variants pointing at test
   domains.

**Metrics:** sync states / with defined handling; offline actions allowed vs specified; parity rules read /
divergent.
**Not yours:** API evolution → A3; device-token authorization → C1.
<!-- /brief -->

<!-- brief:F2 -->
# F2 — Public booking site
Effort xhigh · chain 3 · budget 50 min

**Question:** can a client find a salon, book and manage the booking quickly and accessibly, and does the
site do what the owner ruled?

**Read first:** `apps/booking/`, `docs/prd-2026-08-16/prd/05-marketplace.md`, `09-reports-website.md`, the
ruling of PR #2186 (`git -C WT log -i --grep '#2186' -n 3` and its PRD diff: owner sign-up proves only the
phone; the e-mail gates online booking), the FE-M04 milestone file.

**Checks**
1. Funnel: steps from landing to a confirmed booking; required fields; guest vs account; error and empty
   states (no slots, slot taken meanwhile, SMS code failure); manage-link flows (reschedule, cancel within
   policy).
2. Ruling #2186: a salon with an unverified e-mail is not offered for online booking — where it is
   enforced, server and UI, or not.
3. SEO: metadata, canonical URLs, sitemap, robots, structured data (schema.org BeautySalon/LocalBusiness,
   Service, Offer, AggregateRating — and Google's rules for review markup), language tags, server rendering
   of salon pages, slugs, 404/410 for closed salons.
4. Accessibility (WCAG 2.1 AA, EN 301 549): labels, announced errors, focus order, keyboard slot picker,
   contrast, target sizes. The European Accessibility Act covers consumer e-commerce services since
   2025-06-28; the Polish act's scope and the microenterprise exemption are an owner/lawyer question —
   record facts, not a verdict.
5. Abuse: fake bookings and SMS pumping (rate limits, guest-proof, phone verification cost); scraping of
   salon or client data.
6. Performance by reading: server vs client components, waterfalls, images, fonts, third-party scripts
   (D2 owns the measurement).
7. Cookies and consent on the site (C3 owns the law; you own what the site does).

**Metrics:** funnel steps; a11y issues by severity; SEO items present / absent.
**Not yours:** panel → F1; render performance → D2.
<!-- /brief -->

<!-- brief:D2 -->
# D2 — Frontend performance
Effort xhigh · chain 4 · budget 50 min

**Question:** what makes the panel and the booking site slow on a mid-range phone and an old salon laptop,
and what fixes it cheapest?
No builds: reason from code, the Next configs, the `ui-perf` and `storybook` jobs (read-only `gh` for their
logs, bounded) and `docs/perf/`.

**Read first:** `apps/panel/next.config.*`, `apps/booking/next.config.*`, both apps' `package.json`, the
`ui-perf` job and its thresholds, `docs/perf/baseline.md`.

**Checks**
1. Client/server split: `'use client'` high in the tree pulling big subtrees to the client; heavy libraries
   in client components (dates, charts, editors, whole icon sets); dynamic import of rarely used heavy UI.
2. Data: request waterfalls in pages and layouts; missing caching/revalidation for shared data; client
   fetching that could be server-side; query-cache defaults causing refetch storms.
3. Rendering hotspots: the calendar grid — virtualisation, memoisation, re-render on every tick or ws event;
   long lists without virtualisation; providers re-rendering the app.
4. Assets: images without dimensions; fonts (preload, swap, subsets with Polish and Cyrillic glyphs);
   icons; CSS size.
5. Booking-site Core Web Vitals risks: the LCP element per page, CLS from late content, INP in the slot picker.
6. `ui-perf`: what it measures (frame p95), which scenarios, thresholds, stability on the self-hosted runner.

**Metrics:** client components; heavy client imports; waterfalls; large lists / virtualised.
**Not yours:** SEO and a11y → F2; UI kit internals → F3; API chattiness → A3.
<!-- /brief -->

<!-- brief:F1 -->
# F1 — Panel UX, accessibility, i18n
Effort xhigh · chain 5 · budget 50 min

**Question:** can a salon owner and their staff do the daily work in the panel without confusion, errors or
dead ends?
Do not compare with the prototypes: the owner ruled the visual direction (Aurora) is still moving. Judge
behaviour, flows, states and accessibility — not looks.

**Read first:** the route map of `apps/panel/`, `docs/prd-2026-08-16/prd/18-panel-shell.md`, `docs/i18n/`,
`packages/i18n/`, the panel milestone files (FE-M0x).

**Checks**
1. Daily flows — create/move/cancel an appointment, check a client in, add a walk-in, close a visit with a
   sale, add a client, send a message, edit a schedule: screens and steps for each; dead ends; missing undo;
   destructive actions without confirmation.
2. States on every major screen: loading, empty, error, offline, permission denied; optimistic updates never
   reconciled on failure.
3. Permission-aware UI: hidden vs disabled vs shown-and-fails, consistent with server rules (C1 owns the server).
4. Forms: field-level validation messages; server errors mapped to fields; double-submit prevention;
   unsaved-changes guard.
5. i18n: the dashboard UI is Russian; hard-coded strings outside catalogs; Russian plural forms; dates,
   numbers and currency per locale; Polish/Spanish service-catalog content; missing-key fallback.
6. Accessibility: keyboard use of the calendar and dialogs, focus in modals, landmarks, labels, contrast in
   both themes (light and dark are both required), reduced motion.

**Metrics:** flows walked; dead ends; screens missing states; hard-coded strings; a11y issues by severity.
**Not yours:** performance → D2; component library → F3; booking site → F2.
<!-- /brief -->

<!-- brief:F3 -->
# F3 — UI kit and design system
Effort xhigh · chain 3 · budget 50 min

**Question:** does `packages/ui` give the apps a consistent, accessible, themeable base, or do the apps work
around it?

**Read first:** `packages/ui/` and its MODULE.md, the `tokens-drift`, `a11y`, `storybook` and `ui-perf`
jobs, `docs/design/`.

**Checks**
1. Coverage: components without a story or a test; stories without interaction or a11y checks.
2. Tokens: hard-coded colours, spacing, radii in ui and in the apps vs tokens; both themes in every component.
3. API consistency: prop naming, controlled/uncontrolled, polymorphism, ref forwarding, className merging.
4. Primitives' a11y: dialogs (focus trap, return focus, Escape), menus, comboboxes, date/time pickers,
   toasts (live regions), tooltips (keyboard).
5. Duplication: app-local copies of ui components; ui components no app uses (`zerograph impact`).

**Metrics:** components / with story / with test; hard-coded style values; duplicates.
**Not yours:** panel flows → F1; render performance → D2.
<!-- /brief -->

<!-- brief:M1 -->
# M1 — Dependencies and toolchain
Effort xhigh · chain 5 · budget 50 min

**Question:** which dependencies are a security, support or upgrade risk, and in what order should they move?

**Read first:** root and workspace `package.json` files, `pnpm-workspace.yaml`, `.npmrc`, the lockfile (counts,
not the whole file), the gradle catalogs under `mobile/`, Dockerfiles and compose images under `infra/`,
action versions in `.github/workflows/`, `engines`/`packageManager`/`.node-version`. Owner decision of
2026-09-01: move to TypeScript 6.0, then 7.0 — check where that stands.

**Commands** (outputs to `RUN/scratch/M1/`, summarised with node, never printed whole):
`pnpm -C WT outdated -r --format json > RUN/scratch/M1/outdated.json`,
`pnpm -C WT audit --json > RUN/scratch/M1/audit.json`. A network failure is noted, not fatal.

**Checks**
1. Vulnerabilities: advisories on production paths exposed to input vs dev-only.
2. Majors behind: Next, React, the API framework, Drizzle, Zod, Vitest, Playwright, Turbo, Storybook, Node
   (EOL date from nodejs.org), TypeScript (the 6/7 plan), Kotlin/Gradle/Compose — breaking changes from
   official release notes and an effort estimate per upgrade.
3. Duplicates: several versions of one library in the lockfile (react, zod, date libraries, @types).
4. Hygiene: declared but never imported; imported but undeclared (hoisting); wrong section; range vs exact
   pin policy; `overrides`/`patchedDependencies` and their reasons.
5. Licences: copyleft (GPL/AGPL/SSPL) in production dependencies; unknown licences.
6. Automation: Renovate/Dependabot presence and batching.
A proposal to add a dependency is marked "new dependency: owner approval".

**Metrics:** direct / total deps; advisories by severity (prod/dev); majors behind; duplicated libraries;
copyleft count.
**Not yours:** supply-chain attack surface (install scripts, action pinning) → C2.
<!-- /brief -->

<!-- brief:J1 -->
# J1 — Plans versus reality
Effort xhigh · chain 5 · budget 50 min

**Question:** do the ticks in the milestone files match the code, what can be closed, and what really blocks
the rest?

**Read first:** `RUN/context/open-tasks.tsv`, `RUN/context/done-tasks.tsv`, `RUN/context/tasks-report.txt`,
the structure of `docs/prd-2026-08-16/plans/milestones/`, `docs/prd-2026-08-16/plans/2026-09-11-alpha-beta-release.md`,
`docs/prd-2026-08-16/plans/2026-08-21-owner-directives.md`, `WT/.claude/skills/tasks/SKILL.md` (a tick is by
the full task text; split, not partial).

**Checks**
1. Done sample (≥ 40 `[x]` tasks across backend/web/mobile/platform, weighted to the last 30 days): does the
   code, test or doc deliver the full task text? Delivered / partial (name the missing part) / not found.
   Partial and not-found are findings (type gap, refs `MID-T##`).
2. Closable: ≥ 30 likely open tasks whose text the code already satisfies — evidence each; close nothing.
3. Duplicates: open tasks in different milestones describing the same work.
4. Blockers: the `**Blocked …:**` lines and the tasks waiting on the owner or an outside party, clustered into
   root blockers (pilots, lawyer, domain OQ-7, provider accounts, Google OAuth, Twilio, Grafana, manage-link…)
   with how many tasks each one unblocks.
5. Alpha remainder: the open alpha tasks and what holds each today.
6. Status lines contradicting their tasks.

**Metrics:** done sampled / delivered / partial / not found; closable candidates; duplicate pairs; root
blockers with task counts.
**Not yours:** product gaps outside any plan → K1; doc coherence → J2.
<!-- /brief -->

<!-- brief:K2 -->
# K2 — Pilot launch readiness
Effort xhigh · chain 4 · budget 50 min

**Question:** what stands between today's main and a real salon running its daily work on the product for
two weeks?

**Read first:** `docs/testing/alpha-script.md`, `docs/testing/release-checklist.md`,
`docs/prd-2026-08-16/prd/13-phasing.md`, `14-business-lifecycle.md`, `RUN/context/tasks-report.txt`,
`docs/ops/runbook-deploy.md`, `docs/legal/`.

**Checks**
1. Walk the alpha script step by step: the route/page/handler (path:line), the test that covers it, the state
   (works by reading / partial / missing / blocked by an owner action). Write `RUN/scratch/K2/walk.tsv`.
2. A salon's first week: onboarding (sign-up per #2186, profile, services and prices, staff invitation and
   accept, opening hours); importing clients and future appointments (a Booksy export arrives by e-mail only);
   daily calendar use; reminders reaching phones (SMS sender, e-mail SPF/DKIM/DMARC — by reading config and
   docs); client self-booking; cancellations; end of day — what breaks or needs a workaround.
3. Support and recovery: how a salon asks for help; how an operator fixes a wrong booking or restores a
   deleted client; backup and restore readiness.
4. Legal minimum: terms, privacy notice, data processing agreement with the salon, consent texts — present
   in `docs/legal` and wired into the product?
5. Owner hands: everything that needs the owner or an outside account before a pilot, in dependency order.

Put a go/no-go matrix in the `.md`: area · state · blocker · owner action · lane owning the detail.
**Metrics:** alpha steps / working / partial / missing / blocked.
**Not yours:** deep defects of each area — name the owning lane (C1, B3, F2, H2…) instead of re-auditing.
<!-- /brief -->

<!-- brief:K1 -->
# K1 — Product gaps against the Polish market
Effort xhigh · chain 5 · budget 50 min · web research

**Question:** what do Polish salons expect from a booking/CRM product that this PRD lacks, schedules late or
does worse — and which of these are reasons to leave the market leader?
Product frame (owner): marketplace from day one, Poland first, every beauty vertical, four surfaces (panel,
booking site, business app, client app).

**Read first:** `docs/prd-2026-08-16/prd/00-INDEX.md`, `05-marketplace.md`, `08-marketing-inventory.md`,
`13-phasing.md`, `IDEAS-2026-08-16.md`, `OPEN-POINTS.md`.

**Research** (cite every URL; official product, help-centre and pricing pages; reviews only as signals):
Booksy, Versum (both Booksy group), Fresha, and the other Polish salon systems you find (search in Polish:
"program do salonu kosmetycznego", "system rezerwacji online salon fryzjerski", "aplikacja do zarządzania
salonem").

**Checks**
1. Feature matrix `RUN/scratch/K1/matrix.tsv`: online booking, marketplace, reminders, deposits and no-show
   fees, card on file, POS and fiscal printers, inventory, vouchers, passes/packages, loyalty, campaigns,
   reviews, Google/Instagram/Facebook booking, waitlist, commissions and payroll, multi-location, reports,
   client app, import from competitors, pricing model — competitors vs this PRD (FR id, phase) vs code today.
2. Table stakes missing or late: in every competitor, absent from the PRD or scheduled after beta.
3. Switching reasons: what salons complain about in the leader (fees, marketplace commissions, lock-in,
   support) — does this plan answer them?
4. Planned differentiators worth keeping.
Every item is `type: improvement` or `decision-challenge` with `owner_decision` filled; no code findings.

**Metrics:** competitors reviewed; features compared; table-stakes gaps.
<!-- /brief -->

<!-- brief:I1 -->
# I1 — Backend code quality
Effort xhigh · chain 1 · budget 50 min

**Question:** what in the backend's code makes every change slower or riskier than it needs to be?
Scope: `apps/api/src`, `packages/domain`, `packages/db/src` (not migrations). Sample: the six largest API
modules (availability, clients, sales, identity, catalog, notifications) and `shared/`.

**Checks**
1. Error handling: swallowed errors (`catch {}`, log-only catch on writes), causes lost, inconsistent domain →
   HTTP mapping.
2. Logging: unstructured logs, missing correlation ids, wrong levels.
3. Typing: `any`, `as unknown as`, non-null assertions on external data, `@ts-expect-error`/`@ts-ignore` —
   counts and the worst ten.
4. `eslint-disable` without a reason; TODO/FIXME/HACK inventory with age (`git blame` on a sample).
5. Dead code: exports with zero callers (`zerograph impact <Symbol> --depth 1 --stale` on 30 exports from
   module indexes).
6. Pattern consistency across modules (layering, DI, config access, transactions) — the outliers and why it
   matters.
7. Complexity: functions over 100 lines, files over 800, deep nesting.

**Metrics:** `any` casts; ts-ignores; eslint-disables with / without reason; TODOs; dead exports sampled / found.
**Not yours:** security → C1/C2; concurrency → L1; boundaries → A1.
<!-- /brief -->

<!-- brief:I2 -->
# I2 — Frontend code quality
Effort xhigh · chain 2 · budget 50 min

**Question:** what in the panel's and the booking site's code makes UI changes slow or fragile?
Scope: `apps/panel/src`, `apps/booking/src`, `packages/api-client`, `packages/i18n` usage. Sample.

**Checks**
1. Component size and responsibility: components over 300 lines; fetching, state and rendering mixed; prop
   drilling or context misuse.
2. State: server vs client state; server state duplicated into local stores; derived state stored.
3. Data layer: api-client used consistently; failed-request handling; types from contracts vs hand-written.
4. Forms: one approach or several; validation shared with the API contracts?
5. Typing and lint: `any`, casts on API data, `eslint-disable` (above all `react-hooks/exhaustive-deps` and
   `jsx-a11y`), `@ts-ignore`.
6. Dead and duplicated components; app-local copies of `packages/ui` components.
7. What panel tests test: behaviour or implementation details.

**Metrics:** components over 300 lines; `any`/casts; hook-deps disables; duplicated components.
**Not yours:** performance → D2; UX flows → F1; UI kit → F3.
<!-- /brief -->

<!-- brief:J2 -->
# J2 — Docs coherence, agent tooling, repository hygiene
Effort xhigh · chain 4 · budget 50 min

**Question:** does the repository tell an engineer or an agent the truth quickly, and what dead weight slows
both down?

**Read first:** `README.md`, `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/skills/*/SKILL.md` (frontmatter and
commands), `.claude/agents/`, `docs/dev-setup.md`, `docs/agent-context.md`, `.changeset/` (count),
`.gitattributes`, `.gitignore`.

**Checks**
1. Instructions that lie: commands named in CLAUDE.md files, skills and dev-setup that do not exist in
   package.json scripts or bins at SHA; the graph tool named inconsistently (zerograph at SHA — leftover
   `repograph`/`graphify` instructions are findings); skills pointing at missing files.
2. Tracked dead weight: `graphify-out/` (≈ 2.4 k tracked files while the graph is zerograph), `research/`,
   `.agents/`, `prototype/` — file counts and bytes (`git -C WT ls-files <dir> | wc -l`, bytes via node),
   whether anything reads them, the cost to agents' searches and to clones. Propose keep / move / delete;
   the owner decides.
3. Changesets: ≈ 175 pending files — is the release flow consuming them; the `changelog-pl` job.
4. Broken links: a read-only node script in `RUN/scratch/J2/` over `docs/**/*.md` checking relative links
   and file anchors — counts and the worst areas.
5. MODULE.md currency: for 5 workspaces, the stated public contract vs actual exports.
6. Large tracked files: the biggest blobs (node over `git ls-files -z` + `fs.statSync`); binaries that belong
   outside git.

**Metrics:** instruction commands checked / broken; tracked files per dead-weight dir; broken links;
pending changesets.
**Not yours:** ADR drift → A2; plan ticks → J1.
<!-- /brief -->

<!-- brief:merge -->
# Merge — one list from all lanes
Effort xhigh · budget 60 min · writes `RUN/merged/`

1. `node RUN/bin/scan.mjs check RUN`, then `node RUN/bin/scan.mjs compact RUN`. Read
   `RUN/merged/compact.tsv` fully (in chunks if long) and every `RUN/lanes/*.md`. Open a lane's `.json`
   only to settle a duplicate or a doubt.
2. Group duplicates: the same root cause in the same place, or the same cause in several places → one group.
   Canonical member = the best evidence, then the highest confidence. Members disagreeing on severity → set
   the severity the evidence supports and say why in `note`. Findings with `foreign` set usually duplicate
   the owning lane's.
3. Drop only: a non-info finding with no evidence; a finding about something outside the repository at SHA;
   a pure restatement. Every drop goes into `dropped` with a reason. Known findings are **not** dropped —
   verification judges them.
4. Write `RUN/merged/map.json`:
   `{ "groups": [ { "canonical": "C1-03", "members": ["C1-03", "L1-07"], "theme": "T02", "severity": "high", "note": "" } ], "dropped": [ { "id": "I2-14", "reason": "" } ] }`
   List only groups with more than one member or with an override — the script makes every unlisted
   finding its own group. Run `node RUN/bin/scan.mjs merge RUN` → `merged/findings.json` and
   `merged/index.tsv` with `SCAN-###` ids. Fix and rerun until it reports no unknown ids.
5. Themes: `RUN/merged/themes.md` — 8 to 15 cross-cutting themes or root causes (`T01`…): the mechanism in
   one paragraph, the SCAN ids it explains, the structural fix that removes the class of problem. Put the
   theme ids into map.json groups where useful and rerun the merge.
6. Verify queue, in this order up to 144 findings: every critical; every high; every decision-challenge;
   medium below `proven`; improvement/optimization rated medium or above. Split it into at most 18 packs of
   at most 8 by area — the same modules and files — so a verifier reads an area once. Write
   `RUN/merged/packs.json` (`[{ "id": "P01", "area": "…", "scan_ids": ["SCAN-001"] }]`).
7. `RUN/merged/merge-log.md`: counts in and out, groups made, drops with reasons, what stays unverified and why.

Return the packs object the schema asks for.
<!-- /brief -->

<!-- brief:verify -->
# Verify — confirm or refute one pack
Effort xhigh · budget 30 min · writes `RUN/verify/<pack>.json`

You did not write these findings. Find out whether each is true, at SHA, in WT.

1. `node RUN/bin/scan.mjs show RUN <the ids of your pack>`.
2. For each finding: re-read every cited line; follow the scenario's path through the code; look for the guard
   the finder may have missed (middleware, decorator, RLS policy, DB constraint, a caller's check, a config
   default); check known state (preamble B, steps 1–4); judge the severity against the rubric; judge whether
   the fix is sound and respects the hard rules.
3. One verdict per finding:
   - `CONFIRMED` — true as stated.
   - `CONFIRMED-ADJUSTED` — true, but severity / confidence / stage / effort change: set the new values.
   - `KNOWN` — a task or open point already tracks it: give `known_ids`.
   - `DECIDED` — a recorded decision accepts it: say where. If the decision's premise is false now, use
     `CONFIRMED` and say "decision-challenge".
   - `REFUTED` — false: `note` names the guard or the misreading with `path:line`.
   - `UNCERTAIN` — not settled within budget: `note` says exactly what would settle it.
   Refuting needs evidence exactly like confirming. There is no default verdict.
4. You may add evidence (`evidence_added`) and run existing unit tests in WT (≤ 3). No SANDBOX.
5. Write and validate `RUN/verify/<pack>.json`:
   `{ "pack": "P01", "verdicts": [ { "scan_id": "SCAN-004", "verdict": "CONFIRMED-ADJUSTED", "severity": "medium", "confidence": "high", "stage": "", "effort": "", "note": "≤ 400 chars", "evidence_added": [], "known_ids": [], "fix_ok": true, "fix_note": "" } ] }`

Return the summary the schema asks for.
<!-- /brief -->

<!-- brief:synth-architect -->
# Synthesis 1 — the report
Effort xhigh · writes `RUN/REPORT.md`

1. `node RUN/bin/scan.mjs apply RUN` → `final/findings.json`, `final/findings.tsv` (by priority),
   `final/dropped.tsv`, `final/counts.json`. Read `final/findings.tsv`, `final/counts.json`,
   `merged/themes.md`, `merged/merge-log.md` and every `lanes/*.md` (metrics, coverage, questions). Use
   `scan.mjs show RUN <ids>` for the details of the findings you write about.
2. Write `RUN/REPORT.md` in English, 600–1200 lines, every claim traceable to SCAN ids:
   1. **Executive summary** (≤ 30 lines): the state of the project in one paragraph; the 10 risks that
      matter most; the pilot readiness verdict; the three structural moves with the biggest payoff.
   2. **Scorecard**, one row per area — security, tenancy, privacy & legal, money & time, calendar, schema
      truth, API & contracts, reliability, DB performance, frontend performance, tests, gates, CI/CD, ops &
      observability, mobile & sync, panel UX/a11y/i18n, booking site, UI kit, backend code, frontend code,
      dependencies, docs & plans, product vs market: grade A–E, a one-line reason, confirmed counts by severity.
   3. **Top risks**: every confirmed critical and high — what, where (path:line), scenario, fix, effort,
      refs, SCAN id.
   4. **Themes and root causes**: deepened from themes.md — mechanism, the findings it explains, the
      structural fix and its cost.
   5. **Architecture recommendations and ADR candidates**: context, options, recommendation, what it
      supersedes; mark those needing an owner decision.
   6. **Optimizations**: performance, CI time, developer loop — the expected gain and how to measure it.
   7. **Gap map**: product (vs market and PRD); plans (ticks vs code, closable tasks); tests (FRs without
      tests, weakly guarded INV rows); schema (prd/02 vs code).
   8. **Pilot launch readiness**: the go/no-go matrix (from K2, corrected by confirmed findings) and the
      owner-hands list in order.
   9. **Strengths** worth keeping (from the lanes' `metrics.strengths`).
   10. **Roadmap** Now (this week) / Next (2–4 weeks) / Later, each item with SCAN ids.
   11. **Coverage and limits**: lanes skipped or failed, unverified counts, what no lane checked, method limits
       (no database, no builds, no staging access).
   Status discipline: CONFIRMED and CONFIRMED-ADJUSTED are stated as facts; UNVERIFIED and UNCERTAIN are
   labelled wherever they appear; KNOWN, DECIDED and REFUTED appear only as counts and in the coverage section.

Return the files object.
<!-- /brief -->

<!-- brief:synth-planner -->
# Synthesis 2 — tasks, decisions, quick wins
Effort xhigh · writes `RUN/tasks-proposed.md`, `RUN/owner-decisions.md`, `RUN/quick-wins.md`

Read `RUN/REPORT.md` (its roadmap is your frame), `final/findings.tsv`, `merged/themes.md`,
`RUN/context/open-tasks.tsv`, and the header lines of the milestone files you target. Nothing you write edits
the repository. If `REPORT.md` is missing, work from `final/` and `merged/themes.md` and say so at the top of
each file.

1. **`tasks-proposed.md`** — proposed task lines grouped by target milestone (an existing MID whose scope
   fits, or "NEW milestone proposal: <name> — why"), in the milestone files' format:
   `- [ ] **T??** <imperative text, complete enough to be ticked by its full text> (<estimate>d)` — `T??`
   because ids are assigned when a line is added — then one indented line:
   `from SCAN-###[, …] · stage alpha|beta|release · <flags>`. Flags: `owner-decision OD-SCAN-##`,
   `build-config: needs owner request`, `PRD 02 first`, `new dependency: owner approval`. Group the lines
   into batches B1…Bn by area and dependency, each with a one-line goal, the check that proves it done, and an
   order that respects one PR on the forge at a time. Then two sections: **Closable now** (open tasks the code
   already satisfies, with evidence — the owner closes them through the normal trailer flow) and **Re-scope or
   merge** (duplicates, partial ticks).
2. **`owner-decisions.md`** — at most 25, by impact: `OD-SCAN-##` · the question · context with SCAN ids ·
   options A/B(/C) with pros and cons · recommendation and why · the cost of deciding later · whether it
   blocks the pilot.
3. **`quick-wins.md`** — at most 30 confirmed effort-S fixes that need no owner decision: path:line, the fix
   in ≤ 5 lines, the test that proves it; by priority, grouped into 2–3 PR-sized batches.

Return the files object.
<!-- /brief -->
