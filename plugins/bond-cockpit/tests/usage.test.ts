import { expect, test } from 'claude-code/testing'

import type { Card } from '../hooks/cache'
import { EMPTY_MODELS, intoSession, modelsCard, recordModel, shortModel, usageCard, usageSnapshot } from '../hooks/usage'

const TURN = { input_tokens: 10, output_tokens: 90, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 }
const NOW = Date.parse('2026-10-11T12:00:00Z')

test('no model card before a request has answered', () => {
  expect(modelsCard(EMPTY_MODELS)).toBe(null)
})

test('models are tallied per model, subagents included, the main thread one marked', () => {
  let tally = recordModel(EMPTY_MODELS, 'claude-opus-5-5', TURN, true)
  tally = recordModel(tally, 'claude-haiku-5-5-20260301', TURN, false)
  tally = recordModel(tally, 'claude-opus-5-5', TURN, true)
  const card = modelsCard(tally)

  expect(card?.badge).toBe('')
  expect(card?.rows).toEqual([
    { kind: 'pair', label: 'opus-5-5', value: '2.0k', note: '2 req · main', tone: 'heading' },
    { kind: 'pair', label: 'haiku-5-5', value: '1.0k', note: '1 req', tone: 'plain' },
  ])
})

test('a subagent request does not change which model the main thread is on', () => {
  const tally = recordModel(recordModel(EMPTY_MODELS, 'claude-opus-5-5', TURN, true), 'claude-sonnet-5-5', TURN, false)

  expect(tally.current).toBe('claude-opus-5-5')
})

test('model ids lose the vendor prefix, the date and the 1m tag', () => {
  expect(shortModel('claude-sonnet-5-5-20260101[1m]')).toBe('sonnet-5-5')
})

test('usage shows each rate-limit window with its reset, the context fill and the cost', () => {
  const card = usageCard(
    usageSnapshot({
      context: { window: 200_000, tokens: 90_000, percent: 45 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 80, resetsAt: '2026-10-11T14:10:00Z' },
        { kind: 'seven_day', percentUsed: 30, resetsAt: '2026-10-15T12:00:00Z' },
      ],
      cost: { usd: 1.234 },
    }),
    NOW,
  )

  expect(card?.badge).toBe('$1.23')
  expect(card?.tone).toBe('plain')
  expect(card?.rows).toEqual([
    { kind: 'gauge', label: '5h', value: '80%', ratio: 0.8, note: '2h10m', tone: 'warn' },
    { kind: 'gauge', label: 'week', value: '30%', ratio: 0.3, note: '4d', tone: 'ok' },
    { kind: 'gauge', label: 'context', value: '45%', ratio: 0.45, note: '200.0k', tone: 'ok' },
  ])
})

test('a window at 90% or more turns the usage card red', () => {
  const card = usageCard(usageSnapshot({ context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 95 }], cost: undefined }), NOW)

  expect([card?.tone, card?.badge, card?.rows.length]).toEqual(['bad', '', 1])
})

test('off a subscription with no context reading there is no usage card', () => {
  expect(usageCard(usageSnapshot({ context: { window: 200_000 }, rateLimits: [] }), NOW)).toBe(null)
})

test('a window already past its reset is left out until a response reports it again', () => {
  const card = usageCard(
    usageSnapshot({ context: { window: 200_000, percent: 10 }, rateLimits: [{ kind: 'five_hour', percentUsed: 99, resetsAt: '2026-10-11T11:00:00Z' }] }),
    NOW,
  )

  expect([card?.tone, card?.rows.map(row => (row.kind === 'gauge' ? row.label : ''))]).toEqual(['plain', ['context']])
})

test('models and usage join the Session card as titled sections, the cost after its badge', () => {
  const session: Card = { title: 'Session', status: '', badge: '2 requests', tone: 'plain', rows: [{ kind: 'note', text: 'own', tone: 'plain' }] }
  const cache: Card = { title: 'Cache', status: '', badge: '', tone: 'ok', rows: [] }
  const models = modelsCard(recordModel(EMPTY_MODELS, 'claude-opus-5-5', TURN, true))
  const usage = usageCard(usageSnapshot({ context: { window: 200_000, percent: 95 }, rateLimits: [], cost: { usd: 2 } }), NOW)
  const [first, merged] = intoSession([cache, session], [models, usage])

  expect(first).toBe(cache)
  expect([merged?.title, merged?.badge, merged?.tone]).toEqual(['Session', '2 requests · $2.00', 'plain'])
  expect(merged?.rows.map(row => row.kind)).toEqual(['note', 'section', 'pair', 'section', 'gauge'])
})

test('before the first request usage still shows, in a Session card of its own', () => {
  const cache: Card = { title: 'Cache', status: '', badge: '', tone: 'dim', rows: [] }
  const usage = usageCard(usageSnapshot({ context: { window: 200_000, percent: 5 }, rateLimits: [] }), NOW)

  expect(intoSession([cache], [null, usage]).map(card => card.title)).toEqual(['Cache', 'Session'])
  expect(intoSession([cache], [null, null])).toEqual([cache])
})
