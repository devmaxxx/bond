import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { EMPTY_JOB, agentSpawned, jobCard, startJob, testRun, toolEnded, toolStarted } from '../hooks/job'
import { drawCards } from '../hooks/pane'

const SURFACES = ['terminal', 'desktop'] as const
const PANE = {
  component: 'Pane',
  requestId: 'bond-cockpit',
  props: {
    title: 'bond cockpit',
    isFocused: false,
    bodyColumns: 46,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const
const RUN_COCKPIT = {
  command: 'bond-cockpit',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 180 },
} as const

function stubHost(on: On, opened: string[] = []): (string | undefined)[] {
  const statuses: (string | undefined)[] = []
  on('clock.now', () => ({ value: 1_000_000 }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })

  return statuses
}

test('before the first request the status line is empty and the pane says so', async ($, on) => {
  const statuses = stubHost(on)

  await $.command.run(RUN_COCKPIT)

  expect(statuses.at(-1)).toBe(undefined)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'bond-cockpit', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: 'Cache' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /No request yet/ })).toBeDefined()
    await ui.unmount()
  }
})

test('main opens first, so its tab leads, and again last, so it is the one shown', async ($, on) => {
  const opened: string[] = []
  stubHost(on, opened)

  await $.command.run(RUN_COCKPIT)

  expect(opened).toEqual(['bond-cockpit-main', 'bond-cockpit', 'bond-cockpit-session', 'bond-cockpit-main'])
})

test('the main and session tabs draw before the first request, main with a button per tab', async ($, on) => {
  stubHost(on)

  await $.command.run(RUN_COCKPIT)

  for (const surface of SURFACES) {
    const main = await $.ui.mount({ plugin: 'bond-cockpit', surface, ...PANE, requestId: 'bond-cockpit-main', props: { ...PANE.props, title: 'main' } })
    expect(await main.find({ type: 'Text', text: 'Cockpit' })).toBeDefined()
    expect(await main.find({ type: 'Button', key: 'tab:job' })).toBeDefined()
    expect(await main.find({ type: 'Button', key: 'tab:session' })).toBeDefined()
    expect(await main.find({ type: 'Text', text: 'No request yet' })).toBeDefined()
    await main.unmount()
    const session = await $.ui.mount({ plugin: 'bond-cockpit', surface, ...PANE, requestId: 'bond-cockpit-session', props: { ...PANE.props, title: 'session' } })
    expect(await session.find({ type: 'Text', text: 'Session' })).toBeDefined()
    await session.unmount()
  }
})

test('the job card draws each workflow agent with its test counts and a push warning', async ($, on) => {
  let current = startJob(EMPTY_JOB, 'build the batch', 1_000_000)
  current = toolStarted(current, 'w', 'Workflow', {}, undefined, 1_000_000)
  current = agentSpawned(current, 'a1', 'implement:A', 'claude-opus-5-5', 'wf_1', 1_000_000)
  current = toolStarted(current, 't1', 'Bash', { command: 'pnpm exec vitest run' }, 'a1', 1_000_000)
  current = toolEnded(current, 't1', false, 'a1', testRun('pnpm exec vitest run', '2 failed | 44 passed'))
  current = toolStarted(current, 't2', 'Bash', { command: 'git push' }, 'a1', 1_000_000)
  const card = jobCard(current, [], 1_060_000)
  on('ui.render', { component: 'Pane', requestId: 'job-probe' }, ($, e) => drawCards($.ui.resolve(e), card === null ? [] : [card], e.props.bodyColumns, { onAgent: () => undefined }))

  for (const surface of SURFACES) {
    const pane = await $.ui.mount({ plugin: 'bond-cockpit', surface, ...PANE, requestId: 'job-probe' })
    for (const text of ['implement:A', 'opus', '44✓', ' 2✗', ' ⚠ push', 'Bash git push']) {
      expect(await pane.find({ type: 'Text', text })).toBeDefined()
    }
    // Pressing needs the button drawn by the plugin's own hook; this probe is the test's, so check the drawing.
    expect(await pane.find({ type: 'Button', key: 'agent:a1' })).toBeDefined()
    await pane.unmount()
  }
})

test('the agent tab asks for a pick before one is chosen', async ($, on) => {
  stubHost(on)

  await $.command.run(RUN_COCKPIT)

  for (const surface of SURFACES) {
    const pane = await $.ui.mount({ plugin: 'bond-cockpit', surface, ...PANE, requestId: 'bond-cockpit-agent', props: { ...PANE.props, title: 'agent' } })
    expect(await pane.find({ type: 'Text', text: 'Press an agent in the job tab' })).toBeDefined()
    await pane.unmount()
  }
})

const HINT = { component: 'PromptHint', requestId: 'hint', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' }, viewport: { columns: 100, rows: 40 } } as const
const strip = (args: string) => ({ ...RUN_COCKPIT, args })

test('the cockpit sits under the prompt expanded, collapses to one line and hides, never opening a pane', async ($, on) => {
  const opened: string[] = []
  stubHost(on, opened)
  const stored = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: stored.get(e.key) }))
  on('store.set', (_, e) => {
    stored.set(e.key, e.value)
    return { value: undefined }
  })

  for (const surface of SURFACES) {
    const expanded = await $.ui.mount({ plugin: 'bond-cockpit', surface, ...HINT })
    expect(await expanded.find({ type: 'Text', text: 'Cockpit' })).toBeDefined()
    expect(await expanded.find({ type: 'Button', key: 'tab:job' })).toBe(undefined)
    await expanded.unmount()
  }

  expect((await $.command.run(strip('collapse'))).text).toBe('bond cockpit: strip collapsed.')
  const collapsed = await $.ui.mount({ plugin: 'bond-cockpit', surface: 'terminal', ...HINT })
  expect(await collapsed.find({ type: 'Text', text: /^cockpit ○/ })).toBeDefined()
  expect(await collapsed.find({ type: 'Text', text: 'Cockpit' })).toBe(undefined)
  await collapsed.unmount()

  await $.command.run(strip('hide'))
  const hidden = await $.ui.mount({ plugin: 'bond-cockpit', surface: 'terminal', ...HINT })
  expect(await hidden.find({ type: 'Text', text: /cockpit/i })).toBe(undefined)
  await hidden.unmount()

  await $.command.run(strip('show'))
  const shown = await $.ui.mount({ plugin: 'bond-cockpit', surface: 'terminal', ...HINT })
  expect(await shown.find({ type: 'Text', text: 'Cockpit' })).toBeDefined()
  await shown.unmount()
  expect(opened).toEqual([])
})

