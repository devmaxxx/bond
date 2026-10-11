import type { JobLoop, JobState } from '../types'
import type { Card, Row, Tone } from './cache'

const RECENT_TOOLS = 3
// A loop with no tool call for this long counts as quiet, not working: a fork the engine never
// reports finished would otherwise keep the card green and the pane redrawing every second.
const STALE_MS = 2 * 60_000
// A finished or quiet loop stays listed this long, so a burst of agents can be read after it ends.
const KEEP_MS = 5 * 60_000
const MAX_LOOPS = 8
const LABEL_LIMIT = 60
const PUSH = /\bgit\s+push\b|\bgh\s+pr\s+(create|merge)\b/
// The command's first line, past a leading `cd <dir> &&`, names a runner: an edit script that prints "failed" is no test.
const RUNNER = /^(?:\S+=\S+\s+)*(?:npx\s+|pnpm\s+(?:exec\s+|run\s+|-\S+\s+\S+\s+)*|npm\s+(?:run\s+)?|yarn\s+|bun\s+(?:run\s+)?)?(vitest|jest|playwright|pytest|tsc|eslint|biome|node\s+--test|test|lint|typecheck|check|turbo)\b/

export const EMPTY_JOB: JobState = {
  task: null,
  startedAt: null,
  endedAt: null,
  inFlight: [],
  tools: 0,
  failed: 0,
  recent: [],
  loops: {},
  workflow: null,
}

export type AgentName = { id: string; description: string; type: string }
export type TestRun = NonNullable<JobLoop['test']>

/**
 * A main-loop turn starts. A typed prompt starts a new job: counts restart, loops still listed
 * are kept. A turn the engine starts for a delivery (a task notification, a peer message) opens
 * with a tag and continues the job it belongs to.
 */
export function startJob(job: JobState, text: string, now: number): JobState {
  const task = firstLine(text)
  if (task === '' || task.startsWith('<')) {
    return { ...job, startedAt: job.endedAt === null ? (job.startedAt ?? now) : now, endedAt: null }
  }
  const workflow = job.workflow !== null && !isFinished(job.workflow) ? job.workflow : null

  return { ...EMPTY_JOB, task, startedAt: now, loops: keptLoops(job.loops, now), workflow }
}

export function endJob(job: JobState, now: number): JobState {
  return { ...job, endedAt: now, inFlight: [] }
}

/** An agent starts: its spawn names it. A workflow script's agent counts toward its run. */
export function agentSpawned(job: JobState, agentId: string, name: string, model: string, runId: string | undefined, now: number): JobState {
  const loop = { ...(job.loops[agentId] ?? newLoop(now)), name: name || null, model: model || null, workflow: runId !== undefined }
  if (runId === undefined) {
    return { ...job, loops: { ...job.loops, [agentId]: loop } }
  }
  const current = job.workflow
  const isSameRun = current !== null && (current.runId === null || current.runId === runId || runId === '')
  const run = isSameRun ? current : { at: now, name: null, runId: null, started: 0, done: 0 }
  const workflow = { ...run, runId: run.runId ?? (runId || null), started: run.started + 1 }

  return { ...job, workflow, loops: { ...job.loops, [agentId]: loop } }
}

/** The Workflow call returned at launch with its script's name and run id. */
export function workflowLaunched(job: JobState, name: string | undefined, runId: string | undefined): JobState {
  if (job.workflow === null) {
    return job
  }

  return { ...job, workflow: { ...job.workflow, name: name ?? job.workflow.name, runId: job.workflow.runId ?? runId ?? null } }
}

export function toolStarted(job: JobState, id: string, tool: string, args: Record<string, unknown>, agentId: string | undefined, now: number): JobState {
  const label = toolLabel(tool, args)
  if (agentId === undefined) {
    // The Workflow call returns once the run is launched; its agents report through their own loops.
    const workflow = tool === 'Workflow' ? { at: now, name: null, runId: null, started: 0, done: 0 } : job.workflow
    return { ...job, tools: job.tools + 1, inFlight: [...job.inFlight, { id, label, at: now, asked: false }], workflow }
  }
  const loop = job.loops[agentId] ?? newLoop(now)
  const pushed = loop.pushed || (tool === 'Bash' && PUSH.test(String(args.command ?? '')))

  return { ...job, tools: job.tools + 1, loops: { ...job.loops, [agentId]: { ...loop, calls: loop.calls + 1, last: label, at: now, done: false, pushed } } }
}

