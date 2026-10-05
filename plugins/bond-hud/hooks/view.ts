import type { AgentItem, PrStatus, RepoStatus, TaskItem, TurnProgress } from '../types'

export type Tone = 'heading' | 'plain' | 'dim' | 'ok' | 'bad' | 'warn'

export type Line = { text: string; tone: Tone }

export type HudState = {
  repo: RepoStatus | null
  pr: PrStatus | null
  turn: TurnProgress
  tasks: readonly TaskItem[]
  agents: readonly AgentItem[]
  now: number
}

const MAX_TASKS = 12
const MAX_FAILING = 5
const FINISHED_AGENT = new Set(['completed', 'failed', 'killed'])
const TASK_MARK: Record<TaskItem['status'], string> = { completed: '✔', in_progress: '▸', pending: '○' }
const GAP: Line = { text: '', tone: 'plain' }

export function statusLine(repo: RepoStatus | null, pr: PrStatus | null): string | undefined {
  if (repo === null) {
    return undefined
  }
  const parts = [`⎇ ${repo.branch}`, repo.host ?? 'unknown host']
  if (repo.tracker === 'jira') {
    parts.push('jira')
  }
  if (repo.login !== null) {
    parts.push(accountLabel(repo))
  }
  if (pr !== null) {
    parts.push(`PR #${pr.number} ${checksLabel(pr)}`.trimEnd())
  }

  return parts.join(' · ')
}

export function isWrongAccount(repo: RepoStatus): boolean {
  return repo.expectedLogin !== null && repo.login !== repo.expectedLogin
}

function accountLabel(repo: RepoStatus): string {
  return isWrongAccount(repo) ? `gh ${repo.login} ⚠ want ${repo.expectedLogin}` : `gh ${repo.login}`
}

function checksLabel(pr: PrStatus): string {
  const { passed, failed, pending } = pr.checks
  const counts = [
    failed > 0 ? `✗${failed}` : '',
    pending > 0 ? `…${pending}` : '',
    passed > 0 ? `✓${passed}` : '',
  ]

  return counts.filter(Boolean).join(' ')
}

export function paneLines(state: HudState): Line[] {
  return [
    ...repoLines(state.repo),
    GAP,
    ...prLines(state.repo, state.pr),
    GAP,
    ...progressLines(state),
  ]
}

function repoLines(repo: RepoStatus | null): Line[] {
  const heading: Line = { text: 'Repo', tone: 'heading' }
  if (repo === null) {
    return [heading, { text: 'Not in a git repository', tone: 'dim' }]
  }
  const lines: Line[] = [
    heading,
    { text: `⎇ ${repo.branch}`, tone: 'plain' },
    { text: `${repo.host ?? 'unknown host'} · tracker ${repo.tracker}`, tone: 'dim' },
  ]
  if (repo.login !== null) {
    lines.push({ text: accountLabel(repo), tone: isWrongAccount(repo) ? 'warn' : 'ok' })
  }

  return lines
}

function prLines(repo: RepoStatus | null, pr: PrStatus | null): Line[] {
  const heading: Line = { text: 'Pull request', tone: 'heading' }
  if (repo?.host !== 'github') {
    return [heading, { text: 'Tracked for GitHub repos only', tone: 'dim' }]
  }
  if (pr === null) {
    return [heading, { text: 'No PR for this branch', tone: 'dim' }]
  }

  return [
    heading,
    { text: `#${pr.number} ${pr.title}`, tone: 'plain' },
    { text: prStateLabel(pr), tone: 'dim' },
    checksLine(pr),
    ...pr.checks.failing.slice(0, MAX_FAILING).map(name => ({ text: `  ✗ ${name}`, tone: 'bad' as const })),
  ]
}

function prStateLabel(pr: PrStatus): string {
  const state = pr.isDraft ? 'draft' : pr.state.toLowerCase()
  const review = pr.review === null ? 'no review yet' : pr.review.toLowerCase().replaceAll('_', ' ')

  return `${state} · ${review}`
}

function checksLine(pr: PrStatus): Line {
  const { passed, failed, pending } = pr.checks
  if (passed + failed + pending === 0) {
    return { text: 'No checks', tone: 'dim' }
  }
  const text = `CI ✓ ${passed}  ✗ ${failed}  … ${pending}`
  if (failed > 0) {
    return { text, tone: 'bad' }
  }

  return { text, tone: pending > 0 ? 'warn' : 'ok' }
}

function progressLines(state: HudState): Line[] {
  return [
    { text: 'Progress', tone: 'heading' },
    turnLine(state.turn, state.now),
    ...taskLines(state.tasks),
    ...agentLines(state.agents),
  ]
}

function turnLine(turn: TurnProgress, now: number): Line {
  const tools = `${turn.toolCount} tool${turn.toolCount === 1 ? '' : 's'}`
  if (turn.isRunning) {
    const last = turn.lastTool === null ? '' : ` · last ${turn.lastTool}`
    return { text: `● working ${elapsed(now - turn.startedAt)} · ${tools}${last}`, tone: 'warn' }
  }
  if (turn.startedAt === 0) {
    return { text: 'Idle', tone: 'dim' }
  }

  return { text: `Idle · last turn ${tools}`, tone: 'dim' }
}

function taskLines(tasks: readonly TaskItem[]): Line[] {
  if (tasks.length === 0) {
    return []
  }
  const done = tasks.filter(task => task.status === 'completed').length
  const start = windowStart(tasks)
  const shown = tasks.slice(start, start + MAX_TASKS).map(task => ({
    text: `${TASK_MARK[task.status]} ${task.subject}`,
    tone: task.status === 'completed' ? ('dim' as const) : ('plain' as const),
  }))
  const hiddenAfter = tasks.length - start - shown.length
  const before: Line[] = start > 0 ? [{ text: `… ${start} earlier`, tone: 'dim' }] : []
  const after: Line[] = hiddenAfter > 0 ? [{ text: `… ${hiddenAfter} more`, tone: 'dim' }] : []

  return [
    { text: `Tasks ${done}/${tasks.length}`, tone: done === tasks.length ? 'ok' : 'plain' },
    ...before,
    ...shown,
    ...after,
  ]
}

// A long checklist scrolls so the first unfinished task stays in view instead of finished ones.
function windowStart(tasks: readonly TaskItem[]): number {
  const firstOpen = tasks.findIndex(task => task.status !== 'completed')
  const latestStart = Math.max(0, tasks.length - MAX_TASKS)

  return firstOpen === -1 ? latestStart : Math.min(firstOpen, latestStart)
}

function agentLines(agents: readonly AgentItem[]): Line[] {
  if (agents.length === 0) {
    return []
  }
  const live = agents.filter(agent => !FINISHED_AGENT.has(agent.status))
  const finished = agents.length - live.length

  return [
    { text: `Agents ${live.length} running · ${finished} done`, tone: 'plain' },
    ...live.map(agent => ({ text: `  ⚙ ${agent.description} (${agent.status})`, tone: 'warn' as const })),
  ]
}

function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(seconds / 60)

  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`
}
