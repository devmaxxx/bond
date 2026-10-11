import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import { EMPTY_SESSION, cacheCards, cacheStatus, isTtl, recordRequest, resolveTtl, shouldWarn } from './cache'
import type { CacheTtl } from './cache'
import { EMPTY_JOB, agentCard, sendNotice, agentSpawned, endJob, isBusy, jobCard, loopEnded, startJob, testRun, toolAsked, toolEnded, toolStarted, workflowLaunched } from './job'
import { drawCards } from './pane'
import { summaryCard } from './summary'
import { EMPTY_MODELS, intoSession, modelsCard, recordModel, usageCard, usageSnapshot } from './usage'

// Three tabs: the short page is opened last, so it is in front; job and session sit behind it.
const PANE = 'bond-cockpit'
const PANE_TITLE = 'job'
const SESSION = 'bond-cockpit-session'
const SESSION_TITLE = 'session'
const BRIEF = 'bond-cockpit-brief'
const BRIEF_TITLE = 'cockpit'
const AGENT = 'bond-cockpit-agent'
const PANE_COLUMNS = 46
const TICK_MS = 1000
const DEFAULT_CACHE_TTL = 'auto'
const DEFAULT_WARN_SECONDS = 10


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
    await $.command.register({ name: 'bond-cockpit', description: 'Open the bond cockpit: the short page, or `job` / `session` for that tab' })
    openPanes($).catch(() => undefined)
    await measure($).catch(() => undefined)
    await pushStatus($)
    tick?.cancel()
    tick = $.clock.every(TICK_MS, () => void onTick($).catch(() => undefined))

    return started
  })

  on('command.run', { command: 'bond-cockpit' }, async ($, e) => {
    const tab = e.args.trim()
    await (tab === 'job' ? openJob($) : tab === 'session' ? openSession($) : openPanes($))
    await pushStatus($)

    return { text: tab === 'job' || tab === 'session' ? `bond cockpit: ${tab} tab opened.` : 'bond cockpit opened; ctrl+x tab cycles cockpit, job and session.' }
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
        const ended = toolEnded(current, id, ran.deny !== undefined || ran.isError === true, agentId, test)
        return tool === 'Workflow' && agentId === undefined ? workflowLaunched(ended, result.workflowName, result.runId) : ended
      })
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
      await pushStatus($)
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
    const [entry] = cacheCards(cacheNow, sessionNow, now, warnMs)
    const cards = [...(current === null ? [] : [current]), ...(entry === undefined ? [] : [entry])]

    return drawCards($.ui.resolve(e), cards, e.props.bodyColumns, agentId => void openAgent($, agentId, agents).catch(() => undefined))
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
    const cards = intoSession(cacheCards(cacheNow, sessionNow, now, warnMs).slice(1), [modelsCard(modelsNow), usageCard(usageNow, now)])
    const shown = cards.length > 0 ? cards : [{ title: 'Session', status: '', badge: '', tone: 'dim' as const, rows: [{ kind: 'note' as const, text: 'No request yet', tone: 'dim' as const }] }]

    return drawCards($.ui.resolve(e), shown, e.props.bodyColumns)
  })

  on('ui.render', { component: 'Pane', requestId: BRIEF }, async ($, e) => {
    const [cacheNow, now, usageNow, jobNow] = await Promise.all([
      read($, cache),
      $.clock.now(),
      read($, usage),
      read($, job),
      // Not used below: reading them subscribes the page to the countdown and the beat, so it redraws as they tick.
      read($, countdown),
      read($, beat),
    ])

    return drawCards($.ui.resolve(e), [summaryCard(jobNow, cacheNow, usageNow, now, warnMs)], e.props.bodyColumns)
  })
}

function openJob($: EngineInterface) {
  return $.ui.open({ id: PANE, title: PANE_TITLE, columns: PANE_COLUMNS })
}

function openSession($: EngineInterface) {
  return $.ui.open({ id: SESSION, title: SESSION_TITLE, columns: PANE_COLUMNS })
}

async function openPanes($: EngineInterface) {
  await openSession($)
  await openJob($)

  return $.ui.open({ id: BRIEF, title: BRIEF_TITLE, columns: PANE_COLUMNS })
}

async function openAgent($: EngineInterface, agentId: string, agents: readonly { id: string; description: string }[]) {
  await update($, watched, () => agentId)
  const current = await read($, job)
  const name = current.loops[agentId]?.name ?? agents.find(agent => agent.id === agentId)?.description ?? `#${agentId.slice(0, 6)}`
  await $.ui.open({ id: AGENT, title: `agent ${name}`, columns: PANE_COLUMNS, focus: true })
  await $.ui.focus({ requestId: AGENT, key: 'say' }).catch(() => undefined)
}

async function pushStatus($: EngineInterface): Promise<void> {
  const [cacheNow, now] = await Promise.all([read($, cache), $.clock.now()])
  $.ui.status(cacheStatus(cacheNow, now, warnMs) ?? undefined)
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

// The Job card is a view: a failure in its bookkeeping must never fail the tool call or the turn it watches.
async function guard(work: () => Promise<unknown>): Promise<void> {
  await work().catch(() => undefined)
}
