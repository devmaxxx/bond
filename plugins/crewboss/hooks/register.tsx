import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

import type { CrewStatus, PrStatus, RepoStatus, TaskItem, TurnProgress } from '../types'
import { lastJson, pickProfileFile, toClaimable, toLoopTask, toOpenPrs, toProfile } from './crew-parse'
import type { CrewProfile } from './crew-parse'
import { activeLoginOf, expectedLogin, isBonlivaRemote, parseJson, parseRemote, resolveTracker, toPrStatus } from './parse'
import type { Accounts, Manifest, RawPr } from './parse'
import { paneCards, statusLine } from './view'
import type { Action, Card, Row, Tone } from './view'

const PANE = 'crewboss'
const PANE_TITLE = 'crewboss'
const PANE_COLUMNS = 52
const POLL_MS = 60_000
// The claimable list boots the repo's task CLI and walks every issue; once a minute would be most of a minute.
const CREW_POLL_MS = 5 * 60_000
const REFRESH_DEBOUNCE_MS = 400
const COMMAND_TIMEOUT_MS = 15_000
const PR_FIELDS = 'number,title,state,isDraft,reviewDecision,url,statusCheckRollup'
const OPEN_PR_FIELDS = 'number,title,isDraft,reviewDecision,url,statusCheckRollup'
const GH_TIMEOUT_MS = 20_000
// The task CLI boots tsx and lists every issue through gh, which takes far longer than a git call.
const CLAIMABLE_TIMEOUT_MS = 90_000
const IDLE_TURN: TurnProgress = { isRunning: false, startedAt: 0, toolCount: 0, lastTool: null }
// Commands after which the branch, the remote, the gh account or the PR may have moved.
const REFRESH_AFTER = /\bgit\s+(checkout|switch|branch|push|pull|merge|rebase|reset|worktree|remote)\b|\bgh\s+(auth\s+switch|pr)\b/
// Commands after which the crewboss loop, its pull requests or the claimable queue may have moved.
// `crewboss` counts only in command position, not as a path segment (`git diff plugins/crewboss/...`).
const CREW_REFRESH_AFTER = /(?:^|[;&|(]\s*)crewboss(?:\s|$)|\bpnpm\s+tasks\b|\bgh\s+(pr|issue)\b/

const TONE_COLOR: Record<Tone, string | undefined> = {
  heading: undefined,
  plain: undefined,
  dim: 'gray',
  ok: 'green',
  bad: 'red',
  warn: 'yellow',
  accent: 'cyan',
}

const crew = atom({ plugin: 'crewboss', key: 'crew' } as const, null)
const repo = atom({ plugin: 'crewboss', key: 'repo' } as const, null)
const pr = atom({ plugin: 'crewboss', key: 'pr' } as const, null)
const tasks = atom({ plugin: 'crewboss', key: 'tasks' } as const, [])
const agents = atom({ plugin: 'crewboss', key: 'agents' } as const, [])
const turn = atom({ plugin: 'crewboss', key: 'turn' } as const, IDLE_TURN)

type Run = { ok: boolean; stdout: string; stderr: string }

// A slow refresh (gh goes to the network) that lands after a newer one must not overwrite it.
let generation = 0
let crewGeneration = 0
// session.start fires again after /clear; a poll left running would stack with the new one.
let poll: Timer | null = null
let crewPoll: Timer | null = null
let pendingRefresh: Timer | null = null
let pendingCrewRefresh: Timer | null = null

export const register: Register = (on, options) => {
  const accounts = accountsOf(options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'crewboss', description: 'Open the crewboss pane: loop task, my PRs, issues to claim, repo and progress' })
    openPane($).catch(() => undefined)
    refreshSoon($, accounts)
    void refreshCrewQuietly($)
    poll?.cancel()
    poll = $.clock.every(POLL_MS, () => void refreshQuietly($, accounts))
    crewPoll?.cancel()
    crewPoll = $.clock.every(CREW_POLL_MS, () => void refreshCrewQuietly($))

    return started
  })

  on('command.run', { command: 'crewboss' }, async $ => {
    await openPane($)
    // In turn: the crew refresh writes the status line last, from the repo the first one just read.
    await refresh($, accounts)
    await refreshCrew($)

    return { text: 'crewboss pane opened.' }
  })

  on('classic.CwdChanged', async ($, e, next) => {
    refreshSoon($, accounts)

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, tasks, () => [])
      await update($, agents, () => [])
      await update($, turn, () => IDLE_TURN)
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const startedAt = await $.clock.now()
    await update($, turn, () => ({ isRunning: true, startedAt, toolCount: 0, lastTool: null }))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const completed = await next(e)
    if (e.agentId === undefined) {
      await update($, turn, current => ({ ...current, isRunning: false }))
      refreshSoon($, accounts)
    }
    await syncAgents($)

    return completed
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined) {
      const tool = String(e.tool)
      await update($, turn, current => ({ ...current, toolCount: current.toolCount + 1, lastTool: tool }))
    }

    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (REFRESH_AFTER.test(e.command)) {
      refreshSoon($, accounts)
    }
    if (CREW_REFRESH_AFTER.test(e.command)) {
      refreshCrewSoon($)
    }

    return ran
  })

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const ran = await next(e)
    await syncAgents($)

    return ran
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (isSuccess(ran)) {
      const todos = e.todos.map((todo, index) => ({ id: String(index), subject: todo.content, status: todo.status }))
      await update($, tasks, () => todos)
    }

    return ran
  })

  on('classic.TaskCreated', async ($, e, next) => {
    const created: TaskItem = { id: e.task_id, subject: e.task_subject, status: 'pending' }
    await update($, tasks, list => [...list.filter(task => task.id !== created.id), created])

    return next(e)
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (isSuccess(ran)) {
      await update($, tasks, list => applyTaskUpdate(list, e))
    }

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Link, Button } = $.ui.resolve(e)
    const [crewNow, repoNow, prNow, turnNow, taskList, agentList, now] = await Promise.all([
      read($, crew),
      read($, repo),
      read($, pr),
      read($, turn),
      read($, tasks),
      read($, agents),
      $.clock.now(),
    ])
    const cards = paneCards({ crew: crewNow, repo: repoNow, pr: prNow, turn: turnNow, tasks: taskList, agents: agentList, now })
    const fill = (action: Action) => () => void $.prompt.fill({ text: action.fill })
    const refreshAll = () => void Promise.all([refreshQuietly($, accounts), refreshCrewQuietly($)])

    const actionButton = (action: Action) => (
      <Button key={action.key} label={action.label} variant={action.isPrimary ? 'primary' : 'secondary'} onPress={fill(action)} />
    )

    const rowView = (row: Row, index: number) => (
      <Box key={String(index)} flexDirection="row" gap={1}>
        {row.badge ? <Text inverse bold color={TONE_COLOR[row.badge.tone]}>{` ${row.badge.text} `}</Text> : null}
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="truncate-end" color={TONE_COLOR[row.tone]} dimColor={row.tone === 'dim'}>
            {row.href ? <Link href={row.href}>{row.text}</Link> : row.text || ' '}
          </Text>
        </Box>
        {row.aside ? <Text color={TONE_COLOR[row.aside.tone]}>{row.aside.text}</Text> : null}
        {row.action ? actionButton(row.action) : null}
      </Box>
    )

    const cardView = (card: Card) => (
      <Box key={card.key} flexDirection="column" borderStyle="round" borderColor={TONE_COLOR[card.tone] ?? 'gray'} paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold color={TONE_COLOR[card.tone]}>{card.title}</Text>
          {card.count === undefined ? null : <Text inverse bold>{` ${card.count} `}</Text>}
        </Box>
        {card.rows.map(rowView)}
        {card.actions.length > 0 ? (
          <Box flexDirection="row" gap={1} marginTop={1}>
            {card.actions.map(actionButton)}
          </Box>
        ) : null}
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between" paddingX={1}>
          <Text bold color="cyan">crewboss</Text>
          <Button key="refresh" label="Refresh" onPress={refreshAll} />
        </Box>
        {cards.map(cardView)}
      </Box>
    )
  })
}

