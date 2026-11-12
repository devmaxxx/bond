import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import { EMPTY_SESSION, cacheCards, cacheStatus, isTtl, recordRequest, resolveTtl } from './cache'
import type { CacheTtl, TabName } from './cache'
import { EMPTY_JOB, agentCard, sendNotice, agentSpawned, endJob, flowActions, flowBand, flowRecorded, flowResume, flowStatus, isBusy, pausePath, jobCard, loopEnded, startJob, testRun, toolAsked, toolEnded, toolStarted, workflowLaunched } from './job'
import { FLOW_HOTKEY, FLOW_LABEL, drawCards } from './pane'
import type { FlowAction } from './cache'
import { isStripMode, stripLine, summaryCard } from './summary'
import type { StripMode } from './summary'
import { EMPTY_MODELS, intoSession, modelsCard, recordModel, usageCard, usageSnapshot } from './usage'

// Three tabs in open order: main, job, session. The agent tab opens beside them on a press.
const MAIN = 'bond-cockpit-main'
const MAIN_TITLE = 'main'
const PANE = 'bond-cockpit'
const PANE_TITLE = 'job'
const SESSION = 'bond-cockpit-session'
const SESSION_TITLE = 'session'
const AGENT = 'bond-cockpit-agent'
const PANE_COLUMNS = 46
const TICK_MS = 1000
const DEFAULT_CACHE_TTL = 'auto'
// How close to expiry the cache countdown turns yellow in the cards.
const WARN_MS = 10_000
// $.store, so the strip under the prompt keeps its mode across sessions.
const STRIP_KEY = 'strip'
const STRIP_MODES: Record<string, StripMode> = { expand: 'expanded', show: 'expanded', collapse: 'collapsed', hide: 'hidden' }
const SHOW_LABEL = 'show cockpit'


const cache = atom({ plugin: 'bond-cockpit', key: 'cache' } as const, null)
const session = atom({ plugin: 'bond-cockpit', key: 'session' } as const, EMPTY_SESSION)
const models = atom({ plugin: 'bond-cockpit', key: 'models' } as const, EMPTY_MODELS)
const usage = atom({ plugin: 'bond-cockpit', key: 'usage' } as const, null)
// Written only when the countdown's text changes, so the pane redraws once a minute, then once a second.
const countdown = atom({ plugin: 'bond-cockpit', key: 'countdown' } as const, '')
const job = atom({ plugin: 'bond-cockpit', key: 'job' } as const, EMPTY_JOB)
// The second the pane last redrew for elapsed times; written only while something runs.
const beat = atom({ plugin: 'bond-cockpit', key: 'beat' } as const, 0)
const watched = atom({ plugin: 'bond-cockpit', key: 'watched' } as const, null)
// The strip's mode as the drawings read it, so a change redraws them; $.store keeps it across sessions.
const strip = atom({ plugin: 'bond-cockpit', key: 'strip' } as const, null)

// session.start fires again after /clear; a tick left running would stack with the new one.
let tick: Timer | null = null
// The status line's last text; null until the first push, so a reload clears whatever the old module left there.
let statusShown: string | undefined | null = null
let ttlSetting = DEFAULT_CACHE_TTL
// Only a model switch reports the TTL; nothing else in a session does.
let reportedTtl: CacheTtl | null = null
let isTurnRunning = false
// The main loop's running turn, so the cockpit's stop can abort it.
let heldTurn: string | null = null

