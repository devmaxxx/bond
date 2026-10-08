import type { AgentItem, Checks, CrewStatus, LoopTask, PrStatus, RepoStatus, TaskItem, TurnProgress } from '../types'

export type Tone = 'heading' | 'plain' | 'dim' | 'ok' | 'bad' | 'warn'

export type Line = { text: string; tone: Tone; href?: string }

export type HudState = {
  crew: CrewStatus | null
  repo: RepoStatus | null
  pr: PrStatus | null
  turn: TurnProgress
  tasks: readonly TaskItem[]
  agents: readonly AgentItem[]
  now: number
}

const MAX_TASKS = 12
const MAX_FAILING = 5
const MAX_LISTED = 8
const ATTENTION = new Set(['NeedsHuman', 'HumanControl'])
const FINISHED_AGENT = new Set(['completed', 'failed', 'killed'])
const TASK_MARK: Record<TaskItem['status'], string> = { completed: '✔', in_progress: '▸', pending: '○' }
const GAP: Line = { text: '', tone: 'plain' }

export function statusLine(repo: RepoStatus | null, pr: PrStatus | null, crew: CrewStatus | null = null): string | undefined {
  const loop = crew?.task ? `⚑ #${crew.task.id} ${crew.task.state}` : null
  if (repo === null) {
    return loop ?? undefined
  }
  const parts = [`⎇ ${repo.branch}`, repo.host ?? 'unknown host']
  if (repo.tracker === 'jira') {
    parts.push('jira')
  }
  if (repo.login !== null) {
    parts.push(accountLabel(repo))
  }
  if (pr !== null) {
    parts.push(`PR #${pr.number} ${checksLabel(pr.checks)}`.trimEnd())
  }
  if (loop !== null) {
    parts.push(loop)
  }

  return parts.join(' · ')
}

export function isWrongAccount(repo: RepoStatus): boolean {
  return repo.expectedLogin !== null && repo.login !== repo.expectedLogin
}

function accountLabel(repo: RepoStatus): string {
  return isWrongAccount(repo) ? `gh ${repo.login} ⚠ want ${repo.expectedLogin}` : `gh ${repo.login}`
}

function checksLabel(checks: Checks): string {
  const { passed, failed, pending } = checks
  const counts = [
    failed > 0 ? `✗${failed}` : '',
    pending > 0 ? `…${pending}` : '',
    passed > 0 ? `✓${passed}` : '',
  ]

  return counts.filter(Boolean).join(' ')
}

export function paneLines(state: HudState): Line[] {
  return [
    ...crewLines(state.crew, state.now),
    ...repoLines(state.repo),
    GAP,
    ...prLines(state.repo, state.pr),
    GAP,
    ...progressLines(state),
  ]
}

// No crewboss profile on this machine: the sections are left out rather than shown empty.
function crewLines(crew: CrewStatus | null, now: number): Line[] {
  if (crew === null) {
    return []
  }

  return [
    { text: crew.profile === null ? 'Crewboss' : `Crewboss · ${crew.profile}`, tone: 'heading' },
    ...loopLines(crew.task, crew.repo, now),
    ...crew.problems.map(problem => ({ text: `⚠ ${problem}`, tone: 'bad' as const })),
    GAP,
    ...openPrLines(crew),
    GAP,
    ...claimableLines(crew),
    GAP,
  ]
}

function loopLines(task: LoopTask | null, repo: string | null, now: number): Line[] {
  if (task === null) {
    return [{ text: 'No task in progress', tone: 'dim' }]
  }
  const fix = task.fixCount > 0 ? ` · fix round ${task.fixCount}` : ''
  const lines: Line[] = [
    { text: `⚑ #${task.id} ${task.title}`, tone: 'plain' },
    { text: `${task.state}${task.stateSince !== 0 ? ` ${elapsed(now - task.stateSince)}` : ''}${fix}`, tone: ATTENTION.has(task.state) ? 'warn' : 'dim' },
  ]
  if (task.branch !== null) {
    lines.push({ text: `⎇ ${task.branch}`, tone: 'dim' })
  }
  if (task.pr !== null) {
    lines.push({ text: `PR #${task.pr}`, tone: 'plain', ...(repo !== null && { href: `https://github.com/${repo}/pull/${task.pr}` }) })
  }
  if (task.state === 'NeedsHuman') {
    lines.push(
      { text: task.needsHumanReason ?? 'no reason recorded', tone: 'warn' },
      { text: 'crewboss answer <text> · answer --continue · drop', tone: 'dim' },
    )
  }

  return lines
}

function openPrLines(crew: CrewStatus): Line[] {
  const heading: Line = { text: `My PRs ${crew.prs.length}`, tone: 'heading' }
  if (crew.prs.length === 0) {
    return [heading, { text: 'None open', tone: 'dim' }]
  }

  return [
    heading,
    ...crew.prs.slice(0, MAX_LISTED).map(pr => ({
      text: `#${pr.number} ${pr.title} ${pr.isDraft ? 'draft ' : ''}${checksLabel(pr.checks)}`.trimEnd(),
      tone: prTone(pr.checks, pr.review),
      href: pr.url,
    })),
    ...more(crew.prs.length),
  ]
}

function prTone(checks: Checks, review: string | null): Tone {
  if (checks.failed > 0 || review === 'CHANGES_REQUESTED') {
    return 'bad'
  }
  if (checks.pending > 0) {
    return 'warn'
  }

  return review === 'APPROVED' ? 'ok' : 'plain'
}

function claimableLines(crew: CrewStatus): Line[] {
  const heading: Line = { text: `To claim ${crew.claimable.length}`, tone: 'heading' }
  if (crew.claimable.length === 0) {
    return [heading, { text: 'Nothing claimable', tone: 'dim' }]
  }

  return [
    heading,
    ...crew.claimable.slice(0, MAX_LISTED).map(issue => ({
      text: `#${issue.id} ${issue.title}`,
      tone: 'plain' as const,
      ...(issue.url !== null && { href: issue.url }),
    })),
    ...more(crew.claimable.length),
    { text: 'crewboss run takes the next one', tone: 'dim' },
  ]
}

function more(total: number): Line[] {
  return total > MAX_LISTED ? [{ text: `… ${total - MAX_LISTED} more`, tone: 'dim' }] : []
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
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
  }

  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`
}
