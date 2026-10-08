import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const SURFACES = ['terminal', 'desktop'] as const
const PANE = {
  component: 'Pane',
  requestId: 'crewboss',
  props: {
    title: 'crewboss',
    isFocused: false,
    bodyColumns: 52,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const
const RUN_HUD = {
  command: 'crewboss',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 180 },
} as const

const PR_JSON = JSON.stringify({
  number: 7,
  title: 'feat: bond hud',
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
  'git branch --show-current': 'feat/crewboss-mod',
  'git remote get-url origin': 'git@github.com:devmaxxx/bond.git',
  'gh auth status --active --hostname github.com --json hosts': AUTH_JSON,
  'gh pr view --json number,title,state,isDraft,reviewDecision,url,statusCheckRollup': PR_JSON,
}

// Answers the host calls the HUD makes; a command missing from `outputs` exits 1, as git does outside a repo.
function stubHost(
  on: On,
  outputs: Record<string, string>,
  files: Record<string, string> = {},
  failures: Record<string, string> = {},
  env: Record<string, string> = {},
): { statuses: (string | undefined)[]; envs: Record<string, Record<string, string> | undefined> } {
  const envs: Record<string, Record<string, string> | undefined> = {}
  const statuses: (string | undefined)[] = []
  on('session.cwd', () => ({ value: '/work/bond' }))
  on('clock.now', () => ({ value: 10_000_000 }))
  on('fs.exists', () => ({ value: false }))
  on('env.get', (_, e) => ({ value: env[e.name] }))
  on('fs.read', (_, e) => {
    const text = files[e.path]
    if (text === undefined) {
      throw new Error(`ENOENT: ${e.path}`)
    }
    return { value: text }
  })
  on('fs.list', (_, e) => {
    const prefix = `${e.path ?? ''}/`
    const names = Object.keys(files).filter(path => path.startsWith(prefix)).map(path => path.slice(prefix.length))
    if (names.length === 0) {
      throw new Error(`ENOENT: ${e.path}`)
    }
    return { value: names.map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })) }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', (_, e) => {
    const command = e.argv.join(' ')
    envs[command] = e.init?.env
    const stdout = outputs[command]
    const isKnown = stdout !== undefined
    return {
      value: {
        exitCode: isKnown ? 0 : 1,
        stdout: isKnown ? `${stdout}\n` : '',
        stderr: failures[command] ?? '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })

  return { statuses, envs }
}

test('a GitHub repo on the wrong gh account with a failing check shows in the status line and the pane', async ($, on) => {
  const { statuses } = stubHost(on, GITHUB_REPO)

  await $.command.run(RUN_HUD)

  expect(statuses.at(-1)).toBe('⎇ feat/crewboss-mod · github · gh maxSynEfisco ⚠ want devmaxxx · PR #7 ✗1 …1 ✓1')
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'crewboss', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /⎇ feat\/crewboss-mod/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /gh maxSynEfisco ⚠ want devmaxxx/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /#7 feat: bond hud/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /open · review required/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /CI ✓ 1 {2}✗ 1 {2}… 1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /✗ lint/ })).toBeDefined()
    await ui.unmount()
  }
})

test('outside a git repository the status line is cleared and the pane says so', async ($, on) => {
  const { statuses } = stubHost(on, {})

  await $.command.run(RUN_HUD)

  expect(statuses.at(-1)).toBe(undefined)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'crewboss', surface, ...PANE })
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
    const ui = await $.ui.mount({ plugin: 'crewboss', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /Tasks 1\/3/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /▸ Test the pane/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /○ Open the PR/ })).toBeDefined()
    await ui.unmount()
  }
})

const CREW_ENV = { HOME: '/home/max', CREWBOSS_STATE_DIR: '/state', CREWBOSS_CONFIG_DIR: '/cfg' }

const CREW_FILES: Record<string, string> = {
  '/cfg/profiles/beauty-crm.json': JSON.stringify({
    repo: { path: '/work/beauty-crm', github: 'acme/beauty-crm' },
    ghUser: 'devmaxxx',
    source: { adapter: 'repo-cli', commands: { next: 'pnpm tasks next --json', claim: 'x', close: 'x', release: 'x' } },
  }),
  '/state/current.json': JSON.stringify({
    v: 1,
    task: { id: 1407, title: 'Alert channel', state: 'NeedsHuman', stateSince: 10_000_000 - 7_200_000, branch: 'platform/1407-alert', pr: null, fixCount: 0, needsHumanReason: 'protected path touched' },
  }),
}

