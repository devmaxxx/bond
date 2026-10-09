import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, Timer } from 'claude-code'

import { EMPTY_SESSION, cacheCards, cacheStatus, isTtl, recordRequest, resolveTtl, shouldWarn } from './cache'
import type { CacheTtl, Card, Row, Tone } from './cache'

const PANE = 'bond-cockpit'
const PANE_TITLE = 'bond cockpit'
const PANE_COLUMNS = 46
const TICK_MS = 1000
const DEFAULT_CACHE_TTL = 'auto'
const DEFAULT_WARN_SECONDS = 10

const TONE_PROPS: Record<Tone, { bold?: boolean; dimColor?: boolean; color?: string }> = {
  heading: { bold: true },
  plain: {},
  dim: { dimColor: true },
  ok: { color: 'success' },
  bad: { color: 'error' },
  warn: { color: 'warning' },
}
const BORDER_COLOR: Record<Tone, string> = {
  heading: 'subtle',
  plain: 'subtle',
  dim: 'inactive',
  ok: 'success',
  bad: 'error',
  warn: 'warning',
}
const LABEL_COLUMNS = 9
const VALUE_COLUMNS = 7

type Ui = ReturnType<EngineInterface['ui']['resolve']>

const cache = atom({ plugin: 'bond-cockpit', key: 'cache' } as const, null)
const session = atom({ plugin: 'bond-cockpit', key: 'session' } as const, EMPTY_SESSION)
// Written only when the countdown's text changes, so the pane redraws once a minute, then once a second.
const countdown = atom({ plugin: 'bond-cockpit', key: 'countdown' } as const, '')

// session.start fires again after /clear; a tick left running would stack with the new one.
let tick: Timer | null = null
// The cache entry (by its request time) already warned about, so the toast fires once per entry.
let warnedAt: number | null = null
let ttlSetting = DEFAULT_CACHE_TTL
// Only a model switch reports the TTL; nothing else in a session does.
let reportedTtl: CacheTtl | null = null
let warnMs = DEFAULT_WARN_SECONDS * 1000
let isTurnRunning = false

export const register: Register = (on, options) => {
  const warnSeconds = Number(options.cacheWarnSeconds ?? DEFAULT_WARN_SECONDS)
  warnMs = Number.isFinite(warnSeconds) ? Math.max(0, warnSeconds) * 1000 : DEFAULT_WARN_SECONDS * 1000
  ttlSetting = String(options.cacheTtl ?? DEFAULT_CACHE_TTL)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'bond-cockpit', description: 'Open the bond cockpit pane' })
    openPane($).catch(() => undefined)
    await pushStatus($)
    tick?.cancel()
    tick = $.clock.every(TICK_MS, () => void onTick($).catch(() => undefined))

    return started
  })

  on('command.run', { command: 'bond-cockpit' }, async $ => {
    await openPane($)
    await pushStatus($)

    return { text: 'bond cockpit opened.' }
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      isTurnRunning = false
      await update($, cache, () => null)
      await update($, session, () => EMPTY_SESSION)
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    isTurnRunning = true

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const completed = await next(e)
    if (e.agentId === undefined) {
      isTurnRunning = false
    }

    return completed
  })

  on('turn.step', async function* ($, e, next) {
    // The cache entry's TTL restarts when the request reads or writes it, not when a long answer finishes.
    const at = await $.clock.now()
    const stepped = yield* next(e)
    if (e.agentId === undefined && stepped.usage !== null) {
      const { cache_read_input_tokens, cache_creation_input_tokens, input_tokens } = stepped.usage
      // The API reports a cache counter as null when the request used no caching; NaN would poison the hit rate.
      // Read after the response, so the rate-limit windows are the ones it reported.
      const usage = await $.session.usage().catch(() => null)
      const snapshot = {
        read: cache_read_input_tokens ?? 0,
        wrote: cache_creation_input_tokens ?? 0,
        fresh: input_tokens ?? 0,
        at,
        ...resolveTtl(ttlSetting, reportedTtl, usage?.rateLimits ?? []),
      }
      await update($, cache, () => snapshot)
      await update($, session, current => recordRequest(current, snapshot))
      await pushStatus($)
    }

    return stepped
  })

  on('classic.PostModelSwitch', async ($, e, next) => {
    reportedTtl = isTtl(e.cache_ttl) ? e.cache_ttl : null

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const [cacheNow, sessionNow, now] = await Promise.all([
      read($, cache),
      read($, session),
      $.clock.now(),
      // Not used below: reading it subscribes the pane to the countdown, so it redraws as the text ticks.
      read($, countdown),
    ])
    const ui = $.ui.resolve(e)
    const cards = cacheCards(cacheNow, sessionNow, now, warnMs)

    return <ui.Box flexDirection="column">{cards.map(card => drawCard(ui, card))}</ui.Box>
  })
}

