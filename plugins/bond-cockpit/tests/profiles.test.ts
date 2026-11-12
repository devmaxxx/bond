import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { featureRows, nextDescCap, serverRows, toggleFeature, toggleServer } from '../hooks/features'
import { PROFILES, activeProfile, applyProfile, buildCatalog, countUse, editProfile, findProfile, storedProfiles, toggleEntry } from '../hooks/profiles'

const dev = findProfile('dev')!

test('a profile keeps the permissions and leaves unmanaged plugins and skills alone', async () => {
  const local = { permissions: { allow: ['Bash(ls)'] }, enabledPlugins: { 'mine@me': true }, skillOverrides: { 'gitnexus-cli': 'off' } }

  const next = applyProfile(local, dev)

  expect(next.permissions).toEqual({ allow: ['Bash(ls)'] })
  const plugins = next.enabledPlugins as Record<string, boolean>
  expect(plugins['mine@me']).toBe(true)
  expect(plugins['superpowers@claude-plugins-official']).toBe(true)
  expect(plugins['atlassian@claude-plugins-official']).toBe(false)
  const skills = next.skillOverrides as Record<string, string>
  expect(skills['gitnexus-cli']).toBe('off')
  expect(skills['clean-architecture']).toBe('on')
  expect(skills['captcha-ninja']).toBe('off')
})

test('the file a profile wrote reads back as that profile, and as none once edited by hand', async () => {
  for (const profile of PROFILES) {
    expect(activeProfile(applyProfile({}, profile))).toBe(profile.name)
  }
  const edited = applyProfile({}, dev) as { enabledPlugins: Record<string, boolean> }
  edited.enabledPlugins['taste-skill@taste-skill'] = true

  expect(activeProfile(edited)).toBe(null)
})

test('reset drops every managed entry and the emptied keys with them', async () => {
  const next = applyProfile(applyProfile({ model: 'opus' }, dev), null)

  expect(next).toEqual({ model: 'opus' })
})

test('no profile and no toggle turns the cockpit off', async () => {
  const cockpit = { kind: 'plugin' as const, id: 'bond-cockpit@devmaxxx', label: 'bond-cockpit', isOn: true, tokens: 0, uses: 0 }

  expect(toggleEntry({}, cockpit)).toEqual({})
  expect(editProfile(PROFILES, 'dev', 'plugin', 'bond-cockpit@devmaxxx')).toEqual([...PROFILES])
  expect(applyProfile({}, dev).enabledPlugins).not.toHaveProperty('bond-cockpit@devmaxxx')
})

test('a plugin added to one profile goes off in the others', async () => {
  const profiles = editProfile(PROFILES, 'dev', 'plugin', 'new-thing@market')
  const minimal = findProfile('minimal', profiles)!

  expect((applyProfile({}, findProfile('dev', profiles)!, profiles).enabledPlugins as Record<string, boolean>)['new-thing@market']).toBe(true)
  expect((applyProfile({}, minimal, profiles).enabledPlugins as Record<string, boolean>)['new-thing@market']).toBe(false)
  expect(findProfile('minimal', editProfile(profiles, 'minimal', 'skill', 'credential-handling'))!.skills).toEqual([])
})

test('a toggle flips a plugin and a skill in the local file', async () => {
  const plugin = { kind: 'plugin' as const, id: 'zerograph@zerograph', label: 'zerograph', isOn: true, tokens: 0, uses: 0 }
  const skill = { kind: 'skill' as const, id: 'sharp-edges', label: 'sharp-edges', isOn: false, tokens: 0, uses: 0 }

  expect(toggleEntry({}, plugin)).toEqual({ enabledPlugins: { 'zerograph@zerograph': false } })
  expect(toggleEntry({}, skill)).toEqual({ skillOverrides: { 'sharp-edges': 'on' } })
})