const CREW_OUTPUTS: Record<string, string> = {
  'gh auth token --user devmaxxx': 'gho_secret',
  'gh pr list --repo acme/beauty-crm --author devmaxxx --state open --json number,title,isDraft,reviewDecision,url,statusCheckRollup': JSON.stringify([
    { number: 41, title: 'feat: kuma ui', isDraft: false, reviewDecision: 'APPROVED', url: 'https://github.com/acme/beauty-crm/pull/41', statusCheckRollup: [] },
  ]),
  'sh -c pnpm tasks next --json': '> beauty-crm tasks\n[{"id":"1500","title":"Wave 1 audit log","planId":"BE-M02-T03"}]',
}

test('crewboss shows its loop task, my open PRs and the issues to claim', async ($, on) => {
  const { statuses } = stubHost(on, CREW_OUTPUTS, CREW_FILES, {}, CREW_ENV)

  await $.command.run(RUN_HUD)

  expect(statuses.at(-1)).toBe('⚑ #1407 NeedsHuman')
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'crewboss', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /Crewboss · beauty-crm/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^#1407 Alert channel$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ NeedsHuman $/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^2h 0m$/ })).toBeDefined()
    expect(await ui.find({ type: 'Markdown', text: /protected path touched/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^My PRs$/ })).toBeDefined()
    expect((await ui.find({ type: 'Link', text: /#41 feat: kuma ui/ }))?.props.href).toBe('https://github.com/acme/beauty-crm/pull/41')
    expect(await ui.find({ type: 'Text', text: /^To claim$/ })).toBeDefined()
    expect((await ui.find({ type: 'Link', text: /#1500 Wave 1 audit log/ }))?.props.href).toBe('https://github.com/acme/beauty-crm/issues/1500')
    await ui.unmount()
  }
})

test('the gh token pins the claimable command and never shows in a problem line', async ($, on) => {
  const claim = 'sh -c pnpm tasks next --json'
  const outputs = Object.fromEntries(Object.entries(CREW_OUTPUTS).filter(([command]) => command !== claim))
  const { envs } = stubHost(on, outputs, CREW_FILES, { [claim]: 'gh: bad credentials gho_secret' }, CREW_ENV)

  await $.command.run(RUN_HUD)

  expect(envs[claim]).toEqual({ GH_TOKEN: 'gho_secret' })
  const ui = await $.ui.mount({ plugin: 'crewboss', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /bad credentials <GH_TOKEN>/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /gho_secret/ })).toBeUndefined()
  await ui.unmount()
})

test('the Answer button puts the crewboss answer command in the prompt box without running it', async ($, on) => {
  stubHost(on, CREW_OUTPUTS, CREW_FILES, {}, CREW_ENV)
  const fills: string[] = []
  on('prompt.fill', (_, e) => {
    fills.push(e.text)
    return { isFilled: true }
  })
  await $.command.run(RUN_HUD)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'crewboss', surface, ...PANE })
    await ui.press({ key: 'answer' })
    await ui.unmount()
  }

  expect(fills).toEqual(['! crewboss answer ', '! crewboss answer '])
})

test('a drafted answer picked from the list fills the prompt with crewboss answer and that text', async ($, on) => {
  stubHost(on, CREW_OUTPUTS, CREW_FILES, {}, CREW_ENV)
  const prompts: string[] = []
  on('model.complete', (_, e) => {
    prompts.push(e.prompt)
    return {
      value: {
        isAnswered: true as const,
        text: '[{"label":"Split it","answer":"Split T27: my Kuma sign-in now, salon rows later."}]',
        usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      },
    }
  })
  const fills: string[] = []
  on('prompt.fill', (_, e) => {
    fills.push(e.text)
    return { isFilled: true }
  })

  await $.command.run(RUN_HUD)
  await $.command.run(RUN_HUD)

  expect(prompts).toHaveLength(1)
  expect(prompts[0]).toContain('protected path touched')
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'crewboss', surface, ...PANE })
    await ui.select({ key: 'answer-option', value: 'Split T27: my Kuma sign-in now, salon rows later.' })
    await ui.unmount()
  }
  expect(fills).toEqual([
    '! crewboss answer Split T27: my Kuma sign-in now, salon rows later.',
    '! crewboss answer Split T27: my Kuma sign-in now, salon rows later.',
  ])
})