function drawCard(ui: Ui, card: Card): RenderElement {
  const { Box, Text } = ui

  return (
    <Box key={card.title} flexDirection="column" borderStyle="round" borderColor={BORDER_COLOR[card.tone]} paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>{card.title}</Text>
        <Text dimColor>{card.badge}</Text>
      </Box>
      {card.rows.map((row, index) => drawRow(ui, row, index))}
    </Box>
  )
}

function drawRow({ Box, Text }: Ui, row: Row, index: number): RenderElement {
  const key = String(index)
  const tone = TONE_PROPS[row.tone]
  switch (row.kind) {
    case 'hero':
      return (
        <Box key={key} flexDirection="column" marginY={1}>
          <Box flexDirection="row" gap={1}>
            <Text bold {...tone}>{row.value}</Text>
            <Text {...tone}>{row.bar}</Text>
          </Box>
          <Text dimColor>{row.label}</Text>
        </Box>
      )
    case 'meter':
      return (
        <Box key={key} flexDirection="row" justifyContent="space-between" marginBottom={1}>
          <Text {...tone}>{row.label}</Text>
          <Text {...tone}>{row.bar}</Text>
        </Box>
      )
    case 'pair':
      return (
        <Box key={key} flexDirection="row">
          <Box width={LABEL_COLUMNS}>
            <Text dimColor>{row.label}</Text>
          </Box>
          <Box width={VALUE_COLUMNS} justifyContent="flex-end">
            <Text bold {...tone}>{row.value}</Text>
          </Box>
          <Box marginLeft={2} flexGrow={1}>
            <Text dimColor wrap="truncate-end">{row.note}</Text>
          </Box>
        </Box>
      )
    case 'note':
      return (
        <Box key={key} marginTop={1}>
          <Text wrap="truncate-end" {...tone}>{row.text}</Text>
        </Box>
      )
  }
}

function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE, title: PANE_TITLE, columns: PANE_COLUMNS })
}

async function pushStatus($: EngineInterface): Promise<void> {
  const [cacheNow, now] = await Promise.all([read($, cache), $.clock.now()])
  $.ui.status(cacheStatus(cacheNow, now, warnMs) ?? undefined)
}

async function onTick($: EngineInterface): Promise<void> {
  const [cacheNow, shown, now] = await Promise.all([read($, cache), read($, countdown), $.clock.now()])
  const text = cacheStatus(cacheNow, now, warnMs) ?? ''
  if (text !== shown) {
    await update($, countdown, () => text)
    await pushStatus($)
  }
  // Mid-turn the user cannot send a message, so the advice would be noise.
  if (cacheNow !== null && !isTurnRunning && shouldWarn(cacheNow, now, warnMs, warnedAt)) {
    warnedAt = cacheNow.at
    const seconds = Math.ceil((cacheNow.at + cacheNow.ttlMs - now) / 1000)
    $.ui.toast(`bond-cockpit: cache expires in ${seconds}s: send a message now`)
  }
}
