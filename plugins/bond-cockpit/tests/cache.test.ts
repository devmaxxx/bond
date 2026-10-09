import { expect, test } from 'claude-code/testing'

import { EMPTY_SESSION, cacheCards, cacheStatus, recordRequest, resolveTtl, shouldWarn, ttlMs } from '../hooks/cache'
import type { Card } from '../hooks/cache'
import type { CacheSnapshot } from '../types'

const FIVE_MINUTES = ttlMs('5m')
const WARM: CacheSnapshot = { read: 77_900, wrote: 3_500, fresh: 2, at: 0, ttlMs: FIVE_MINUTES, ttlSource: 'switch' }
const COLD: CacheSnapshot = { read: 0, wrote: 80_000, fresh: 5, at: 0, ttlMs: FIVE_MINUTES, ttlSource: 'switch' }
const AFTER_WARM = recordRequest(EMPTY_SESSION, WARM)

function texts(card: Card | undefined): string[] {
  return (card?.rows ?? []).map(row => {
    switch (row.kind) {
      case 'hero':
        return `${row.value} ${row.bar} ${row.label}`
      case 'meter':
        return `${row.label} ${row.bar}`
      case 'pair':
        return `${row.label} ${row.value} ${row.note}`.trimEnd()
      case 'note':
        return row.text
    }
  })
}

test('before the first request one dim card says so', () => {
  expect(cacheCards(null, EMPTY_SESSION, 0, 10_000)).toEqual([
    { title: 'Cache', badge: '', tone: 'dim', rows: [{ kind: 'note', text: 'No request yet', tone: 'dim' }] },
  ])
})

test('a warm cache shows its hit rate, time left, token split and the session so far', () => {
  const [entry, session] = cacheCards(WARM, AFTER_WARM, 60_000, 10_000)

  expect([entry?.title, entry?.badge, entry?.tone]).toEqual(['Cache', '5m TTL', 'ok'])
  expect(texts(entry)).toEqual([
    '96% █████████████████░ hit · last request',
    '⏱ 4m left ███████████░░░',
    'read 77.9k',
    'wrote 3.5k',
    'new 2',
    'any message refreshes it',
  ])
  expect([session?.title, session?.badge]).toEqual(['Session', '1 req'])
  expect(texts(session)).toEqual(['hit 96% █', 'cost 0.15× saved 69.2k', 'rebuilds 0 none'])
})

test('the last minutes count down in seconds and turn the card yellow', () => {
  const [entry] = cacheCards(WARM, AFTER_WARM, FIVE_MINUTES - 7_000, 10_000)

  expect(entry?.tone).toBe('warn')
  expect(texts(entry)[1]).toBe('⏱ 0:07 left ░░░░░░░░░░░░░░')
  expect(texts(entry)[5]).toBe('expires soon: any message refreshes it for free')
})

test('an expired cache turns red and says what the next message re-caches', () => {
  const [entry] = cacheCards(WARM, AFTER_WARM, FIVE_MINUTES + 1, 10_000)

  expect(entry?.tone).toBe('bad')
  expect(texts(entry)[1]).toBe('⏱ expired ░░░░░░░░░░░░░░')
  expect(texts(entry)[5]).toBe('the next message re-caches 81.4k')
})

test('a cold write counts as a rebuild and costs more than no cache', () => {
  const later = { ...WARM, at: 60_000 }
  const session = recordRequest(recordRequest(EMPTY_SESSION, COLD), later)

  expect(texts(cacheCards(later, session, 3 * 60_000, 10_000)[1])).toEqual([
    'hit 48% ▁█',
    'cost 0.69× saved 49.2k',
    'rebuilds 1 last 3m ago',
  ])
  expect(texts(cacheCards(COLD, recordRequest(EMPTY_SESSION, COLD), 0, 10_000)[1])[1]).toBe('cost 1.25× lost 20.0k')
})

test('the toast fires once inside the warning window and never after expiry', () => {
  expect(shouldWarn(WARM, FIVE_MINUTES - 11_000, 10_000, null)).toBe(false)
  expect(shouldWarn(WARM, FIVE_MINUTES - 9_000, 10_000, null)).toBe(true)
  expect(shouldWarn(WARM, FIVE_MINUTES - 8_000, 10_000, WARM.at)).toBe(false)
  expect(shouldWarn(WARM, FIVE_MINUTES + 1, 10_000, null)).toBe(false)
  expect(shouldWarn(WARM, FIVE_MINUTES - 9_000, 0, null)).toBe(false)
})

test('the status line shows hit rate and time left, and nothing before the first request', () => {
  expect(cacheStatus(WARM, FIVE_MINUTES - 7_000, 10_000)).toBe('cache 96% ⏱0:07')
  expect(cacheStatus(null, 0, 10_000)).toBe(null)
})

test('auto TTL: overage drops to 5m, then a switch report, then 1h on a subscription and 5m on an API key', () => {
  const subscription = [{ percentUsed: 40 }, { percentUsed: 12 }]
  const overage = [{ percentUsed: 100 }, { percentUsed: 60 }]

  expect(resolveTtl('auto', null, subscription)).toEqual({ ttlMs: ttlMs('1h'), ttlSource: 'plan' })
  expect(resolveTtl('auto', null, [])).toEqual({ ttlMs: FIVE_MINUTES, ttlSource: 'api' })
  expect(resolveTtl('auto', '5m', subscription)).toEqual({ ttlMs: FIVE_MINUTES, ttlSource: 'switch' })
  expect(resolveTtl('auto', '1h', overage)).toEqual({ ttlMs: FIVE_MINUTES, ttlSource: 'overage' })
})

test('a fixed TTL setting wins over everything the session reports', () => {
  expect(resolveTtl('1h', '5m', [{ percentUsed: 100 }])).toEqual({ ttlMs: ttlMs('1h'), ttlSource: 'setting' })
  expect(resolveTtl('5m', null, [{ percentUsed: 10 }])).toEqual({ ttlMs: FIVE_MINUTES, ttlSource: 'setting' })
})

test('the badge says when the TTL is not the plain default', () => {
  expect(cacheCards({ ...WARM, ttlSource: 'overage' }, AFTER_WARM, 0, 10_000)[0]?.badge).toBe('5m TTL · overage')
  expect(cacheCards({ ...WARM, ttlSource: 'setting' }, AFTER_WARM, 0, 10_000)[0]?.badge).toBe('5m TTL · set')
})