// Bursts (a turn ending right after a git command) collapse into one refresh instead of N gh round-trips.
function refreshSoon($: EngineInterface, accounts: Accounts): void {
  pendingRefresh?.cancel()
  pendingRefresh = $.clock.after(REFRESH_DEBOUNCE_MS, () => void refreshQuietly($, accounts))
}

// The crew refresh boots the task CLI for up to 90 s; a burst of gh commands must not queue one run each.
function refreshCrewSoon($: EngineInterface): void {
  pendingCrewRefresh?.cancel()
  pendingCrewRefresh = $.clock.after(REFRESH_DEBOUNCE_MS, () => void refreshCrewQuietly($))
}

function refreshCrewQuietly($: EngineInterface): Promise<void> {
  return refreshCrew($).catch(() => undefined)
}

function refreshQuietly($: EngineInterface, accounts: Accounts): Promise<void> {
  return refresh($, accounts).catch(() => undefined)
}

async function refresh($: EngineInterface, accounts: Accounts): Promise<void> {
  generation += 1
  const mine = generation
  const cwd = await $.session.cwd()
  const repoNow = await collectRepo($, cwd, accounts)
  const prNow = repoNow?.host === 'github' ? await collectPr($, cwd) : null
  if (mine !== generation) {
    return
  }
  await update($, repo, () => repoNow)
  await update($, pr, () => prNow)
  $.ui.status(statusLine(repoNow, prNow, await read($, crew)))
}