export const register: Register = (on, options) => {
  ttlSetting = String(options.cacheTtl ?? DEFAULT_CACHE_TTL)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'bond-cockpit', description: 'Open the bond cockpit panes (`job` / `session` for one tab), or set the strip under the prompt: `expand`, `collapse`, `hide`, `show`' })
    await measure($).catch(() => undefined)
    const stored = await $.store.get(STRIP_KEY).catch(() => undefined)
    await update($, strip, () => (isStripMode(stored) ? stored : 'expanded'))
    statusShown = null
    await pushStatus($)
    tick?.cancel()
    tick = $.clock.every(TICK_MS, () => void onTick($).catch(() => undefined))

    return started
  })

  on('command.run', { command: 'bond-cockpit' }, async ($, e) => {
    const tab = e.args.trim()
    const mode = STRIP_MODES[tab]
    if (mode !== undefined) {
      await setStrip($, mode)
      return { text: mode === 'hidden' ? 'bond cockpit: strip hidden; `/bond-cockpit show` brings it back.' : `bond cockpit: strip ${mode}.` }
    }
    const isTab = isTabName(tab)
    await (isTab ? openTab($, tab) : openPanes($))

    return { text: isTab ? `bond cockpit: ${tab} tab opened.` : 'bond cockpit opened; ctrl+x tab cycles main, job and session.' }
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      isTurnRunning = false
      await update($, cache, () => null)
      await update($, session, () => EMPTY_SESSION)
      await update($, models, () => EMPTY_MODELS)
      await update($, usage, () => null)
      await update($, job, () => EMPTY_JOB)
    }

    return next(e)
  })

  // The job starts with the main loop's turn, not the prompt: a prompt typed mid-turn is queued, and a
  // delivery (a task notification, a peer message) submits one too.
  on('turn.start', async ($, e, next) => {
    const agentId = (e as { agentId?: string }).agentId
    if (agentId === undefined) {
      isTurnRunning = true
      heldTurn = (e as { turnId?: string }).turnId ?? null
      await guard(async () => {
        const now = await $.clock.now()
        await update($, job, current => startJob(current, e.text, now))
      })
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const completed = await next(e)
    const agentId = e.agentId
    if (agentId === undefined) {
      isTurnRunning = false
      heldTurn = null
    }
    await guard(async () => {
      const now = await $.clock.now()
      await update($, job, current => (agentId === undefined ? endJob(current, now) : loopEnded(current, agentId, now)))
    })

    return completed
  })

  // Every loop's tool calls, the main one's and each agent's, feed the Job card; the call itself is never changed.
  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const agentId = e.agentId
    const startedAt = await $.clock.now().catch(() => 0)
    const id = e.tool_use_id ?? `${tool}-${startedAt}`
    const args = e as unknown as Record<string, unknown>
    await guard(() => update($, job, current => toolStarted(current, id, tool, args, agentId, startedAt)))
    const ran = await next(e)
    await guard(async () => {
      const result = (ran.result ?? {}) as { stdout?: unknown; stderr?: unknown; workflowName?: string; runId?: string }
      const test = tool === 'Bash' && agentId !== undefined ? testRun(String(args.command ?? ''), `${String(result.stdout ?? '')}\n${String(result.stderr ?? '')}`, ran.isError === true) : null
      await update($, job, current => {
        const hasFailed = ran.deny !== undefined || ran.isError === true
        const ended = toolEnded(current, id, hasFailed, agentId, test)
        if (agentId !== undefined) {
          return ended
        }
        return tool === 'Workflow' ? workflowLaunched(ended, result.workflowName, result.runId) : flowRecorded(ended, tool, args, hasFailed, startedAt)
      })
      await pushStatus($)
    })

    return ran
  }).catch(($, e, next) => next(e))

  // Observes only: the spawn names the agent and its model, and a workflow's agent counts toward its run.
  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    const agentId = spawned.deny === undefined ? spawned.agentId : undefined
    if (agentId !== undefined && spawned.deny === undefined) {
      const model = spawned.model
      await guard(async () => {
        const now = await $.clock.now()
        await update($, job, current => agentSpawned(current, agentId, e.description, model, e.workflow?.runId, now))
      })
    }

    return spawned
  }).catch(($, e, next) => next(e))

  // Observes only: an `ask` verdict means the call may now wait on the person, not on the tool.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    const id = e.tool_use_id
    if (verdict.decision === 'ask' && id !== undefined && e.agentId === undefined) {
      await guard(() => update($, job, current => toolAsked(current, id)))
    }

    return verdict
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    // The cache entry's TTL restarts when the request reads or writes it, not when a long answer finishes.
    const at = await $.clock.now()
    const stepped = yield* next(e)
    const answered = stepped.usage
    if (answered !== null) {
      await update($, models, current => recordModel(current, answered.model, answered, e.agentId === undefined))
    }
    if (e.agentId === undefined && answered !== null) {
      const { cache_read_input_tokens, cache_creation_input_tokens, input_tokens } = answered
      // The API reports a cache counter as null when the request used no caching; NaN would poison the hit rate.
      // Read after the response, so the rate-limit windows are the ones it reported.
      const measured = await $.session.usage().catch(() => null)
      const snapshot = {
        read: cache_read_input_tokens ?? 0,
        wrote: cache_creation_input_tokens ?? 0,
        fresh: input_tokens ?? 0,
        at,
        ...resolveTtl(ttlSetting, reportedTtl, measured?.rateLimits ?? []),
      }
      if (measured !== null) {
        await update($, usage, () => usageSnapshot(measured))
      }
      await update($, cache, () => snapshot)
      await update($, session, current => recordRequest(current, snapshot))
    }

    return stepped
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, () => usageSnapshot(e))

    return next(e)
  })

  on('classic.PostModelSwitch', async ($, e, next) => {
    reportedTtl = isTtl(e.cache_ttl) ? e.cache_ttl : null

    return next(e)
  })

  // Above the prompt, on every tab: a /bond:implement run's line and its buttons while it reports progress, and
  // with the strip hidden a button that brings the strip back.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const [jobNow, now, mode] = await Promise.all([read($, job), $.clock.now(), stripMode($), read($, beat)])
    if (e.props.hasSurvey || e.props.maxRows < 1) {
      return next(e)
    }
    // The flow's line and buttons stay even with the strip shown: the line under the prompt takes no keys.
    const flow = jobNow.flow ?? null
    const band = flow === null ? null : flowBand(jobNow, now, e.props.bodyColumns)
    const isHidden = mode === 'hidden'
    if (band === null && !isHidden) {
      return next(e)
    }
    const { Box, Text, Button } = $.ui.resolve(e)
    const isRunning = jobNow.startedAt !== null && jobNow.endedAt === null
    const phase = flow === null ? undefined : flow.phases[flow.current]?.name

    return (
      <Box flexDirection="column">
        {band === null ? null : <Text color={band.tone === 'warn' ? 'yellow' : 'green'} wrap="truncate-end">{band.text}</Text>}
        <Box flexDirection="row" gap={2}>
          {isHidden ? <Button key="cockpit:show" label={SHOW_LABEL} hotkey="c" dimColor onPress={() => void setStrip($, 'expanded').catch(() => undefined)} /> : null}
          {flow === null || band === null ? null : flowActions(flow, isRunning).map(action => (
            <Button key={`flow:${action}`} label={FLOW_LABEL[action]} hotkey={FLOW_HOTKEY[action]} onPress={() => void flowPress($, action).catch(() => undefined)} />
          ))}
          {band === null || phase === undefined ? null : <Button key="flow:rerun" label={`↻ rerun ${phase}`} onPress={() => void flowPress($, 'rerun', phase).catch(() => undefined)} />}
        </Box>
        {await next(e)}
      </Box>
    )
  })

  // The cockpit under the prompt, below the engine's hint line: the main card, one line collapsed, or nothing hidden.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const mode = await stripMode($)
    if (mode === 'hidden') {
      return next(e)
    }
    const [hint, cacheNow, now, usageNow, jobNow, modelsNow] = await Promise.all([
      next(e),
      read($, cache),
      $.clock.now(),
      read($, usage),
      read($, job),
      read($, models),
      read($, countdown),
      read($, beat),
    ])
    const ui = $.ui.resolve(e)
    const columns = e.viewport?.columns ?? 80
    if (mode === 'collapsed') {
      const line = stripLine(jobNow, cacheNow, usageNow, now, WARN_MS)
      const color = line.tone === 'bad' ? 'red' : line.tone === 'warn' ? 'yellow' : line.tone === 'ok' ? 'green' : undefined

      return (
        <ui.Box flexDirection="column">
          {hint}
          <ui.Text wrap="truncate-end" dimColor={color === undefined} {...(color === undefined ? {} : { color })}>{line.text}</ui.Text>
        </ui.Box>
      )
    }
    const main = summaryCard(jobNow, cacheNow, usageNow, modelsNow, now, WARN_MS)
    // The hint line takes no keys, so its headings stay plain text rather than buttons that open a tab.
    const card = { ...main, rows: main.rows.map(row => (row.kind === 'section' ? { ...row, tab: undefined } : row)) }

    return (
      <ui.Box flexDirection="column">
        {hint}
        {drawCards(ui, [card], columns)}
      </ui.Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const [cacheNow, sessionNow, now, jobNow, agents] = await Promise.all([
      read($, cache),
      read($, session),
      $.clock.now(),
      read($, job),
      $.agent.list().catch(() => []),
      // Not used below: reading them subscribes the pane to the countdown and the beat, so it redraws as they tick.
      read($, countdown),
      read($, beat),
    ])
    const current = jobCard(jobNow, agents, now)
    const [entry] = cacheCards(cacheNow, sessionNow, now, WARN_MS)
    const cards = [...(current === null ? [] : [current]), ...(entry === undefined ? [] : [entry])]

    return drawCards($.ui.resolve(e), cards, e.props.bodyColumns, {
      onAgent: agentId => void openAgent($, agentId, agents).catch(() => undefined),
      onFlow: (action, phase) => void flowPress($, action, phase).catch(() => undefined),
    })
  })

  // One agent up close: its latest calls, and a line to message it (SendMessage's own delivery).
  on('ui.render', { component: 'Pane', requestId: AGENT }, async ($, e) => {
    const [jobNow, agentId, now, agents] = await Promise.all([read($, job), read($, watched), $.clock.now(), $.agent.list().catch(() => []), read($, beat)])
    const ui = $.ui.resolve(e)
    const card = agentCard(jobNow, agentId, agents, now)
    // A surface with no text field (mobile) shows the agent without the message line.
    const Input = 'Input' in ui ? ui.Input : undefined
    const send = async (text: string) => {
      if (agentId === null || text.trim() === '') {
        return
      }
      const sent = await $.session.send({ to: { agentId }, text }).catch((error: unknown) => ({ isDelivered: false, reason: String(error) }))
      $.ui.toast(sendNotice(card.title, sent))
    }

    return (
      <ui.Box flexDirection="column">
        {drawCards(ui, [card], e.props.bodyColumns)}
        {agentId === null || Input === undefined ? null : (
          <Input key="say" label="message" placeholder={`tell ${card.title} what to change`} submitLabel="send" onSubmit={(text: string) => void send(text)} />
        )}
      </ui.Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: SESSION }, async ($, e) => {
    const [cacheNow, sessionNow, now, modelsNow, usageNow] = await Promise.all([
      read($, cache),
      read($, session),
      $.clock.now(),
      read($, models),
      read($, usage),
      read($, countdown),
    ])
    const cards = intoSession(cacheCards(cacheNow, sessionNow, now, WARN_MS).slice(1), [modelsCard(modelsNow), usageCard(usageNow, now)])
    const shown = cards.length > 0 ? cards : [{ title: 'Session', status: '', badge: '', tone: 'dim' as const, rows: [{ kind: 'note' as const, text: 'No request yet', tone: 'dim' as const }] }]

    return drawCards($.ui.resolve(e), shown, e.props.bodyColumns)
  })

  on('ui.render', { component: 'Pane', requestId: MAIN }, async ($, e) => {
    const [cacheNow, now, usageNow, jobNow, modelsNow] = await Promise.all([
      read($, cache),
      $.clock.now(),
      read($, usage),
      read($, job),
      read($, models),
      // Not used below: reading them subscribes the page to the countdown and the beat, so it redraws as they tick.
      read($, countdown),
      read($, beat),
    ])
    const card = summaryCard(jobNow, cacheNow, usageNow, modelsNow, now, WARN_MS)

    return drawCards($.ui.resolve(e), [card], e.props.bodyColumns, { onTab: tab => void openTab($, tab, true).catch(() => undefined) })
  })
}