test('a Skill call counts for the skill and its plugin, a plugin MCP call for the plugin', async () => {
  const once = countUse({}, 'Skill', { skill: 'bond:implement' })!
  const twice = countUse(once, 'mcp__plugin_zerograph_zerograph__ask', {})!

  expect(twice).toEqual({ implement: 1, 'plugin:bond': 1, 'plugin:zerograph': 1 })
  expect(countUse({}, 'Bash', { command: 'ls' })).toBe(null)
})

test('the catalog sums each plugin its skills and MCP tools and marks the off ones', async () => {
  const catalog = buildCatalog(
    { enabledPlugins: { 'zerograph@zerograph': true, 'taste-skill@taste-skill': false }, skillOverrides: { 'emil-design-eng': 'off' } },
    {},
    {
      skills: [
        { name: 'use-the-graph', source: 'plugin', pluginName: 'zerograph', tokens: 120 },
        { name: 'clean-architecture', source: 'userSettings', tokens: 80 },
      ],
      tools: [{ name: 'ask', serverName: 'plugin:zerograph:zerograph', tokens: 300 }],
    },
    { 'plugin:zerograph': 4, 'clean-architecture': 2 },
  )
  const zerograph = catalog.plugins.find(entry => entry.id === 'zerograph@zerograph')!

  expect(zerograph).toEqual({ kind: 'plugin', id: 'zerograph@zerograph', label: 'zerograph', isOn: true, tokens: 420, uses: 4 })
  expect(catalog.plugins.find(entry => entry.id === 'taste-skill@taste-skill')!.isOn).toBe(false)
  expect(catalog.skills.find(entry => entry.id === 'emil-design-eng')!.isOn).toBe(false)
  expect(catalog.skills.find(entry => entry.id === 'clean-architecture')).toEqual({ kind: 'skill', id: 'clean-architecture', label: 'clean-architecture', isOn: true, tokens: 80, uses: 2 })
  expect(catalog.skillTokens).toBe(200)
  expect(catalog.mcpTokens).toBe(300)
})

test('a stored value that is not a profile list falls back to the defaults', async () => {
  expect(storedProfiles(undefined)).toEqual([...PROFILES])
  expect(storedProfiles([{ nope: 1 }])).toEqual([...PROFILES])
  expect(storedProfiles([{ name: 'x', summary: 's', plugins: ['a@b'], skills: [] }])).toEqual([{ name: 'x', summary: 's', plugins: ['a@b'], skills: [] }])
})