async function refreshCrew($: EngineInterface): Promise<void> {
  crewGeneration += 1
  const mine = crewGeneration
  const crewNow = await collectCrew($).catch(() => null)
  if (mine !== crewGeneration) {
    return
  }
  await update($, crew, () => crewNow)
  const [repoNow, prNow] = await Promise.all([read($, repo), read($, pr)])
  $.ui.status(statusLine(repoNow, prNow, crewNow))
}

async function collectRepo($: EngineInterface, cwd: string, accounts: Accounts): Promise<RepoStatus | null> {
  const root = await run($, ['git', 'rev-parse', '--show-toplevel'], cwd)
  if (root === null) {
    return null
  }
  const [branch, remoteUrl, manifest, hasBonlivaMarker] = await Promise.all([
    currentBranch($, cwd),
    run($, ['git', 'remote', 'get-url', 'origin'], cwd),
    readManifest($, root),
    $.fs.exists(`${root}/.bonliva-dev/project.json`),
  ])
  const remote = parseRemote(remoteUrl)
  const isBonliva = hasBonlivaMarker || isBonlivaRemote(remote)
  const host = manifest.host === 'github' || manifest.host === 'bitbucket' ? manifest.host : remote.host
  const isGithub = host === 'github'

  return {
    branch,
    host,
    tracker: resolveTracker(manifest.tracker, isBonliva),
    login: isGithub ? await activeGhLogin($, cwd) : null,
    expectedLogin: isGithub ? expectedLogin(remote, isBonliva, accounts) : null,
  }
}

async function collectPr($: EngineInterface, cwd: string): Promise<PrStatus | null> {
  const out = await run($, ['gh', 'pr', 'view', '--json', PR_FIELDS], cwd)

  return toPrStatus(parseJson(out) as RawPr | null)
}

async function currentBranch($: EngineInterface, cwd: string): Promise<string> {
  const branch = await run($, ['git', 'branch', '--show-current'], cwd)
  if (branch) {
    return branch
  }
  const sha = await run($, ['git', 'rev-parse', '--short', 'HEAD'], cwd)

  return `detached ${sha ?? '?'}`
}

async function activeGhLogin($: EngineInterface, cwd: string): Promise<string | null> {
  const out = await run($, ['gh', 'auth', 'status', '--active', '--hostname', 'github.com', '--json', 'hosts'], cwd)

  return activeLoginOf(parseJson(out))
}

async function readManifest($: EngineInterface, root: string): Promise<Manifest> {
  try {
    const parsed: unknown = JSON.parse(await $.fs.read(`${root}/.bond/project.json`))
    return typeof parsed === 'object' && parsed !== null ? (parsed as Manifest) : {}
  } catch {
    return {}
  }
}

async function run($: EngineInterface, argv: string[], cwd: string): Promise<string | null> {
  try {
    const { exitCode, stdout } = await $.process.run(argv, { cwd, timeoutMs: COMMAND_TIMEOUT_MS })
    return exitCode === 0 ? stdout.trim() : null
  } catch {
    return null
  }
}

async function collectCrew($: EngineInterface): Promise<CrewStatus | null> {
  const [home, stateEnv, configEnv] = await Promise.all([
    $.env.get('HOME'),
    $.env.get('CREWBOSS_STATE_DIR'),
    $.env.get('CREWBOSS_CONFIG_DIR'),
  ])
  if (!home && !(stateEnv && configEnv)) {
    return null
  }
  // As crewboss reads them: an empty variable falls back to the default rather than to the working directory.
  const stateDir = stateEnv || `${home}/.local/state/crewboss`
  const configDir = configEnv || `${home}/.config/crewboss`
  const [task, profile] = await Promise.all([readTask($, stateDir), readProfile($, configDir)])
  if (profile === null) {
    return null
  }
  if (typeof profile === 'string') {
    return { ...emptyCrew(), task, problems: [profile] }
  }
  // crewboss pins every gh call to the profile's account; the machine-global login may be the other one.
  const token = await exec($, ['gh', 'auth', 'token', '--user', profile.ghUser])
  const env: Record<string, string> = token.ok ? { GH_TOKEN: token.stdout } : {}
  const [prs, claimable] = await Promise.all([listPrs($, profile, env), listClaimable($, profile, env)])
  const problems = [
    token.ok ? '' : `gh has no token for ${profile.ghUser}`,
    prs.problem,
    claimable.problem,
  ]
    .filter(Boolean)
    .map(problem => (token.ok && token.stdout !== '' ? problem.replaceAll(token.stdout, '<GH_TOKEN>') : problem))

  return {
    profile: profile.name,
    repo: profile.github,
    ghUser: profile.ghUser,
    task,
    prs: prs.items,
    claimable: claimable.items,
    problems,
  }
}

