import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement } from 'claude-code'

import { DESC_KEY, featureRows, serverRows } from './features'
import type { Ui } from './pane'
import {
  PROTECTED,
  RESET,
  applyProfile,
  buildCatalog,
  countUse,
  editProfile,
  findProfile,
  formatTokens,
  parseSettings,
  profileLine,
  storedProfiles,
  toggleEntry,
} from './profiles'
import type { Catalog, CatalogEntry, Profile, SettingsObject, Uses } from './profiles'

export const PLUGINS_PANE = 'bond-cockpit-plugins'
export const PLUGINS_TITLE = 'plugins'
// $.store keys: the edited profiles and the use counts both outlive the session.
const PROFILES_KEY = 'profiles'
const USES_KEY = 'uses'
const LOCAL_SETTINGS = '.claude/settings.local.json'
const NAME_COLUMNS = 24
const RELOAD = '/reload-plugins'

const catalog = atom({ plugin: 'bond-cockpit', key: 'catalog' } as const, null)
// The profile the page edits; null while toggles change this checkout's settings directly.
const editing = atom({ plugin: 'bond-cockpit', key: 'editing' } as const, null)

export async function loadProfiles($: EngineInterface): Promise<Profile[]> {
  return storedProfiles(await $.store.get(PROFILES_KEY).catch(() => undefined))
}

// The local file sits at the main checkout's root, which a worktree or a subdirectory shares.
async function localPath($: EngineInterface): Promise<string> {
  const ran = await $.process.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir']).catch(() => null)
  const dir = ran !== null && ran.exitCode === 0 ? ran.stdout.trim() : ''

  return dir.endsWith('/.git') ? `${dir.slice(0, -'/.git'.length)}/${LOCAL_SETTINGS}` : LOCAL_SETTINGS
}

export async function readLocal($: EngineInterface): Promise<{ path: string; settings: SettingsObject }> {
  const path = await localPath($)
  const text = await $.fs.read(path).catch(() => null)

  return { path, settings: parseSettings(typeof text === 'string' ? text : null) }
}

export async function writeLocal($: EngineInterface, path: string, settings: SettingsObject): Promise<void> {
  await $.fs.write(path, `${JSON.stringify(settings, null, 2)}\n`)
}

export async function refreshCatalog($: EngineInterface): Promise<void> {
  const [merged, { settings }, measured, uses, profiles] = await Promise.all([
    $.settings.read().catch(() => ({})),
    readLocal($),
    $.session.usage({ breakdown: 'summary' }).catch(() => null),
    $.store.get(USES_KEY).catch(() => undefined),
    loadProfiles($),
  ])
  const breakdown = measured?.context.breakdown
  const listed = {
    skills: (breakdown?.skills?.skillFrontmatter ?? []).map(skill => ({ name: skill.name, source: String(skill.source), pluginName: skill.pluginName, tokens: skill.tokens })),
    tools: (breakdown?.mcpTools ?? []).map(tool => ({ name: tool.name, serverName: tool.serverName, tokens: tool.tokens, isLoaded: tool.isLoaded })),
  }
  const all = merged as SettingsObject
  const next: Catalog = {
    ...buildCatalog(all, settings, listed, asUses(uses), profiles),
    features: featureRows(all, listed),
    servers: serverRows(all, listed.tools),
    descCap: typeof all[DESC_KEY] === 'number' ? (all[DESC_KEY] as number) : null,
  }
  await update($, catalog, () => next)
}

function asUses(value: unknown): Uses {
  return typeof value === 'object' && value !== null ? (value as Uses) : {}
}

export async function isCatalogShown($: EngineInterface): Promise<boolean> {
  return (await read($, catalog)) !== null
}

export async function recordUse($: EngineInterface, tool: string, args: Record<string, unknown>): Promise<void> {
  if (tool !== 'Skill' && !tool.startsWith('mcp__plugin_')) {
    return
  }
  const next = countUse(asUses(await $.store.get(USES_KEY).catch(() => undefined)), tool, args)
  if (next !== null) {
    await $.store.set(USES_KEY, next)
  }
}

/** Applies a profile by name, or with `reset` hands every managed entry back to the user settings. */
export async function applyNamed($: EngineInterface, name: string): Promise<string> {
  const profiles = await loadProfiles($)
  const profile = name === RESET ? null : findProfile(name, profiles)
  if (profile === undefined) {
    return `bond cockpit: no profile "${name}". Profiles: ${profiles.map(entry => entry.name).join(', ')}, ${RESET}.`
  }
  const { path, settings } = await readLocal($)
  await writeLocal($, path, applyProfile(settings, profile, profiles))
  await refreshCatalog($)
  await offerReload($)

  return profile === null ? `bond cockpit: profile reset in ${path}; ${RELOAD} applies it.` : `bond cockpit: profile ${profile.name} written to ${path}; ${RELOAD} applies it.`
}

export async function listProfiles($: EngineInterface): Promise<string> {
  const [profiles, { settings }] = await Promise.all([loadProfiles($), readLocal($)])
  const active = buildCatalog({}, settings, { skills: [], tools: [] }, {}, profiles).profile

  return [`active: ${active ?? 'none (user settings or hand-edited)'}`, ...profiles.map(profileLine)].join('\n')
}

