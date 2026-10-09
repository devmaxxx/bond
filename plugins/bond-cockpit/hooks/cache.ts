import type { CacheSession, CacheSnapshot } from '../types'

type TtlSource = CacheSnapshot['ttlSource']

export type Tone = 'heading' | 'plain' | 'dim' | 'ok' | 'bad' | 'warn'

export type CacheTtl = '5m' | '1h'

const TTL_MS: Record<CacheTtl, number> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }
const SPARK = '▁▂▃▄▅▆▇█'
const RECENT_REQUESTS = 20
const MISS_BELOW = 50
// Price of a cached token relative to a plain input token: a read is a tenth,
// a write is a surcharge that depends on how long the entry lives.
const READ_COST = 0.1
const WRITE_COST: Record<CacheTtl, number> = { '5m': 1.25, '1h': 2 }
// Under two minutes the countdown shows seconds; above it, whole minutes are enough
// and the line redraws once a minute instead of every second.
const SECONDS_BELOW_MS = 2 * 60_000

export const EMPTY_SESSION: CacheSession = { requests: 0, read: 0, wrote: 0, fresh: 0, misses: 0, lastMissAt: null, recent: [] }

export function ttlMs(ttl: string): number {
  return ttl === '5m' ? TTL_MS['5m'] : TTL_MS['1h']
}

export function isTtl(value: unknown): value is CacheTtl {
  return value === '5m' || value === '1h'
}

/**
 * The TTL the next cache entry lives for. No request reports it, so it is
 * inferred: a fixed setting wins; a subscription past a rate-limit window is in
 * overage, where Claude Code drops to 5m; then what the last model switch
 * reported; then the default for the account kind (subscriptions get 1h).
 */
export function resolveTtl(
  setting: string,
  reported: CacheTtl | null,
  rateLimits: readonly { percentUsed: number }[],
): { ttlMs: number; ttlSource: TtlSource } {
  if (isTtl(setting)) {
    return { ttlMs: TTL_MS[setting], ttlSource: 'setting' }
  }
  if (rateLimits.some(limit => limit.percentUsed >= 100)) {
    return { ttlMs: TTL_MS['5m'], ttlSource: 'overage' }
  }
  if (reported !== null) {
    return { ttlMs: TTL_MS[reported], ttlSource: 'switch' }
  }

  return rateLimits.length > 0 ? { ttlMs: TTL_MS['1h'], ttlSource: 'plan' } : { ttlMs: TTL_MS['5m'], ttlSource: 'api' }
}

const TTL_NOTE: Record<TtlSource, string> = { setting: ' · set', overage: ' · overage', switch: '', plan: '', api: ' · API' }

export type CacheView = {
  hit: number
  remainingMs: number
  tone: Tone
  countdown: string
  hint: string
}

/** What the last main-thread request left in the cache, read at `now`. */
export function cacheView(cache: CacheSnapshot, now: number, warnMs: number): CacheView {
  const total = cache.read + cache.wrote + cache.fresh
  const hit = hitRate(cache.read, total)
  const remainingMs = Math.max(0, cache.at + cache.ttlMs - now)
  if (remainingMs === 0) {
    return { hit, remainingMs, tone: 'bad', countdown: 'expired', hint: `the next message re-caches ${tokens(total)}` }
  }
  const soon = remainingMs <= Math.max(warnMs, 60_000)

  return {
    hit,
    remainingMs,
    tone: soon ? 'warn' : 'ok',
    countdown: countdown(remainingMs),
    hint: soon ? 'expires soon: any message refreshes it for free' : 'any message refreshes it',
  }
}

export function recordRequest(session: CacheSession, cache: CacheSnapshot): CacheSession {
  const hit = hitRate(cache.read, cache.read + cache.wrote + cache.fresh)
  const isMiss = hit < MISS_BELOW

  return {
    requests: session.requests + 1,
    read: session.read + cache.read,
    wrote: session.wrote + cache.wrote,
    fresh: session.fresh + cache.fresh,
    misses: session.misses + (isMiss ? 1 : 0),
    lastMissAt: isMiss ? cache.at : session.lastMissAt,
    recent: [...session.recent, hit].slice(-RECENT_REQUESTS),
  }
}

export type Row =
  | { kind: 'hero'; value: string; label: string; bar: string; tone: Tone }
  | { kind: 'meter'; label: string; bar: string; tone: Tone }
  | { kind: 'pair'; label: string; value: string; note: string; tone: Tone }
  | { kind: 'note'; text: string; tone: Tone }

export type Card = { title: string; badge: string; tone: Tone; rows: Row[] }

const HERO_CELLS = 18
const METER_CELLS = 14

