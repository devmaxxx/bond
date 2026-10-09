import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

import type { PrStatus, RepoStatus, TaskItem, TurnProgress } from '../types'
import { cacheStatus, shouldWarn, ttlMs } from './cache'
import { activeLoginOf, expectedLogin, isBonlivaRemote, parseJson, parseRemote, resolveTracker, toPrStatus } from './parse'
import type { Accounts, Manifest, RawPr } from './parse'
import { paneLines, statusLine } from './view'
import type { Tone } from './view'

const PANE = 'bond-cockpit'
const PANE_TITLE = 'bond cockpit'
const PANE_COLUMNS = 46
const POLL_MS = 60_000
const TICK_MS = 1000
const DEFAULT_CACHE_TTL = '1h'
const DEFAULT_WARN_SECONDS = 10
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

const repo = atom({ plugin: 'bond-cockpit', key: 'repo' } as const, null)
const pr = atom({ plugin: 'bond-cockpit', key: 'pr' } as const, null)
const tasks = atom({ plugin: 'bond-cockpit', key: 'tasks' } as const, [])
const agents = atom({ plugin: 'bond-cockpit', key: 'agents' } as const, [])
const turn = atom({ plugin: 'bond-cockpit', key: 'turn' } as const, IDLE_TURN)
const cache = atom({ plugin: 'bond-cockpit', key: 'cache' } as const, null)
// Written only when the countdown's text changes, so the pane redraws once a minute, then once a second.
const countdown = atom({ plugin: 'bond-cockpit', key: 'countdown' } as const, '')

// A slow refresh (gh goes to the network) that lands after a newer one must not overwrite it.
let generation = 0
// session.start fires again after /clear; a poll left running would stack with the new one.
let poll: Timer | null = null
let pendingRefresh: Timer | null = null
let tick: Timer | null = null
// The cache entry (by its request time) already warned about, so the toast fires once per entry.
let warnedAt: number | null = null
// Only a model switch reports the TTL; until one does, the configured one stands.
let cacheTtlMs = ttlMs(DEFAULT_CACHE_TTL)
let warnMs = DEFAULT_WARN_SECONDS * 1000

export const register: Register = (on, options) => {
  const accounts = accountsOf(options)
  const warnSeconds = Number(options.cacheWarnSeconds ?? DEFAULT_WARN_SECONDS)
  warnMs = Number.isFinite(warnSeconds) ? Math.max(0, warnSeconds) * 1000 : DEFAULT_WARN_SECONDS * 1000
  cacheTtlMs = ttlMs(String(options.cacheTtl ?? DEFAULT_CACHE_TTL))

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'bond-cockpit', description: 'Open the bond cockpit pane and refresh its status' })
    openPane($).catch(() => undefined)
    refreshSoon($, accounts)
    poll?.cancel()
    poll = $.clock.every(POLL_MS, () => void refreshQuietly($, accounts))
    tick?.cancel()
    tick = $.clock.every(TICK_MS, () => void onTick($).catch(() => undefined))

    return started
  })

  on('command.run', { command: 'bond-cockpit' }, async $ => {
    await openPane($)
    await refresh($, accounts)

    return { text: 'bond cockpit opened.' }
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
      await update($, cache, () => null)
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

  on('turn.step', async function* ($, e, next) {
    // The cache entry's TTL restarts when the request reads or writes it, not when a long answer finishes.
    const at = await $.clock.now()
    const stepped = yield* next(e)
    if (e.agentId === undefined && stepped.usage !== null) {
      const { cache_read_input_tokens, cache_creation_input_tokens, input_tokens } = stepped.usage
      // The API reports a cache counter as null when the request used no caching; NaN would poison the hit rate.
      await update($, cache, () => ({
        read: cache_read_input_tokens ?? 0,
        wrote: cache_creation_input_tokens ?? 0,
        fresh: input_tokens ?? 0,
        at,
        ttlMs: cacheTtlMs,
      }))
      await pushStatus($)
    }

    return stepped
  })

  on('classic.PostModelSwitch', async ($, e, next) => {
    cacheTtlMs = ttlMs(e.cache_ttl)

    return next(e)
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
    const [repoNow, prNow, turnNow, taskList, agentList, cacheNow, now] = await Promise.all([
      read($, repo),
      read($, pr),
      read($, turn),
      read($, tasks),
      read($, agents),
      read($, cache),
      $.clock.now(),
      // Not used below: reading it subscribes the pane to the countdown, so it redraws as the text ticks.
      read($, countdown),
    ])
    const lines = paneLines({ repo: repoNow, pr: prNow, turn: turnNow, tasks: taskList, agents: agentList, cache: cacheNow, warnMs, now })

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
  await pushStatus($)
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

async function pushStatus($: EngineInterface): Promise<void> {
  const [repoNow, prNow, cacheNow, now] = await Promise.all([read($, repo), read($, pr), read($, cache), $.clock.now()])
  $.ui.status(statusLine(repoNow, prNow, cacheStatus(cacheNow, now, warnMs)))
}

async function onTick($: EngineInterface): Promise<void> {
  const [cacheNow, shown, turnNow, now] = await Promise.all([read($, cache), read($, countdown), read($, turn), $.clock.now()])
  const text = cacheStatus(cacheNow, now, warnMs) ?? ''
  if (text !== shown) {
    await update($, countdown, () => text)
    await pushStatus($)
  }
  // Mid-turn the user cannot send a message, so the advice would be noise.
  if (cacheNow !== null && !turnNow.isRunning && shouldWarn(cacheNow, now, warnMs, warnedAt)) {
    warnedAt = cacheNow.at
    const seconds = Math.ceil((cacheNow.at + cacheNow.ttlMs - now) / 1000)
    $.ui.toast(`bond-cockpit: cache expires in ${seconds}s: send a message now`)
  }
}