/** A test, typecheck or lint run's counts, when the command names a runner and its output reports any. */
export function testRun(command: string, output: string): TestRun | null {
  const line = command.replace(/^\s*cd\s+\S+\s*&&\s*/, '').split('\n')[0]?.trim() ?? ''
  const runner = RUNNER.exec(line)
  if (runner === null) {
    return null
  }
  const last = (re: RegExp) => {
    const found = [...output.matchAll(re)].at(-1)
    return found === undefined ? null : Number(found[1])
  }
  // `44 passed` (vitest, jest, bun) or `# pass 44` (node --test).
  const pass = last(/(\d+)\s+pass(?:ed|ing|es)?\b/gi) ?? last(/\bpass\s+(\d+)/gi)
  const fail = last(/(\d+)\s+fail(?:ed|ing|ures?|s)?\b/gi) ?? last(/\bfail\s+(\d+)/gi) ?? last(/Found\s+(\d+)\s+errors?/gi) ?? last(/(\d+)\s+errors?\b/gi)

  return pass === null && fail === null ? null : { pass, fail, label: clip(runner[1] ?? line, 20) }
}

/** The permission check asked: the call waits on a decision, not on the tool. */
export function toolAsked(job: JobState, id: string): JobState {
  return { ...job, inFlight: job.inFlight.map(call => (call.id === id ? { ...call, asked: true } : call)) }
}

export function toolEnded(job: JobState, id: string, hasFailed: boolean, agentId: string | undefined, test: TestRun | null = null): JobState {
  const failed = job.failed + (hasFailed ? 1 : 0)
  if (agentId !== undefined) {
    const loop = job.loops[agentId]
    return loop === undefined || test === null ? { ...job, failed } : { ...job, failed, loops: { ...job.loops, [agentId]: { ...loop, test } } }
  }
  const finished = job.inFlight.find(call => call.id === id)
  const recent = finished === undefined ? job.recent : [...job.recent, finished.label].slice(-RECENT_TOOLS)

  return { ...job, failed, recent, inFlight: job.inFlight.filter(call => call.id !== id) }
}

export function loopEnded(job: JobState, agentId: string, now: number): JobState {
  const loop = job.loops[agentId]
  if (loop === undefined || loop.done) {
    return job
  }
  const workflow = loop.workflow && job.workflow !== null ? { ...job.workflow, done: job.workflow.done + 1 } : job.workflow

  return { ...job, workflow, loops: { ...job.loops, [agentId]: { ...loop, done: true, at: now } } }
}

/** Whether anything still moves: an elapsed time on the card would change from one second to the next. */
export function isBusy(job: JobState, now: number): boolean {
  return Object.values(job.loops).some(loop => isWorking(loop, now))
}

