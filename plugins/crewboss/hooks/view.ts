import type { AgentItem, Checks, CrewStatus, LoopTask, OpenPr, PrStatus, RepoStatus, TaskItem, TurnProgress } from '../types'

export type Tone = 'heading' | 'plain' | 'dim' | 'ok' | 'bad' | 'warn' | 'accent'

// fill: the text a press puts in the prompt box. Nothing runs until the person submits it.
export type Action = { key: string; label: string; fill: string; isPrimary?: boolean }

export type Badge = { text: string; tone: Tone }

export type Row = {
  text: string
  tone: Tone
  href?: string
  // Drawn whole as Markdown: an agent's question to the owner is unreadable cut to one line.
  isMarkdown?: boolean
  badge?: Badge
  aside?: Badge
  action?: Action
}

export type Card = {
  key: string
  title: string
  count?: number
  tone: Tone
  rows: Row[]
  actions: Action[]
}

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
const FINISHED_AGENT = new Set(['completed', 'failed', 'killed'])
const TASK_MARK: Record<TaskItem['status'], string> = { completed: '✔', in_progress: '▸', pending: '○' }
const STATE_TONE: Record<string, Tone> = {
  NeedsHuman: 'warn',
  HumanControl: 'warn',
  ReadyToMerge: 'ok',
  Merged: 'ok',
  Canceled: 'dim',
  Queued: 'dim',
}

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

function checksTone(checks: Checks): Tone {
  if (checks.failed > 0) {
    return 'bad'
  }

  return checks.pending > 0 ? 'warn' : 'ok'
}

export function paneCards(state: HudState): Card[] {
  const crew = state.crew

  return [
    ...(crew === null ? [] : [loopCard(crew, state.now), openPrsCard(crew), claimableCard(crew)]),
    repoCard(state.repo),
    prCard(state.repo, state.pr),
    progressCard(state),
  ]
}

function loopCard(crew: CrewStatus, now: number): Card {
  const task = crew.task
  const problems = crew.problems.map(problem => ({ text: `⚠ ${problem}`, tone: 'bad' as const }))
  const title = crew.profile === null ? 'Crewboss' : `Crewboss · ${crew.profile}`
  if (task === null) {
    return {
      key: 'loop',
      title,
      tone: problems.length > 0 ? 'bad' : 'accent',
      rows: [{ text: 'No task in progress', tone: 'dim' }, ...problems],
      actions: [],
    }
  }
  const tone = STATE_TONE[task.state] ?? 'accent'

  return {
    key: 'loop',
    title,
    tone: problems.length > 0 ? 'bad' : tone,
    rows: [
      { text: `#${task.id} ${task.title}`, tone: 'plain' },
      { text: stateDetail(task, now), tone: 'dim', badge: { text: task.state, tone } },
      ...(task.branch === null ? [] : [{ text: `⎇ ${task.branch}`, tone: 'dim' as const }]),
      ...(task.pr === null ? [] : [loopPrRow(task.pr, crew.repo)]),
      ...(task.state === 'NeedsHuman' ? [{ text: task.needsHumanReason ?? 'no reason recorded', tone: 'warn' as const, isMarkdown: true }] : []),
      ...problems,
    ],
    actions: loopActions(task),
  }
}

function stateDetail(task: LoopTask, now: number): string {
  const since = task.stateSince > 0 ? elapsed(now - task.stateSince) : ''
  const fix = task.fixCount > 0 ? `fix round ${task.fixCount}` : ''

  return [since, fix].filter(Boolean).join(' · ')
}

function loopPrRow(number: number, repo: string | null): Row {
  return { text: `PR #${number}`, tone: 'plain', ...(repo !== null && { href: `https://github.com/${repo}/pull/${number}` }) }
}

function loopActions(task: LoopTask): Action[] {
  if (task.state === 'NeedsHuman') {
    return [
      { key: 'answer', label: 'Answer', fill: '! crewboss answer ', isPrimary: true },
      { key: 'continue', label: 'Continue', fill: '! crewboss answer --continue' },
      { key: 'drop', label: 'Drop', fill: '! crewboss drop' },
    ]
  }

  return [{ key: 'status', label: 'Status', fill: '! crewboss status' }]
}

function openPrsCard(crew: CrewStatus): Card {
  const rows = crew.prs.slice(0, MAX_LISTED).map(openPrRow)

  return {
    key: 'prs',
    title: 'My PRs',
    count: crew.prs.length,
    tone: crew.prs.some(pr => pr.checks.failed > 0) ? 'bad' : 'plain',
    rows: rows.length === 0 ? [{ text: 'None open', tone: 'dim' }] : [...rows, ...more(crew.prs.length)],
    actions: [],
  }
}

function openPrRow(pr: OpenPr): Row {
  const label = checksLabel(pr.checks)
  const badge = reviewBadge(pr)

  return {
    text: `#${pr.number} ${pr.title}`,
    tone: pr.isDraft ? 'dim' : 'plain',
    href: pr.url,
    ...(badge && { badge }),
    ...(label !== '' && { aside: { text: label, tone: checksTone(pr.checks) } }),
    ...(pr.checks.failed > 0 && { action: { key: `fix-${pr.number}`, label: 'Fix CI', fill: `/bond:fix-ci ${pr.url}` } }),
  }
}

