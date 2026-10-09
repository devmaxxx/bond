import type { CacheSnapshot } from '../types'

export type Tone = 'heading' | 'plain' | 'dim' | 'ok' | 'bad' | 'warn'

export type Line = { text: string; tone: Tone }

export type CacheTtl = '5m' | '1h'

const TTL_MS: Record<CacheTtl, number> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }
const BAR_CELLS = 10
// Under two minutes the countdown shows seconds; above it, whole minutes are enough
// and the line redraws once a minute instead of every second.
const SECONDS_BELOW_MS = 2 * 60_000

export function ttlMs(ttl: string): number {
  return ttl === '5m' ? TTL_MS['5m'] : TTL_MS['1h']
}

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
  const hit = total > 0 ? Math.round((cache.read / total) * 100) : 0
  const remainingMs = Math.max(0, cache.at + cache.ttlMs - now)
  const ttlLabel = cache.ttlMs >= TTL_MS['1h'] ? '1h' : '5m'
  if (remainingMs === 0) {
    return { hit, remainingMs, tone: 'bad', countdown: 'expired', hint: `${ttlLabel} · the next message re-caches ${tokens(total)}` }
  }
  const soon = remainingMs <= Math.max(warnMs, 60_000)

  return {
    hit,
    remainingMs,
    tone: soon ? 'warn' : 'ok',
    countdown: countdown(remainingMs),
    hint: soon ? `${ttlLabel} · expires soon: any message refreshes it for free` : `${ttlLabel} · any message refreshes it`,
  }
}

export function cacheLines(cache: CacheSnapshot | null, now: number, warnMs: number): Line[] {
  const heading: Line = { text: 'Cache', tone: 'heading' }
  if (cache === null) {
    return [heading, { text: 'No request yet', tone: 'dim' }]
  }
  const view = cacheView(cache, now, warnMs)
  const filled = Math.round((view.hit / 100) * BAR_CELLS)

  return [
    heading,
    { text: `${'█'.repeat(filled)}${'░'.repeat(BAR_CELLS - filled)} ${view.hit}% hit`, tone: hitTone(view.hit) },
    { text: `read ${tokens(cache.read)} · wrote ${tokens(cache.wrote)} · new ${tokens(cache.fresh)}`, tone: 'plain' },
    { text: `⏱ ${view.countdown}`, tone: view.tone },
    { text: view.hint, tone: 'dim' },
  ]
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

export function tokens(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`
  }

  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)
}