function isTabName(text: string): text is TabName {
  return text === 'job' || text === 'session'
}

function openTab($: EngineInterface, tab: TabName, focus?: true) {
  const [id, title] = tab === 'job' ? [PANE, PANE_TITLE] : [SESSION, SESSION_TITLE]

  return $.ui.open({ id, title, columns: PANE_COLUMNS, ...(focus === undefined ? {} : { focus }) })
}

// Tabs keep their open order, so main opens first to lead them; the last pane opened is the one shown, so it opens again after.
async function openPanes($: EngineInterface) {
  await $.ui.open({ id: MAIN, title: MAIN_TITLE, columns: PANE_COLUMNS })
  await openTab($, 'job')
  await openTab($, 'session')

  return $.ui.open({ id: MAIN, title: MAIN_TITLE, columns: PANE_COLUMNS })
}

async function openAgent($: EngineInterface, agentId: string, agents: readonly { id: string; description: string }[]) {
  await update($, watched, () => agentId)
  const current = await read($, job)
  const name = current.loops[agentId]?.name ?? agents.find(agent => agent.id === agentId)?.description ?? `#${agentId.slice(0, 6)}`
  await $.ui.open({ id: AGENT, title: `agent ${name}`, columns: PANE_COLUMNS, focus: true })
  await $.ui.focus({ requestId: AGENT, key: 'say' }).catch(() => undefined)
}

