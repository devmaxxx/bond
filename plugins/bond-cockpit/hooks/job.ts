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

/** `isListed`: the engine's agent list names the loop, so it is a subagent or teammate, not a workflow's agent. */
export function toolStarted(job: JobState, id: string, tool: string, args: Record<string, unknown>, agentId: string | undefined, isListed: boolean, now: number): JobState {
  const label = toolLabel(tool, args)
  if (agentId === undefined) {
    // The Workflow call returns once the run is launched; its agents report through their own loops.
    const workflow = tool === 'Workflow' ? { at: now, started: 0, done: 0 } : job.workflow
    return { ...job, tools: job.tools + 1, inFlight: [...job.inFlight, { id, label, at: now, asked: false }], workflow }
  }
  const known = job.loops[agentId]
  const joinsWorkflow = known === undefined && job.workflow !== null && !isListed
  const loop: JobLoop = known ?? { calls: 0, last: '', at: now, done: false, firstAt: now, workflow: joinsWorkflow }
  const workflow = joinsWorkflow && job.workflow !== null ? { ...job.workflow, started: job.workflow.started + 1 } : job.workflow

  return { ...job, tools: job.tools + 1, workflow, loops: { ...job.loops, [agentId]: { ...loop, calls: loop.calls + 1, last: label, at: now, done: false } } }
}

/** The permission check asked: the call waits on a decision, not on the tool. */
export function toolAsked(job: JobState, id: string): JobState {
  return { ...job, inFlight: job.inFlight.map(call => (call.id === id ? { ...call, asked: true } : call)) }
}

export function toolEnded(job: JobState, id: string, hasFailed: boolean, agentId: string | undefined): JobState {
  const failed = job.failed + (hasFailed ? 1 : 0)
  if (agentId !== undefined) {
    return { ...job, failed }
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
  }
  if (loops.length > 0) {
    rows.push({ kind: 'section', title: `agents ${working} working`, tone: 'dim' })
    rows.push(...loops.slice(0, MAX_LOOPS).map(loop => loopRow(loop, now)))
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
    const workflow = job.workflow === null ? '' : `workflow ${job.workflow.done}/${job.workflow.started}`
    rows.push({ kind: 'pair', label: 'agents', value: String(working), note: workflow, tone: working > 0 ? 'ok' : 'dim' })
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

type ListedLoop = JobLoop & { id: string; name: string }

function listLoops(loops: Record<string, JobLoop>, agents: readonly AgentName[], now: number): ListedLoop[] {
  const names = new Map(agents.map(agent => [agent.id, agent.description || agent.type]))

  return Object.entries(keptLoops(loops, now))
    .map(([id, loop]) => ({ ...loop, id, name: names.get(id) ?? `#${id.slice(0, 6)}` }))
    .sort((a, b) => Number(isWorking(b, now)) - Number(isWorking(a, now)) || Number(a.done) - Number(b.done) || b.at - a.at)
}

function loopRow(loop: ListedLoop, now: number): Row {
  const label = clip(`${loop.done ? '✓' : '●'} ${loop.name}`, 10)
  const value = String(loop.calls)
  if (loop.done) {
    return { kind: 'pair', label, value, note: `done ${elapsed(now - loop.at)} ago`, tone: 'dim' }
  }
  if (!isWorking(loop, now)) {
    return { kind: 'pair', label, value, note: `quiet ${elapsed(now - loop.at)} · ${loop.last}`, tone: 'dim' }
  }

  return { kind: 'pair', label, value, note: loop.last, tone: 'ok' }
}

function isWorking(loop: JobLoop, now: number): boolean {
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
