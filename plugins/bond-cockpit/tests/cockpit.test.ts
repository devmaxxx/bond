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

function stubHost(on: On): (string | undefined)[] {
  const statuses: (string | undefined)[] = []
  on('clock.now', () => ({ value: 1_000_000 }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
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

test('the cockpit and session tabs draw before the first request', async ($, on) => {
  stubHost(on)

  await $.command.run(RUN_COCKPIT)

  for (const surface of SURFACES) {
    const brief = await $.ui.mount({ plugin: 'bond-cockpit', surface, ...PANE, requestId: 'bond-cockpit-brief', props: { ...PANE.props, title: 'cockpit' } })
    expect(await brief.find({ type: 'Text', text: 'Cockpit' })).toBeDefined()
    await brief.unmount()
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
  on('ui.render', { component: 'Pane', requestId: 'job-probe' }, ($, e) => drawCards($.ui.resolve(e), card === null ? [] : [card], e.props.bodyColumns))

  for (const surface of SURFACES) {
    const pane = await $.ui.mount({ plugin: 'bond-cockpit', surface, ...PANE, requestId: 'job-probe' })
    for (const text of ['implement:A', 'opus', '44✓', ' 2✗', ' ⚠ push', 'Bash git push']) {
      expect(await pane.find({ type: 'Text', text })).toBeDefined()
    }
    await pane.unmount()
  }
})