/**
 * A flow button. Pause leaves the `.pause` file the run checks at each phase boundary; stop aborts the
 * running turn, so a resume restarts the phase it was in; resume and rerun submit the resume command,
 * rerun first aborting a turn still running.
 */
async function flowPress($: EngineInterface, action: FlowAction | 'rerun', phase?: string): Promise<void> {
  const flow = (await read($, job)).flow ?? null
  if (flow === null) {
    return
  }
  if (action === 'pause') {
    const path = pausePath(flow)
    if (path !== null) {
      await $.fs.write(path, '')
      $.ui.toast('bond flow: pauses at the next phase boundary')
    }
    return
  }
  if ((action === 'stop' || action === 'rerun') && heldTurn !== null) {
    await $.turn.abort({ turnId: heldTurn })
  }
  if (action === 'stop') {
    $.ui.toast(`bond flow: stopped; resume restarts ${flow.phases[flow.current]?.name ?? 'the run'}`)
    return
  }
  await $.prompt.submit({ text: flowResume(flow, action === 'rerun' ? phase : undefined), asUser: true })
}

async function stripMode($: EngineInterface): Promise<StripMode> {
  const held = await read($, strip)
  if (isStripMode(held)) {
    return held
  }
  const stored = await $.store.get(STRIP_KEY).catch(() => undefined)

  return isStripMode(stored) ? stored : 'expanded'
}

