import type { CacheSnapshot, JobState, UsageSnapshot } from '../types'
import { cacheView } from './cache'
import type { Card, Row } from './cache'
import { jobBrief } from './job'
import { usageCard } from './usage'

// The 5h window and the context fill always matter; any other gauge only once it turns warn or bad.
const ALWAYS = new Set(['5h', 'context'])

function isImportant(row: Row): boolean {
  return row.kind !== 'gauge' || ALWAYS.has(row.label) || row.tone === 'warn' || row.tone === 'bad'
}

/** The short page: the job, the cache entry and the usage gauges in one card; the job and session tabs have the rest. */
export function summaryCard(job: JobState, cache: CacheSnapshot | null, usage: UsageSnapshot | null, now: number, warnMs: number): Card {
  const brief = jobBrief(job, now)
  const usageNow = usageCard(usage, now)
  const rows: Row[] = [...brief.rows]
  if (cache !== null) {
    const view = cacheView(cache, now, warnMs)
    rows.push({ kind: 'pair', label: 'cache', value: `${view.hit}%`, note: view.countdown, tone: view.tone })
  }
  rows.push(...(usageNow?.rows ?? []).filter(isImportant))
  if (rows.length === 0) {
    rows.push({ kind: 'note', text: 'Nothing yet', tone: 'dim' })
  }
  const badge = [brief.badge, usageNow?.badge ?? ''].filter(part => part !== '').join(' · ')

  return {
    title: 'Cockpit',
    status: brief.isActive ? '● working' : '○ idle',
    badge,
    tone: brief.isActive ? 'ok' : usageNow !== null && usageNow.tone !== 'plain' ? usageNow.tone : 'dim',
    rows,
  }
}