function stubFiles(on: On, files: Map<string, string>, store: Map<string, unknown>): void {
  on('store.get', (_, e) => ({ value: store.get((e as { key: string }).key) }))
  on('store.set', (_, e) => {
    const { key, value } = e as { key: string; value: unknown }
    store.set(key, value)
    return { value: undefined }
  })
  on('fs.read', (_, e) => {
    const text = files.get((e as { path: string }).path)
    if (text === undefined) {
      throw new Error('ENOENT')
    }
    return { value: text }
  })
  on('fs.write', (_, e) => {
    const { path, text } = e as { path: string; text: string }
    files.set(path, text)
    return { value: undefined }
  })
  on('process.run', () => ({ value: { exitCode: 0, stdout: '/repo/.git\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('prompt.fill', () => ({ isFilled: true }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
}

test('/bond-cockpit profile writes the profile at the main checkout root and keeps the rest of the file', async ($, on) => {
  const files = new Map([['/repo/.claude/settings.local.json', JSON.stringify({ permissions: { allow: ['Bash(ls)'] } })]])
  stubFiles(on, files, new Map())

  const ran = await $.command.run({ command: 'bond-cockpit', args: 'profile job-search', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 180 } })

  expect(String(ran.text)).toContain('job-search')
  const written = JSON.parse(files.get('/repo/.claude/settings.local.json')!) as Record<string, Record<string, unknown>>
  expect(written.permissions).toEqual({ allow: ['Bash(ls)'] })
  expect(written.skillOverrides!['captcha-ninja']).toBe('on')
  expect(written.enabledPlugins!['superpowers@claude-plugins-official']).toBe(false)
})

const PLUGINS_PANE = {
  component: 'Pane',
  requestId: 'bond-cockpit-plugins',
  props: { title: 'plugins', isFocused: true, bodyColumns: 46, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} },
} as const

test('the plugins tab toggles a plugin in this checkout, and while a profile is edited, in the profile', async ($, on) => {
  const files = new Map<string, string>()
  const store = new Map<string, unknown>()
  stubFiles(on, files, store)
  on('settings.read', () => ({ value: { enabledPlugins: { 'zerograph@zerograph': true } } }))
  await $.command.run({ command: 'bond-cockpit', args: 'plugins', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 180 } })

  const ui = await $.ui.mount({ plugin: 'bond-cockpit', surface: 'terminal', ...PLUGINS_PANE })
  expect(await ui.find({ type: 'Text', text: 'Profiles' })).toBeDefined()
  await ui.press({ key: 'plugin:zerograph@zerograph' })
  const local = JSON.parse(files.get('/repo/.claude/settings.local.json')!) as { enabledPlugins: Record<string, boolean> }
  expect(local.enabledPlugins['zerograph@zerograph']).toBe(false)

  await ui.press({ key: 'edit:minimal' })
  await ui.press({ key: 'skill:captcha-ninja' })
  const minimal = (store.get('profiles') as { name: string; skills: string[] }[]).find(profile => profile.name === 'minimal')!
  expect(minimal.skills).toContain('captcha-ninja')
})

test('a feature toggle writes its off value, and on again its on value or, for a sticky key, nothing', async () => {
  expect(toggleFeature({}, 'includeGitInstructions', true)).toEqual({ includeGitInstructions: false })
  expect(toggleFeature({ includeGitInstructions: false }, 'includeGitInstructions', false)).toEqual({ includeGitInstructions: true })
  expect(toggleFeature({ enableArtifact: false }, 'enableArtifact', false)).toEqual({})
  expect(toggleServer({}, 'figma', true)).toEqual({ deniedMcpServers: [{ serverName: 'figma' }] })
  expect(toggleServer({ deniedMcpServers: [{ serverName: 'figma' }] }, 'figma', false)).toEqual({})
  expect(nextDescCap(nextDescCap(nextDescCap({})))).toEqual({})
  expect(nextDescCap({})).toEqual({ skillListingMaxDescChars: 160 })

  const tools = [
    { serverName: 'claude.ai Gmail', tokens: 500, isLoaded: true },
    { serverName: 'figma', tokens: 900, isLoaded: false },
  ]
  const rows = featureRows({ syncClaudeAiSkills: false }, { skills: [{ source: 'syncedSkills', tokens: 300 }], tools })
  expect(rows.find(row => row.key === 'syncClaudeAiSkills')).toEqual({ key: 'syncClaudeAiSkills', label: 'claude.ai skills', isOn: false, tokens: 300 })
  expect(rows.find(row => row.key === 'disableClaudeAiConnectors')!.tokens).toBe(500)
  expect(serverRows({ deniedMcpServers: [{ serverName: 'figma' }] }, tools)).toEqual([
    { name: 'claude.ai Gmail', isOn: true, tokens: 500, tools: 1 },
    { name: 'figma', isOn: false, tokens: 0, tools: 1 },
  ])
})

test('the settings tab turns a feature off in the local file', async ($, on) => {
  const files = new Map<string, string>()
  stubFiles(on, files, new Map())
  on('settings.read', () => ({ value: {} }))
  await $.command.run({ command: 'bond-cockpit', args: 'settings', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 180 } })

  const ui = await $.ui.mount({ plugin: 'bond-cockpit', surface: 'terminal', ...PLUGINS_PANE, requestId: 'bond-cockpit-settings' })
  expect(await ui.find({ type: 'Text', text: 'Context features' })).toBeDefined()
  await ui.press({ key: 'feature:includeGitInstructions' })

  expect(JSON.parse(files.get('/repo/.claude/settings.local.json')!)).toEqual({ includeGitInstructions: false })
})