/** The pane's first card: what the session is doing right now. */
export function jobCard(job: JobState, agents: readonly AgentName[], now: number): Card | null {
  if (job.task === null && Object.keys(job.loops).length === 0) {
    return null
  }
  const isRunning = job.startedAt !== null && job.endedAt === null
  const loops = listLoops(job.loops, agents, now)
  const working = loops.filter(loop => isWorking(loop, now)).length
  const rows: Row[] = []
  if (job.task !== null) {
    rows.push({ kind: 'note', text: job.task, tone: 'plain' })
  }
  rows.push(nowRow(job, isRunning, now))
  rows.push({ kind: 'pair', label: 'tools', value: String(job.tools), note: toolsNote(job), tone: job.failed > 0 ? 'warn' : 'plain' })
  if (job.workflow !== null) {
    const { at, started, done } = job.workflow
    const isDone = isFinished(job.workflow)
    rows.push({ kind: 'gauge', label: 'workflow', value: `${done}/${started}`, ratio: started === 0 ? 0 : done / started, note: isDone ? 'done' : elapsed(now - at), tone: isDone ? 'plain' : 'ok' })
    const named = [job.workflow.name, job.workflow.runId].filter(part => part !== null).join(' · ')
    if (named !== '') {
      rows.push({ kind: 'line', text: named, tone: 'dim' })
    }
  }
  if (loops.length > 0) {
    const red = loops.filter(isRed).length
    rows.push({ kind: 'section', title: `agents ${working} working${red > 0 ? ` · ${red} red` : ''}`, tone: 'dim' })
    rows.push(...loops.slice(0, MAX_LOOPS).flatMap(loop => loopRows(loop, now)))
    if (loops.length > MAX_LOOPS) {
      rows.push({ kind: 'note', text: `+${loops.length - MAX_LOOPS} more`, tone: 'dim' })
    }
  }
  const isActive = isRunning || working > 0

  return {
    title: 'Job',
    status: isActive ? '● working' : '○ idle',
    badge: jobBadge(job, isRunning, now),
    tone: isActive ? 'ok' : 'dim',
    rows,
  }
}

/** The job in three rows for the short page: the task, what runs now, and how many agents work. */
export function jobBrief(job: JobState, now: number): { rows: Row[]; isActive: boolean; badge: string } {
  const isRunning = job.startedAt !== null && job.endedAt === null
  const working = Object.values(keptLoops(job.loops, now)).filter(loop => isWorking(loop, now)).length
  const rows: Row[] = []
  if (job.task !== null) {
    rows.push({ kind: 'note', text: job.task, tone: 'plain' })
  }
  if (job.task !== null || working > 0) {
    rows.push(nowRow(job, isRunning, now))
  }
  if (working > 0 || job.workflow !== null) {
    const loops = Object.values(keptLoops(job.loops, now))
    const red = loops.filter(isRed).length
    const pushed = loops.filter(loop => loop.pushed).length
    const note = [
      job.workflow === null ? '' : `${job.workflow.name ?? 'workflow'} ${job.workflow.done}/${job.workflow.started}`,
      red > 0 ? `${red} red` : '',
      pushed > 0 ? `${pushed} pushed` : '',
    ].filter(part => part !== '').join(' · ')
    rows.push({ kind: 'pair', label: 'agents', value: String(working), note, tone: red > 0 || pushed > 0 ? 'warn' : working > 0 ? 'ok' : 'dim' })
  }

  return { rows, isActive: isRunning || working > 0, badge: jobBadge(job, isRunning, now) }
}

/** A few words naming what one tool call works on. */
export function toolLabel(tool: string, args: Record<string, unknown>): string {
  const text = (key: string) => (typeof args[key] === 'string' ? (args[key] as string) : '')
  const detail = (() => {
    switch (tool) {
      case 'Bash':
        return text('description') || text('command')
      case 'Read':
      case 'Edit':
      case 'Write':
      case 'NotebookEdit':
        return baseName(text('file_path') || text('notebook_path'))
      case 'Grep':
      case 'Glob':
        return text('pattern')
      case 'Agent':
      case 'Task':
        return text('description')
      case 'Skill':
        return text('skill')
      case 'WebFetch':
        return host(text('url'))
      case 'WebSearch':
        return text('query')
      default:
        return text('description')
    }
  })()

  return clip(detail === '' ? tool : `${tool} ${firstLine(detail)}`)
}

export function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m${String(seconds % 60).padStart(2, '0')}s`
  }

  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`
}

function nowRow(job: JobState, isRunning: boolean, now: number): Row {
  const latest = job.inFlight.at(-1)
  if (latest !== undefined) {
    const more = job.inFlight.length > 1 ? ` +${job.inFlight.length - 1}` : ''
    return latest.asked
      ? { kind: 'pair', label: 'now', value: elapsed(now - latest.at), note: `approve? ${latest.label}${more}`, tone: 'warn' }
      : { kind: 'pair', label: 'now', value: elapsed(now - latest.at), note: `${latest.label}${more}`, tone: 'ok' }
  }
  if (isRunning) {
    return { kind: 'pair', label: 'now', value: '', note: 'thinking', tone: 'plain' }
  }

  return { kind: 'pair', label: 'now', value: '', note: 'waiting for you', tone: 'dim' }
}

