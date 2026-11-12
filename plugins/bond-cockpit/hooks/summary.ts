import type { CacheSnapshot, JobState, ModelTally, UsageSnapshot } from '../types'
import { cacheView, tokens } from './cache'
import type { Card, Row, Tone } from './cache'
import { flowBand, jobBrief } from './job'
import { shortModel, usageCard } from './usage'

// The 5h window and the context fill always matter; any other gauge only once it turns warn or bad.
const ALWAYS = new Set(['5h', 'context'])

function isImportant(row: Row): boolean {
  return row.kind !== 'gauge' || ALWAYS.has(row.label) || row.tone === 'warn' || row.tone === 'bad'
}

/** The main tab: the task, then a few lines from each other tab under a heading that opens it. */
export function summaryCard(job: JobState, cache: CacheSnapshot | null, usage: UsageSnapshot | null, models: ModelTally, now: number, warnMs: number): Card {
  const brief = jobBrief(job, now)
  const usageNow = usageCard(usage, now)
  const task: Row[] = job.task === null ? [] : [{ kind: 'note', text: job.task, tone: 'plain' }]
  const session: Row[] = []
  if (cache !== null) {
    const view = cacheView(cache, now, warnMs)
    session.push({ kind: 'pair', label: 'cache', value: `${view.hit}%`, note: view.countdown, tone: view.tone })
  }
  const model = modelRow(models)
  if (model !== null) {
    session.push(model)
  }
  session.push(...(usageNow?.rows ?? []).filter(isImportant))
  const badge = [brief.badge, usageNow?.badge ?? ''].filter(part => part !== '').join(' · ')

  return {
    title: 'Cockpit',
    status: brief.isActive ? '● working' : '○ idle',
    badge,
    tone: brief.isActive ? 'ok' : usageNow !== null && usageNow.tone !== 'plain' ? usageNow.tone : 'dim',
    rows: [
      ...task,
      { kind: 'section', title: 'job', tab: 'job', tone: 'dim' },
      ...(brief.rows.length > 0 ? brief.rows : [{ kind: 'line', text: 'Nothing running', tone: 'dim' } as const]),
      { kind: 'section', title: 'session', tab: 'session', tone: 'dim' },
      ...(session.length > 0 ? session : [{ kind: 'line', text: 'No request yet', tone: 'dim' } as const]),
    ],
  }
}

// The main model's own numbers, as the session tab's models section shows them; the rest are only counted.
function modelRow(models: ModelTally): Row | null {
  const main = models.current === null ? undefined : models.byModel[models.current]
  if (models.current === null || main === undefined) {
    return null
  }
  const others = Object.keys(models.byModel).length - 1

  return {
    kind: 'pair',
    label: 'model',
    value: tokens(main.tokens),
    note: [shortModel(models.current), `${main.requests} req`, others > 0 ? `+${others} more` : ''].filter(part => part !== '').join(' · '),
    tone: 'plain',
  }
}

/** How the strip under the prompt shows: the main card, one line, or nothing. It never closes for good. */
export type StripMode = 'expanded' | 'collapsed' | 'hidden'

export function isStripMode(value: unknown): value is StripMode {
  return value === 'expanded' || value === 'collapsed' || value === 'hidden'
}

/** The collapsed strip: state, the flow, cache and the gauges that always matter, the cost, in one line. */
export function stripLine(job: JobState, cache: CacheSnapshot | null, usage: UsageSnapshot | null, now: number, warnMs: number): { text: string; tone: Tone } {
  const brief = jobBrief(job, now)
  const usageNow = usageCard(usage, now)
  const flow = flowBand(job, now, Number.POSITIVE_INFINITY)
  const parts = [`cockpit ${brief.isActive ? '●' : '○'}${brief.badge === '' ? '' : ` ${brief.badge}`}`]
  if (flow !== null) {
    parts.push(flow.text)
  }
  if (cache !== null) {
    const view = cacheView(cache, now, warnMs)
    parts.push(`cache ${view.hit}%${view.countdown === '' ? '' : ` ${view.countdown}`}`)
  }
  for (const row of usageNow?.rows ?? []) {
    if (row.kind === 'gauge' && isImportant(row)) {
      parts.push(`${row.label} ${row.value}`)
    }
  }
  if (usageNow !== null && usageNow.badge !== '') {
    parts.push(usageNow.badge)
  }
  const tone: Tone = flow?.tone === 'warn' || usageNow?.tone === 'bad' || usageNow?.tone === 'warn' ? (usageNow?.tone === 'bad' ? 'bad' : 'warn') : brief.isActive ? 'ok' : 'dim'

  return { text: parts.join(' · '), tone }
}