const FLOW_FILE = '/Users/x/.local/state/bond-flow/repo--feat-auth.json'
const flowContent = (phases: [string, string][], paused = '') => JSON.stringify({ branch: 'feat/auth', paused, phases: phases.map(([name, status]) => ({ name, status })) })
const ABOVE = { component: 'AbovePrompt', requestId: 'above', props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} }, viewport: { columns: 100, rows: 40 } } as const

function stubStore(on: On): void {
  const stored = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: stored.get(e.key) }))
  on('store.set', (_, e) => {
    stored.set(e.key, e.value)
    return { value: undefined }
  })
}

test('the status line carries the implement flow while it runs, holds still on a denied write, and clears once done', async ($, on) => {
  const statuses = stubHost(on)
  let isDenied = false
  on('tool.call', (_, e) => (isDenied ? { deny: 'not allowed' } : { result: { type: 'create', filePath: String((e as { file_path?: unknown }).file_path), content: '', structuredPatch: [], originalFile: null } }))
  const write = (content: string) => $.tool.call({ tool: 'Write', file_path: FLOW_FILE, content } as never)

  await write(flowContent([['Setup', 'done'], ['Plan', 'active'], ['Build', 'todo']]))
  expect(statuses.at(-1)).toBe('feat/auth ▰▱▱ 1/3 · Plan')

  isDenied = true
  await write(flowContent([['Setup', 'done'], ['Plan', 'done'], ['Build', 'paused']], 'crafted'))
  expect(statuses.at(-1)).toBe('feat/auth ▰▱▱ 1/3 · Plan')

  isDenied = false
  await write(flowContent([['Setup', 'done'], ['Plan', 'done'], ['Build', 'done']]))
  expect(statuses.at(-1)).toBe(undefined)
  expect(statuses.some(text => text?.startsWith('cache'))).toBe(false)
})

test('with the strip hidden a button above the prompt brings it back; shown and with no flow, the band is left to others', async ($, on) => {
  stubHost(on)
  stubStore(on)

  for (const surface of SURFACES) {
    await $.command.run(strip('expand'))
    const shown = await $.ui.mount({ plugin: 'bond-cockpit', surface, ...ABOVE })
    expect(await shown.find({ type: 'Button', key: 'cockpit:show' })).toBe(undefined)
    await shown.unmount()

    await $.command.run(strip('hide'))
    const above = await $.ui.mount({ plugin: 'bond-cockpit', surface, ...ABOVE })
    await above.press({ key: 'cockpit:show' })
    await above.unmount()

    const hint = await $.ui.mount({ plugin: 'bond-cockpit', surface, ...HINT })
    expect(await hint.find({ type: 'Text', text: 'Cockpit' })).toBeDefined()
    await hint.unmount()
  }
})

test('a running flow keeps its buttons above the prompt with the strip shown, and hiding the strip adds the way back', async ($, on) => {
  stubHost(on)
  stubStore(on)
  on('tool.call', (_, e) => ({ result: { type: 'create', filePath: String((e as { file_path?: unknown }).file_path), content: '', structuredPatch: [], originalFile: null } }))
  await $.tool.call({ tool: 'Write', file_path: FLOW_FILE, content: flowContent([['Plan', 'done'], ['Build', 'paused']], 'stopped') } as never)

  for (const surface of SURFACES) {
    await $.command.run(strip('expand'))
    const shown = await $.ui.mount({ plugin: 'bond-cockpit', surface, ...ABOVE })
    expect(await shown.find({ type: 'Button', key: 'flow:rerun' })).toBeDefined()
    expect(await shown.find({ type: 'Button', key: 'cockpit:show' })).toBe(undefined)
    await shown.unmount()

    await $.command.run(strip('hide'))
    const hidden = await $.ui.mount({ plugin: 'bond-cockpit', surface, ...ABOVE })
    expect(await hidden.find({ type: 'Button', key: 'flow:rerun' })).toBeDefined()
    expect(await hidden.find({ type: 'Button', key: 'cockpit:show' })).toBeDefined()
    await hidden.unmount()
  }
})

test('the strip keeps the engine hint line in every mode, and a session start opens no pane', async ($, on) => {
  const opened: string[] = []
  stubHost(on, opened)
  stubStore(on)
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, e.props.hint) as never
  })

  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }) as never)
  on('clock.every', () => ({ value: { cancel: () => undefined } }) as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  for (const mode of ['expand', 'collapse', 'hide']) {
    await $.command.run(strip(mode))
    const hint = await $.ui.mount({ plugin: 'bond-cockpit', surface: 'terminal', ...HINT })
    expect(await hint.find({ type: 'Text', text: '? for shortcuts' })).toBeDefined()
    await hint.unmount()
  }
  expect(opened).toEqual([])
})