function toolsNote(job: JobState): string {
  const failed = job.failed > 0 ? `${job.failed} failed · ` : ''
  const last = job.recent.length > 0 ? `last ${job.recent.at(-1)}` : ''

  return `${failed}${last}`
}

function jobBadge(job: JobState, isRunning: boolean, now: number): string {
  if (job.startedAt === null) {
    return ''
  }
  if (isRunning) {
    return elapsed(now - job.startedAt)
  }

  return job.endedAt === null ? '' : `took ${elapsed(job.endedAt - job.startedAt)}`
}

type ListedLoop = Omit<JobLoop, 'name'> & { id: string; name: string }

function listLoops(loops: Record<string, JobLoop>, agents: readonly AgentName[], now: number): ListedLoop[] {
  const names = new Map(agents.map(agent => [agent.id, agent.description || agent.type]))

  return Object.entries(keptLoops(loops, now))
    .map(([id, loop]) => ({ ...loop, id, name: loop.name ?? names.get(id) ?? `#${id.slice(0, 6)}` }))
    .sort((a, b) => Number(isWorking(b, now)) - Number(isWorking(a, now)) || Number(a.done) - Number(b.done) || b.at - a.at)
}

// Two lines per loop: who it is and how it stands, then its latest tool and test.
function loopRows(loop: ListedLoop, now: number): Row[] {
  const isLive = isWorking(loop, now)
  const state = loop.done ? `done ${elapsed(now - loop.at)} ago` : isLive ? `${elapsed(now - loop.firstAt)}` : `quiet ${elapsed(now - loop.at)}`
  const head = [`${loop.done ? '✓' : '●'} ${loop.name}`, loop.model === null ? '' : shortModel(loop.model), `${loop.calls} calls`, state]
  const test = loop.test === null ? '' : `${loop.test.label} ${loop.test.pass ?? '?'}✓ ${loop.test.fail ?? 0}✗`
  const rows: Row[] = [
    { kind: 'line', text: head.filter(part => part !== '').join(' · '), tone: isLive ? 'ok' : 'dim' },
    { kind: 'line', text: `  ${[loop.done ? '' : loop.last, test].filter(part => part !== '').join(' · ') || '–'}`, tone: isRed(loop) ? 'bad' : 'dim' },
  ]
  if (loop.pushed) {
    rows.push({ kind: 'line', text: '  ran git push / gh pr', tone: 'warn' })
  }

  return rows
}

function isRed(loop: JobLoop): boolean {
  return (loop.test?.fail ?? 0) > 0
}

function shortModel(model: string): string {
  return /opus|sonnet|haiku|fable/.exec(model)?.[0] ?? model
}

function newLoop(now: number): JobLoop {
  return { calls: 0, last: '', at: now, firstAt: now, done: false, workflow: false, name: null, model: null, test: null, pushed: false }
}

function isWorking(loop: Pick<JobLoop, 'done' | 'at'>, now: number): boolean {
  return !loop.done && now - loop.at < STALE_MS
}

function isFinished(workflow: NonNullable<JobState['workflow']>): boolean {
  return workflow.started > 0 && workflow.done >= workflow.started
}

function keptLoops(loops: Record<string, JobLoop>, now: number): Record<string, JobLoop> {
  return Object.fromEntries(Object.entries(loops).filter(([, loop]) => now - loop.at < KEEP_MS))
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0]?.trim() ?? ''
}

function baseName(path: string): string {
  return path.split('/').filter(part => part !== '').at(-1) ?? ''
}

function host(url: string): string {
  const match = /^[a-z]+:\/\/([^/]+)/i.exec(url)

  return match?.[1] ?? url
}

function clip(text: string, limit = LABEL_LIMIT): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}