function reviewBadge(pr: OpenPr): Badge | undefined {
  if (pr.isDraft) {
    return { text: 'draft', tone: 'dim' }
  }
  if (pr.review === 'APPROVED') {
    return { text: 'approved', tone: 'ok' }
  }

  return pr.review === 'CHANGES_REQUESTED' ? { text: 'changes', tone: 'bad' } : undefined
}

function claimableCard(crew: CrewStatus): Card {
  const rows = crew.claimable.slice(0, MAX_LISTED).map(issue => ({
    text: `#${issue.id} ${issue.title}`,
    tone: 'plain' as const,
    ...(issue.url !== null && { href: issue.url }),
  }))
  const isIdle = crew.task === null || crew.task.state === 'Merged' || crew.task.state === 'Canceled'

  return {
    key: 'claim',
    title: 'To claim',
    count: crew.claimable.length,
    tone: 'plain',
    rows: rows.length === 0 ? [{ text: 'Nothing claimable', tone: 'dim' }] : [...rows, ...more(crew.claimable.length)],
    actions: rows.length > 0 && isIdle ? [{ key: 'claim-next', label: 'Run next', fill: '! crewboss run --once', isPrimary: true }] : [],
  }
}

function more(total: number): Row[] {
  return total > MAX_LISTED ? [{ text: `… ${total - MAX_LISTED} more`, tone: 'dim' }] : []
}

function repoCard(repo: RepoStatus | null): Card {
  if (repo === null) {
    return { key: 'repo', title: 'Repo', tone: 'dim', rows: [{ text: 'Not in a git repository', tone: 'dim' }], actions: [] }
  }
  const rows: Row[] = [
    { text: `⎇ ${repo.branch}`, tone: 'plain' },
    { text: `${repo.host ?? 'unknown host'} · tracker ${repo.tracker}`, tone: 'dim' },
  ]
  if (repo.login !== null) {
    rows.push({ text: accountLabel(repo), tone: isWrongAccount(repo) ? 'warn' : 'ok' })
  }

  return { key: 'repo', title: 'Repo', tone: isWrongAccount(repo) ? 'warn' : 'plain', rows, actions: [] }
}

function prCard(repo: RepoStatus | null, pr: PrStatus | null): Card {
  const card = { key: 'pr', title: 'This branch', actions: [] }
  if (repo?.host !== 'github') {
    return { ...card, tone: 'dim', rows: [{ text: 'PRs tracked for GitHub repos only', tone: 'dim' }] }
  }
  if (pr === null) {
    return { ...card, tone: 'dim', rows: [{ text: 'No PR for this branch', tone: 'dim' }] }
  }
  const total = pr.checks.passed + pr.checks.failed + pr.checks.pending

  return {
    ...card,
    tone: pr.checks.failed > 0 ? 'bad' : 'plain',
    rows: [
      { text: `#${pr.number} ${pr.title}`, tone: 'plain', href: pr.url },
      { text: prStateLabel(pr), tone: 'dim' },
      total === 0
        ? { text: 'No checks', tone: 'dim' }
        : { text: `CI ✓ ${pr.checks.passed}  ✗ ${pr.checks.failed}  … ${pr.checks.pending}`, tone: checksTone(pr.checks) },
      ...pr.checks.failing.slice(0, MAX_FAILING).map(name => ({ text: `  ✗ ${name}`, tone: 'bad' as const })),
    ],
    actions: pr.checks.failed > 0 ? [{ key: 'fix-branch', label: 'Fix CI', fill: `/bond:fix-ci ${pr.url}`, isPrimary: true }] : [],
  }
}

function prStateLabel(pr: PrStatus): string {
  const state = pr.isDraft ? 'draft' : pr.state.toLowerCase()
  const review = pr.review === null ? 'no review yet' : pr.review.toLowerCase().replaceAll('_', ' ')

  return `${state} · ${review}`
}

function progressCard(state: HudState): Card {
  return {
    key: 'progress',
    title: 'Progress',
    tone: state.turn.isRunning ? 'warn' : 'dim',
    rows: [turnRow(state.turn, state.now), ...taskRows(state.tasks), ...agentRows(state.agents)],
    actions: [],
  }
}

function turnRow(turn: TurnProgress, now: number): Row {
  const tools = `${turn.toolCount} tool${turn.toolCount === 1 ? '' : 's'}`
  if (turn.isRunning) {
    const last = turn.lastTool === null ? '' : ` · last ${turn.lastTool}`
    return { text: `${elapsed(now - turn.startedAt)} · ${tools}${last}`, tone: 'plain', badge: { text: 'working', tone: 'warn' } }
  }
  if (turn.startedAt === 0) {
    return { text: 'Idle', tone: 'dim' }
  }

  return { text: `Idle · last turn ${tools}`, tone: 'dim' }
}

function taskRows(tasks: readonly TaskItem[]): Row[] {
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
  const before: Row[] = start > 0 ? [{ text: `… ${start} earlier`, tone: 'dim' }] : []
  const after: Row[] = hiddenAfter > 0 ? [{ text: `… ${hiddenAfter} more`, tone: 'dim' }] : []

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

function agentRows(agents: readonly AgentItem[]): Row[] {
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
