import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

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