/** The pane: one card for the entry the last request left, one for the session. */
export function cacheCards(cache: CacheSnapshot | null, session: CacheSession, now: number, warnMs: number): Card[] {
  if (cache === null) {
    return [{ title: 'Cache', badge: '', tone: 'dim', rows: [{ kind: 'note', text: 'No request yet', tone: 'dim' }] }]
  }
  const ttl = ttlLabel(cache.ttlMs)

  return [entryCard(cache, now, warnMs, ttl), sessionCard(session, now, ttl)]
}

function entryCard(cache: CacheSnapshot, now: number, warnMs: number, ttl: CacheTtl): Card {
  const view = cacheView(cache, now, warnMs)
  const left = view.remainingMs > 0 ? `⏱ ${view.countdown} left` : '⏱ expired'

  return {
    title: 'Cache',
    badge: `${ttl} TTL${TTL_NOTE[cache.ttlSource]}`,
    tone: view.tone,
    rows: [
      { kind: 'hero', value: `${view.hit}%`, label: 'hit · last request', bar: bar(view.hit, HERO_CELLS), tone: hitTone(view.hit) },
      { kind: 'meter', label: left, bar: bar((view.remainingMs / cache.ttlMs) * 100, METER_CELLS), tone: view.tone },
      { kind: 'pair', label: 'read', value: tokens(cache.read), note: '', tone: 'plain' },
      { kind: 'pair', label: 'wrote', value: tokens(cache.wrote), note: '', tone: 'plain' },
      { kind: 'pair', label: 'new', value: tokens(cache.fresh), note: '', tone: 'plain' },
      { kind: 'note', text: view.hint, tone: 'dim' },
    ],
  }
}

function sessionCard(session: CacheSession, now: number, ttl: CacheTtl): Card {
  const total = session.read + session.wrote + session.fresh
  const hit = hitRate(session.read, total)
  const cost = total > 0 ? (session.read * READ_COST + session.wrote * WRITE_COST[ttl] + session.fresh) / total : 1
  // Input-token equivalents the cache took off the bill, net of the write surcharge.
  const saved = Math.round(session.read * (1 - READ_COST) - session.wrote * (WRITE_COST[ttl] - 1))
  const rebuilds = session.lastMissAt === null ? 'none' : `last ${ago(now - session.lastMissAt)} ago`

  return {
    title: 'Session',
    badge: `${session.requests} req`,
    tone: hitTone(hit),
    rows: [
      { kind: 'pair', label: 'hit', value: `${hit}%`, note: sparkline(session.recent), tone: hitTone(hit) },
      { kind: 'pair', label: 'cost', value: `${cost.toFixed(2)}×`, note: savedLabel(saved), tone: cost < 1 ? 'ok' : 'warn' },
      { kind: 'pair', label: 'rebuilds', value: String(session.misses), note: rebuilds, tone: session.misses > 1 ? 'warn' : 'plain' },
    ],
  }
}

function savedLabel(saved: number): string {
  return saved >= 0 ? `saved ${tokens(saved)}` : `lost ${tokens(-saved)}`
}

export function cacheStatus(cache: CacheSnapshot | null, now: number, warnMs: number): string | null {
  if (cache === null) {
    return null
  }
  const view = cacheView(cache, now, warnMs)

  return `cache ${view.hit}% ⏱${view.countdown}`
}

/** True once per cache window: the first tick inside the warning that has not warned yet. */
export function shouldWarn(cache: CacheSnapshot | null, now: number, warnMs: number, warnedAt: number | null): boolean {
  if (cache === null || warnMs <= 0 || warnedAt === cache.at) {
    return false
  }
  const remainingMs = cache.at + cache.ttlMs - now

  return remainingMs > 0 && remainingMs <= warnMs
}

function hitRate(read: number, total: number): number {
  return total > 0 ? Math.round((read / total) * 100) : 0
}

function ttlLabel(ms: number): CacheTtl {
  return ms >= TTL_MS['1h'] ? '1h' : '5m'
}

function bar(percent: number, cells: number): string {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * cells)

  return `${'█'.repeat(filled)}${'░'.repeat(cells - filled)}`
}

function sparkline(hits: readonly number[]): string {
  return hits.map(hit => SPARK[Math.min(SPARK.length - 1, Math.floor((hit / 100) * SPARK.length))]).join('')
}

function hitTone(hit: number): Tone {
  if (hit >= 80) {
    return 'ok'
  }

  return hit >= 50 ? 'warn' : 'bad'
}

function countdown(ms: number): string {
  if (ms >= SECONDS_BELOW_MS) {
    return `${Math.ceil(ms / 60_000)}m`
  }
  const seconds = Math.ceil(ms / 1000)

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function ago(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000)
  if (minutes < 1) {
    return '<1m'
  }

  return minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60}m` : `${minutes}m`
}

export function tokens(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`
  }

  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)
}
