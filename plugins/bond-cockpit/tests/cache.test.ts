import { expect, test } from 'claude-code/testing'

import { EMPTY_SESSION, cacheLines, cacheStatus, recordRequest, shouldWarn, ttlMs } from '../hooks/cache'
import type { CacheSnapshot } from '../types'

const FIVE_MINUTES = ttlMs('5m')
const WARM: CacheSnapshot = { read: 77_900, wrote: 3_500, fresh: 2, at: 0, ttlMs: FIVE_MINUTES }

const COLD: CacheSnapshot = { read: 0, wrote: 80_000, fresh: 5, at: 0, ttlMs: FIVE_MINUTES }
const AFTER_WARM = recordRequest(EMPTY_SESSION, WARM)

test('a warm cache shows its hit rate, token split, time left and the session so far', () => {
  const texts = cacheLines(WARM, AFTER_WARM, 60_000, 10_000).map(line => line.text)

  expect(texts).toEqual([
    'Cache · 5m TTL',
    '██████████ 96% hit',
    'read 77.9k · wrote 3.5k · new 2',
    '████████░░ ⏱ 4m left',
    'any message refreshes it',
    '',
    'Session · 1 request',
    '96% hit · █',
    'cost 0.15× uncached · saved 69.2k tok',
    'no rebuilds',
  ])
})

test('the last minutes count down in seconds and warn', () => {
  const lines = cacheLines(WARM, AFTER_WARM, FIVE_MINUTES - 7_000, 10_000)

  expect(lines[3]).toEqual({ text: '░░░░░░░░░░ ⏱ 0:07 left', tone: 'warn' })
  expect(lines[4]?.text).toBe('expires soon: any message refreshes it for free')
})

test('an expired cache says what the next message re-caches', () => {
  const lines = cacheLines(WARM, AFTER_WARM, FIVE_MINUTES + 1, 10_000)

  expect(lines[3]).toEqual({ text: '░░░░░░░░░░ ⏱ expired', tone: 'bad' })
  expect(lines[4]?.text).toBe('the next message re-caches 81.4k')
})

test('a cold write counts as a rebuild and costs more than no cache', () => {
  const session = recordRequest(recordRequest(EMPTY_SESSION, COLD), { ...WARM, at: 60_000 })
  const texts = cacheLines({ ...WARM, at: 60_000 }, session, 3 * 60_000, 10_000).map(line => line.text)

  expect(texts.slice(6)).toEqual([
    'Session · 2 requests',
    '48% hit · ▁█',
    'cost 0.69× uncached · saved 49.2k tok',
    '1 rebuild · last 3m ago',
  ])
  expect(cacheLines(COLD, recordRequest(EMPTY_SESSION, COLD), 0, 10_000)[8]?.text).toBe('cost 1.25× uncached · lost 20.0k tok')
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
