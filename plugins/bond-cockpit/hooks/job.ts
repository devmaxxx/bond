import type { JobLoop, JobState } from '../types'
import type { Card, Row, Tone } from './cache'

const RECENT_TOOLS = 3
// A loop quiet this long has stopped calling tools; it drops to dim before it drops off.
const QUIET_MS = 15_000
// A finished loop stays listed this long, so a burst of agents can be read after it ends.
const DONE_KEEP_MS = 5 * 60_000
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
  workflowAt: null,
}

export type AgentName = { id: string; description: string; type: string }

/** A user prompt starts a job: counts restart, background loops that still run are kept. */
export function startJob(job: JobState, text: string, now: number): JobState {
  const task = firstLine(text)
  if (task === '') {
    return { ...job, startedAt: now, endedAt: null }
  }

  return { ...EMPTY_JOB, task, startedAt: now, loops: liveLoops(job.loops, now), workflowAt: job.workflowAt }
}

export function endJob(job: JobState, now: number): JobState {
  return { ...job, endedAt: now, inFlight: [] }
}

export function toolStarted(job: JobState, id: string, tool: string, args: Record<string, unknown>, agentId: string | undefined, now: number): JobState {
  const label = toolLabel(tool, args)
  const workflowAt = tool === 'Workflow' ? now : job.workflowAt
  if (agentId === undefined) {
    return { ...job, tools: job.tools + 1, inFlight: [...job.inFlight, { id, label, at: now }], workflowAt }
  }
  const loop: JobLoop = job.loops[agentId] ?? { calls: 0, last: '', at: now, done: false, firstAt: now }

  return { ...job, tools: job.tools + 1, workflowAt, loops: { ...job.loops, [agentId]: { ...loop, calls: loop.calls + 1, last: label, at: now, done: false } } }
}

export function toolEnded(job: JobState, id: string, tool: string, hasFailed: boolean, agentId: string | undefined): JobState {
  const failed = job.failed + (hasFailed ? 1 : 0)
  if (agentId !== undefined) {
    return { ...job, failed }
  }
  const finished = job.inFlight.find(call => call.id === id)
  const recent = finished === undefined ? job.recent : [...job.recent, finished.label].slice(-RECENT_TOOLS)

  return { ...job, failed, recent, inFlight: job.inFlight.filter(call => call.id !== id), workflowAt: tool === 'Workflow' ? null : job.workflowAt }
}

export function loopEnded(job: JobState, agentId: string, now: number): JobState {
  const loop = job.loops[agentId]
  if (loop === undefined) {
    return job
  }

  return { ...job, loops: { ...job.loops, [agentId]: { ...loop, done: true, at: now } } }
}

/** The pane's first card: what the session is doing right now. */
export function jobCard(job: JobState, agents: readonly AgentName[], now: number): Card | null {
  if (job.task === null && Object.keys(job.loops).length === 0) {
    return null
  }
  const isRunning = job.startedAt !== null && job.endedAt === null
  const loops = listLoops(job.loops, agents, now)
  const working = loops.filter(loop => !loop.done).length
  const rows: Row[] = []
  if (job.task !== null) {
    rows.push({ kind: 'note', text: job.task, tone: 'plain' })
  }
  rows.push(nowRow(job, isRunning, now))
  rows.push({ kind: 'pair', label: 'tools', value: String(job.tools), note: toolsNote(job), tone: job.failed > 0 ? 'warn' : 'plain' })
  if (job.workflowAt !== null) {
    const done = loops.filter(loop => loop.done && loop.firstAt >= (job.workflowAt ?? 0)).length
    const seen = loops.filter(loop => loop.firstAt >= (job.workflowAt ?? 0)).length
    rows.push({ kind: 'gauge', label: 'workflow', value: `${done}/${seen}`, ratio: seen === 0 ? 0 : done / seen, note: elapsed(now - job.workflowAt), tone: 'ok' })
  }
  if (loops.length > 0) {
    rows.push({ kind: 'section', title: `agents ${working} working`, tone: 'dim' })
    rows.push(...loops.slice(0, MAX_LOOPS).map(loop => loopRow(loop, now)))
    if (loops.length > MAX_LOOPS) {
      rows.push({ kind: 'note', text: `+${loops.length - MAX_LOOPS} more`, tone: 'dim' })
    }
  }

  return {
    title: 'Job',
    status: isRunning || working > 0 ? '● working' : '○ idle',
    badge: jobBadge(job, isRunning, now),
    tone: isRunning || working > 0 ? 'ok' : 'dim',
    rows,
  }
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
    return { kind: 'pair', label: 'now', value: elapsed(now - latest.at), note: `${latest.label}${more}`, tone: 'ok' }
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

  return Object.entries(liveLoops(loops, now))
    .map(([id, loop]) => ({ ...loop, id, name: names.get(id) ?? `#${id.slice(0, 6)}` }))
    .sort((a, b) => Number(a.done) - Number(b.done) || b.at - a.at)
}

function loopRow(loop: ListedLoop, now: number): Row {
  const tone: Tone = loop.done ? 'dim' : now - loop.at > QUIET_MS ? 'plain' : 'ok'
  const mark = loop.done ? '✓' : '●'

  return { kind: 'pair', label: clip(`${mark} ${loop.name}`, 10), value: String(loop.calls), note: loop.done ? `done ${elapsed(now - loop.at)} ago` : loop.last, tone }
}

function liveLoops(loops: Record<string, JobLoop>, now: number): Record<string, JobLoop> {
  return Object.fromEntries(Object.entries(loops).filter(([, loop]) => !loop.done || now - loop.at < DONE_KEEP_MS))
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
