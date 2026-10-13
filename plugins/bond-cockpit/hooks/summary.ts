import type { CacheSnapshot, JobState, ModelTally, UsageSnapshot } from '../types'
import { cacheView, tokens } from './cache'
import type { Card, Row } from './cache'
import { jobBrief } from './job'
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
  // jobBrief leads with the task when there is one; it heads the card, above the tab sections.
  const task = job.task === null ? [] : brief.rows.slice(0, 1)
  const work = job.task === null ? brief.rows : brief.rows.slice(1)
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
      ...(work.length > 0 ? work : [{ kind: 'line', text: 'Nothing running', tone: 'dim' } as const]),
      { kind: 'section', title: 'session', tab: 'session', tone: 'dim' },
      ...(session.length > 0 ? session : [{ kind: 'line', text: 'No request yet', tone: 'dim' } as const]),
    ],
  }
}

function modelRow(models: ModelTally): Row | null {
  const seen = Object.values(models.byModel)
  if (models.current === null || seen.length === 0) {
    return null
  }
  const requests = seen.reduce((sum, model) => sum + model.requests, 0)
  const spent = seen.reduce((sum, model) => sum + model.tokens, 0)
  const others = seen.length - 1

  return {
    kind: 'pair',
    label: 'model',
    value: tokens(spent),
    note: [shortModel(models.current), `${requests} req`, others > 0 ? `+${others} more` : ''].filter(part => part !== '').join(' · '),
    tone: 'plain',
  }
}
