import type { ModelUsage, SessionUsage } from 'claude-code'

import type { ModelTally, UsageSnapshot } from '../types'
import { tokens } from './cache'
import type { Card, Row, Tone } from './cache'

export const EMPTY_MODELS: ModelTally = { current: null, byModel: {} }

const WINDOW_LABEL: Record<string, string> = { five_hour: '5h', seven_day: 'week', spend_limit: 'spend' }

export function recordModel(tally: ModelTally, model: string, usage: ModelUsage, isMain: boolean): ModelTally {
  const seen = tally.byModel[model] ?? { requests: 0, tokens: 0 }
  const used = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)

  return {
    current: isMain ? model : tally.current,
    byModel: { ...tally.byModel, [model]: { requests: seen.requests + 1, tokens: seen.tokens + used } },
  }
}

export function usageSnapshot(usage: Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>): UsageSnapshot {
  return {
    rateLimits: usage.rateLimits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt })),
    contextPercent: usage.context.percent ?? null,
    contextWindow: usage.context.window,
    costUsd: usage.cost?.usd ?? null,
  }
}

export function modelsCard(tally: ModelTally): Card | null {
  const models = Object.entries(tally.byModel).sort(([, a], [, b]) => b.tokens - a.tokens)
  if (models.length === 0) {
    return null
  }

  return {
    title: 'Models',
    status: '',
    badge: tally.current === null ? '' : shortModel(tally.current),
    tone: 'plain',
    rows: models.map(([model, seen]) => ({
      kind: 'pair',
      label: shortModel(model),
      value: tokens(seen.tokens),
      note: `${seen.requests} req${model === tally.current ? ' · main' : ''}`,
      tone: model === tally.current ? 'heading' : 'plain',
    })),
  }
}

export function usageCard(usage: UsageSnapshot | null, now: number): Card | null {
  if (usage === null) {
    return null
  }
  // A window past its reset is stale until the next response reports it again.
  const live = usage.rateLimits.filter(limit => limit.resetsAt === undefined || !(Date.parse(limit.resetsAt) <= now))
  const rows: Row[] = live.map(limit => ({
    kind: 'meter',
    label: `${WINDOW_LABEL[limit.kind] ?? limit.kind} ${limit.percentUsed}%${resetLabel(limit.resetsAt, now)}`,
    ratio: limit.percentUsed / 100,
    tone: usedTone(limit.percentUsed),
  }))
  if (usage.contextPercent !== null) {
    rows.push({
      kind: 'meter',
      label: `ctx ${usage.contextPercent}% of ${tokens(usage.contextWindow)}`,
      ratio: usage.contextPercent / 100,
      tone: usedTone(usage.contextPercent),
    })
  }
  if (rows.length === 0) {
    return null
  }
  const worst = Math.max(...live.map(limit => limit.percentUsed), 0)

  return {
    title: 'Usage',
    status: '',
    badge: usage.costUsd === null ? '' : `$${usage.costUsd.toFixed(2)}`,
    tone: worst >= 90 ? usedTone(worst) : 'plain',
    rows,
  }
}

/** `claude-opus-5-5-20260101` → `opus-5-5`: the pane is 46 columns. */
export function shortModel(model: string): string {
  return model.replace(/^claude-/, '').replace(/\[1m\]$/, '').replace(/-\d{8}$/, '')
}

function usedTone(percent: number): Tone {
  if (percent >= 90) {
    return 'bad'
  }

  return percent >= 75 ? 'warn' : 'ok'
}

function resetLabel(resetsAt: string | undefined, now: number): string {
  const at = resetsAt === undefined ? NaN : Date.parse(resetsAt)
  if (Number.isNaN(at)) {
    return ''
  }
  const minutes = Math.max(0, Math.round((at - now) / 60_000))
  if (minutes >= 48 * 60) {
    return ` · ${Math.round(minutes / (24 * 60))}d`
  }

  return minutes >= 60 ? ` · ${Math.floor(minutes / 60)}h${minutes % 60}m` : ` · ${minutes}m`
}
