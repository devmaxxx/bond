import { expect, test } from 'claude-code/testing'

import { cacheLines, cacheStatus, shouldWarn, ttlMs } from '../hooks/cache'
import type { CacheSnapshot } from '../types'

const FIVE_MINUTES = ttlMs('5m')
const WARM: CacheSnapshot = { read: 77_900, wrote: 3_500, fresh: 2, at: 0, ttlMs: FIVE_MINUTES }

test('a warm cache shows its hit rate, token split and minutes left', () => {
  const texts = cacheLines(WARM, 60_000, 10_000).map(line => line.text)

  expect(texts).toEqual([
    'Cache',
    '██████████ 96% hit',
    'read 77.9k · wrote 3.5k · new 2',
    '⏱ 4m',
    '5m · any message refreshes it',
  ])
})

test('the last minutes count down in seconds and warn', () => {
  const lines = cacheLines(WARM, FIVE_MINUTES - 7_000, 10_000)

  expect(lines[3]).toEqual({ text: '⏱ 0:07', tone: 'warn' })
  expect(lines[4]?.text).toBe('5m · expires soon: any message refreshes it for free')
})

test('an expired cache says what the next message re-caches', () => {
  const lines = cacheLines(WARM, FIVE_MINUTES + 1, 10_000)

  expect(lines[3]).toEqual({ text: '⏱ expired', tone: 'bad' })
  expect(lines[4]?.text).toBe('5m · the next message re-caches 81.4k')
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
