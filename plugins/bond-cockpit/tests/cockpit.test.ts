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

const PR_JSON = JSON.stringify({
  number: 7,
  title: 'feat: bond cockpit',
  state: 'OPEN',
  isDraft: false,
  reviewDecision: 'REVIEW_REQUIRED',
  url: 'https://github.com/devmaxxx/bond/pull/7',
  statusCheckRollup: [
    { __typename: 'CheckRun', name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { __typename: 'CheckRun', name: 'lint', status: 'COMPLETED', conclusion: 'FAILURE' },
    { __typename: 'CheckRun', name: 'e2e', status: 'QUEUED', conclusion: '' },
  ],
})

const AUTH_JSON = JSON.stringify({ hosts: { 'github.com': [{ login: 'maxSynEfisco', active: true }] } })

const GITHUB_REPO: Record<string, string> = {
  'git rev-parse --show-toplevel': '/work/bond',
  'git branch --show-current': 'feat/bond-cockpit',
  'git remote get-url origin': 'git@github.com:devmaxxx/bond.git',
  'gh auth status --active --hostname github.com --json hosts': AUTH_JSON,
  'gh pr view --json number,title,state,isDraft,reviewDecision,url,statusCheckRollup': PR_JSON,
}

// Answers the host calls the cockpit makes; a command missing from `outputs` exits 1, as git does outside a repo.
function stubHost(on: On, outputs: Record<string, string>): (string | undefined)[] {
  const statuses: (string | undefined)[] = []
  on('session.cwd', () => ({ value: '/work/bond' }))
  on('clock.now', () => ({ value: 1_000_000 }))
  on('fs.exists', () => ({ value: false }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', (_, e) => {
    const stdout = outputs[e.argv.join(' ')]
    const isKnown = stdout !== undefined
    return {
      value: {
        exitCode: isKnown ? 0 : 1,
        stdout: isKnown ? `${stdout}\n` : '',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })

  return statuses
}

test('a GitHub repo on the wrong gh account with a failing check shows in the status line and the pane', async ($, on) => {
  const statuses = stubHost(on, GITHUB_REPO)

  await $.command.run(RUN_COCKPIT)

  expect(statuses.at(-1)).toBe('⎇ feat/bond-cockpit · github · gh maxSynEfisco ⚠ want devmaxxx · PR #7 ✗1 …1 ✓1')
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'bond-cockpit', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /⎇ feat\/bond-cockpit/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /gh maxSynEfisco ⚠ want devmaxxx/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /#7 feat: bond cockpit/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /open · review required/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /CI ✓ 1 {2}✗ 1 {2}… 1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /✗ lint/ })).toBeDefined()
    await ui.unmount()
  }
})

test('outside a git repository the status line is cleared and the pane says so', async ($, on) => {
  const statuses = stubHost(on, {})

  await $.command.run(RUN_COCKPIT)

  expect(statuses.at(-1)).toBe(undefined)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'bond-cockpit', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /Not in a git repository/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a TodoWrite call becomes the task checklist in the pane', async ($, on) => {
  stubHost(on, {})
  on('tool.call', { tool: 'TodoWrite' }, () => ({ result: { oldTodos: [], newTodos: [] } }))

  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Write the mod', status: 'completed', activeForm: 'Writing the mod' },
      { content: 'Test the pane', status: 'in_progress', activeForm: 'Testing the pane' },
      { content: 'Open the PR', status: 'pending', activeForm: 'Opening the PR' },
    ],
  })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'bond-cockpit', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /Tasks 1\/3/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /▸ Test the pane/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /○ Open the PR/ })).toBeDefined()
    await ui.unmount()
  }
})
