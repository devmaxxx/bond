import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

import type { PrStatus, RepoStatus, TaskItem, TurnProgress } from '../types'
import { activeLoginOf, expectedLogin, isBonlivaRemote, parseJson, parseRemote, resolveTracker, toPrStatus } from './parse'
import type { Accounts, Manifest, RawPr } from './parse'
import { paneLines, statusLine } from './view'
import type { Tone } from './view'

const PANE = 'bond-hud'
const PANE_TITLE = 'bond'
const PANE_COLUMNS = 46
const POLL_MS = 60_000
const REFRESH_DEBOUNCE_MS = 400
const COMMAND_TIMEOUT_MS = 15_000
const PR_FIELDS = 'number,title,state,isDraft,reviewDecision,url,statusCheckRollup'
const IDLE_TURN: TurnProgress = { isRunning: false, startedAt: 0, toolCount: 0, lastTool: null }
// Commands after which the branch, the remote, the gh account or the PR may have moved.
const REFRESH_AFTER = /\bgit\s+(checkout|switch|branch|push|pull|merge|rebase|reset|worktree|remote)\b|\bgh\s+(auth\s+switch|pr)\b/

const TONE_PROPS: Record<Tone, { bold?: boolean; dimColor?: boolean; color?: string }> = {
  heading: { bold: true },
  plain: {},
  dim: { dimColor: true },
  ok: { color: 'green' },
  bad: { color: 'red' },
  warn: { color: 'yellow' },
}

const repo = atom({ plugin: 'bond-hud', key: 'repo' } as const, null)
const pr = atom({ plugin: 'bond-hud', key: 'pr' } as const, null)
const tasks = atom({ plugin: 'bond-hud', key: 'tasks' } as const, [])
const agents = atom({ plugin: 'bond-hud', key: 'agents' } as const, [])
const turn = atom({ plugin: 'bond-hud', key: 'turn' } as const, IDLE_TURN)

// A slow refresh (gh goes to the network) that lands after a newer one must not overwrite it.
let generation = 0
// session.start fires again after /clear; a poll left running would stack with the new one.
let poll: Timer | null = null
let pendingRefresh: Timer | null = null

export const register: Register = (on, options) => {
  const accounts = accountsOf(options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'bond-hud', description: 'Open the bond HUD pane and refresh its status' })
    openPane($).catch(() => undefined)
    refreshSoon($, accounts)
    poll?.cancel()
    poll = $.clock.every(POLL_MS, () => void refreshQuietly($, accounts))

    return started
  })

  on('command.run', { command: 'bond-hud' }, async $ => {
    await openPane($)
    await refresh($, accounts)

    return { text: 'bond HUD opened.' }
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
    const { Box, Text } = $.ui.resolve(e)
    const [repoNow, prNow, turnNow, taskList, agentList, now] = await Promise.all([
      read($, repo),
      read($, pr),
      read($, turn),
      read($, tasks),
      read($, agents),
      $.clock.now(),
    ])
    const lines = paneLines({ repo: repoNow, pr: prNow, turn: turnNow, tasks: taskList, agents: agentList, now })

    return (
      <Box flexDirection="column">
        {lines.map((line, index) => (
          <Text key={String(index)} wrap="truncate-end" {...TONE_PROPS[line.tone]}>
            {line.text || ' '}
          </Text>
        ))}
      </Box>
    )
  })
}

// Bursts (a turn ending right after a git command) collapse into one refresh instead of N gh round-trips.
function refreshSoon($: EngineInterface, accounts: Accounts): void {
  pendingRefresh?.cancel()
  pendingRefresh = $.clock.after(REFRESH_DEBOUNCE_MS, () => void refreshQuietly($, accounts))
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
  $.ui.status(statusLine(repoNow, prNow))
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