async function setStrip($: EngineInterface, mode: StripMode): Promise<void> {
  await $.store.set(STRIP_KEY, mode)
  await update($, strip, () => mode)
}

// The status line carries the implement flow's progress while a run reports it, and nothing otherwise.
async function pushStatus($: EngineInterface): Promise<void> {
  const text = flowStatus(await read($, job)) ?? undefined
  if (text !== statusShown) {
    statusShown = text
    $.ui.status(text)
  }
}

async function measure($: EngineInterface): Promise<void> {
  const now = await $.session.usage().catch(() => null)
  if (now !== null) {
    await update($, usage, () => usageSnapshot(now))
  }
}

async function onTick($: EngineInterface): Promise<void> {
  const [cacheNow, shown, now, jobNow] = await Promise.all([read($, cache), read($, countdown), $.clock.now(), read($, job)])
  if (isTurnRunning || isBusy(jobNow, now)) {
    await update($, beat, () => Math.floor(now / 1000))
  }
  const text = cacheStatus(cacheNow, now, WARN_MS) ?? ''
  if (text !== shown) {
    await update($, countdown, () => text)
  }
  await pushStatus($)
}

// The Job card is a view: a failure in its bookkeeping must never fail the tool call or the turn it watches.
async function guard(work: () => Promise<unknown>): Promise<void> {
  await work().catch(() => undefined)
}