async function offerReload($: EngineInterface): Promise<void> {
  const filled = await $.prompt.fill({ text: RELOAD }).catch(() => null)
  $.ui.toast(filled?.isFilled === true ? `bond cockpit: Enter runs ${RELOAD}` : `bond cockpit: run ${RELOAD} to apply`)
}

async function press($: EngineInterface, entry: CatalogEntry): Promise<void> {
  const edited = await read($, editing)
  if (edited === null) {
    const { path, settings } = await readLocal($)
    await writeLocal($, path, toggleEntry(settings, entry))
    await refreshCatalog($)
    await offerReload($)
    return
  }
  const profiles = editProfile(await loadProfiles($), edited, entry.kind, entry.id)
  await $.store.set(PROFILES_KEY, profiles)
  // The active profile edited is written again, so the checkout follows what the page shows.
  const shown = await read($, catalog)
  if (shown?.profile === edited) {
    const { path, settings } = await readLocal($)
    await writeLocal($, path, applyProfile(settings, findProfile(edited, profiles) ?? null, profiles))
    await offerReload($)
  }
  await refreshCatalog($)
}

async function restoreDefaults($: EngineInterface): Promise<void> {
  await $.store.set(PROFILES_KEY, null)
  await update($, editing, () => null)
  await refreshCatalog($)
}

export async function renderPage($: EngineInterface, ui: Ui, columns: number): Promise<RenderElement> {
  const [shown, edited, profiles] = await Promise.all([read($, catalog), read($, editing), loadProfiles($)])
  const { Box, Text, Button } = ui
  if (shown === null) {
    void refreshCatalog($).catch(() => undefined)
    return <Text dimColor>reading plugins and skills…</Text>
  }
  const target = edited === null ? null : findProfile(edited, profiles) ?? null
  const isOn = (entry: CatalogEntry) => (target === null ? entry.isOn : (entry.kind === 'plugin' ? target.plugins : target.skills).includes(entry.id))
  const width = Math.max(30, columns - 2)
  const row = (entry: CatalogEntry) => {
    const lock = PROTECTED.includes(entry.id)
    const mark = lock ? '◆' : isOn(entry) ? '●' : '○'
    const stats = `${entry.tokens > 0 ? formatTokens(entry.tokens) : '–'} · ${entry.uses}×`
    const label = `${mark} ${entry.label.slice(0, NAME_COLUMNS).padEnd(NAME_COLUMNS)} ${stats}`.slice(0, width)

    return lock ? (
      <Text key={`${entry.kind}:${entry.id}`} dimColor>{label}</Text>
    ) : (
      <Button key={`${entry.kind}:${entry.id}`} plain label={`toggle ${entry.label}`} onPress={() => void press($, entry).catch(() => undefined)}>
        <Text dimColor={!isOn(entry)}>{label}</Text>
      </Button>
    )
  }

  return (
    <Box flexDirection="column">
      <Text bold>Profiles</Text>
      <Text dimColor wrap="truncate-end">{`active: ${shown.profile ?? 'none'} · skills ${formatTokens(shown.skillTokens)} · MCP ${formatTokens(shown.mcpTokens)} tok`}</Text>
      {profiles.map(profile => (
        <Box key={`profile:${profile.name}`} flexDirection="row" gap={1}>
          <Button key={`apply:${profile.name}`} plain label={`apply ${profile.name}`} onPress={() => void applyNamed($, profile.name).catch(() => undefined)}>
            <Text bold={shown.profile === profile.name}>{`${shown.profile === profile.name ? '▶' : ' '} ${profile.name.padEnd(13)}`}</Text>
          </Button>
          <Button key={`edit:${profile.name}`} plain label={`edit ${profile.name}`} onPress={() => void update($, editing, current => (current === profile.name ? null : profile.name)).catch(() => undefined)}>
            <Text color={edited === profile.name ? 'warning' : undefined} dimColor={edited !== profile.name}>{edited === profile.name ? '✎ editing' : '✎'}</Text>
          </Button>
          <Text dimColor wrap="truncate-end">{profile.summary}</Text>
        </Box>
      ))}
      <Box flexDirection="row" gap={2}>
        <Button key="reset" label="reset" onPress={() => void applyNamed($, RESET).catch(() => undefined)} />
        <Button key="reload" label="reload plugins" onPress={() => void offerReload($).catch(() => undefined)} />
        <Button key="defaults" label="default profiles" dimColor onPress={() => void restoreDefaults($).catch(() => undefined)} />
      </Box>
      <Text color={edited === null ? undefined : 'warning'} dimColor={edited === null} wrap="wrap">
        {edited === null ? 'Toggles change this checkout only (.claude/settings.local.json).' : `Toggles change the profile ${edited}; ✎ again to stop.`}
      </Text>
      <Text bold>{`Plugins (${shown.plugins.filter(isOn).length}/${shown.plugins.length} on)`}</Text>
      {shown.plugins.map(row)}
      <Text bold>{`Skills (${shown.skills.filter(isOn).length}/${shown.skills.length} on)`}</Text>
      {shown.skills.map(row)}
      <Text dimColor wrap="wrap">tokens: what each adds to every request · uses: Skill and MCP calls, all sessions</Text>
    </Box>
  )
}

export type { Catalog }