function emptyCrew(): CrewStatus {
  return { profile: null, repo: null, ghUser: null, task: null, prs: [], claimable: [], problems: [] }
}

async function readTask($: EngineInterface, stateDir: string): Promise<CrewStatus['task']> {
  try {
    return toLoopTask(JSON.parse(await $.fs.read(`${stateDir}/current.json`)))
  } catch {
    return null
  }
}

// null: crewboss is not set up here, so the pane leaves its sections out instead of reporting it broken.
async function readProfile($: EngineInterface, configDir: string): Promise<CrewProfile | string | null> {
  const dir = `${configDir}/profiles`
  let names: string[]
  try {
    names = (await $.fs.list(dir)).map(entry => entry.name)
  } catch {
    return null
  }
  const file = pickProfileFile(names)
  if (file === null) {
    return names.length === 0 ? null : `${dir} must hold exactly one profile`
  }
  try {
    return toProfile(file, JSON.parse(await $.fs.read(`${dir}/${file}`)))
  } catch {
    return `${dir}/${file} is not valid JSON`
  }
}

async function listPrs($: EngineInterface, profile: CrewProfile, env: Record<string, string>) {
  const argv = ['gh', 'pr', 'list', '--repo', profile.github, '--author', profile.ghUser, '--state', 'open', '--json', OPEN_PR_FIELDS]
  const out = await exec($, argv, { env, timeoutMs: GH_TIMEOUT_MS })

  return out.ok
    ? { items: toOpenPrs(parseJson(out.stdout)), problem: '' }
    : { items: [], problem: `gh pr list failed: ${firstLine(out.stderr)}` }
}

async function listClaimable($: EngineInterface, profile: CrewProfile, env: Record<string, string>) {
  const out = await exec($, ['sh', '-c', profile.claimableCommand], {
    cwd: profile.repoPath,
    env,
    timeoutMs: CLAIMABLE_TIMEOUT_MS,
  })
  const parsed = out.ok ? lastJson(out.stdout) : undefined
  if (parsed === undefined) {
    return { items: [], problem: `${profile.claimableCommand} failed: ${firstLine(out.stderr || out.stdout)}` }
  }

  return { items: toClaimable(parsed, profile.github), problem: '' }
}

async function exec(
  $: EngineInterface,
  argv: string[],
  init: { cwd?: string; env?: Record<string, string>; timeoutMs?: number } = {},
): Promise<Run> {
  try {
    const { exitCode, stdout, stderr } = await $.process.run(argv, init)
    return { ok: exitCode === 0, stdout: stdout.trim(), stderr: stderr.trim() }
  } catch (error) {
    return { ok: false, stdout: '', stderr: String(error) }
  }
}

function firstLine(text: string): string {
  return text.split('\n').find(Boolean) ?? 'no output'
}

async function syncAgents($: EngineInterface): Promise<void> {
  const list = await $.agent.list()
  const items = list.map(agent => ({ id: agent.id, description: agent.description, status: agent.status }))
  await update($, agents, () => items)
}

function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE, title: PANE_TITLE, columns: PANE_COLUMNS })
}

function applyTaskUpdate(
  list: readonly TaskItem[],
  change: { taskId: string; subject?: string; status?: string },
): TaskItem[] {
  if (change.status === 'deleted') {
    return list.filter(task => task.id !== change.taskId)
  }

  return list.map(task => (task.id === change.taskId ? withChange(task, change) : task))
}

function withChange(task: TaskItem, change: { subject?: string; status?: string }): TaskItem {
  const status = change.status === 'pending' || change.status === 'in_progress' || change.status === 'completed'
    ? change.status
    : task.status

  return { ...task, subject: change.subject ?? task.subject, status }
}

function isSuccess(ran: { deny?: unknown; isError?: boolean }): boolean {
  return ran.deny === undefined && ran.isError !== true
}

function accountsOf(options: PluginOptions): Accounts {
  return { personal: String(options.personalAccount ?? ''), work: String(options.workAccount ?? '') }
}
