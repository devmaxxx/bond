import type { Catalog, CatalogEntry } from '../types'

export type { Catalog, CatalogEntry }

// Plugin and skill profiles: each one a set of plugins and user skills to keep on, every other managed
// entry off, written to the project's `.claude/settings.local.json` so only this checkout changes.

export type Profile = {
  name: string
  summary: string
  plugins: readonly string[]
  skills: readonly string[]
}

export type SettingsObject = Record<string, unknown>

// bond, bond-cockpit and the built-ins stay as the user settings have them: no profile turns them off.
export const MANAGED_PLUGINS = [
  'superpowers@claude-plugins-official',
  'zerograph@zerograph',
  'atlassian@claude-plugins-official',
  'frontend-design@claude-plugins-official',
  'chrome-devtools-mcp@claude-plugins-official',
  'ui-ux-pro-max@ui-ux-pro-max-skill',
  'taste-skill@taste-skill',
  'claude-security@anthropic-plugin-directory',
  'skill-creator@claude-plugins-official',
  'claude-md-management@claude-plugins-official',
  // Off in every profile: bond's own commands and agents cover them, or the session does without.
  'code-review@claude-plugins-official',
  'feature-dev@claude-plugins-official',
  'stackwise@stackwise',
  'mongodb@claude-plugins-official',
  'context-mode@context-mode',
  'caveman@caveman',
  'andrej-karpathy-skills@karpathy-skills',
  'bond-hud@devmaxxx',
] as const

// User skills only: settings cannot hide a plugin's skills, the plugin itself goes off instead.
export const MANAGED_SKILLS = [
  'credential-handling',
  'captcha-ninja',
  'clean-architecture',
  'software-design-philosophy',
  'domain-driven-design',
  'property-based-testing',
  'writing-scope-briefs',
  'crafting-effective-readmes',
  'security-review',
  'emil-design-eng',
  'arch-tsdown',
  'orca-cli',
  'orca-computer-use',
  'orchestration',
  // Copies of bond's own code-review, differential-review and sharp-edges: off in every profile.
  'code-review-skill',
  'differential-review',
  'sharp-edges',
] as const

const DEV_PLUGINS = ['superpowers@claude-plugins-official', 'zerograph@zerograph']
const DEV_SKILLS = ['credential-handling', 'clean-architecture', 'software-design-philosophy', 'property-based-testing']
// The standing rules send every UI change through ui-ux-pro-max.
const FRONTEND_PLUGINS = [...DEV_PLUGINS, 'frontend-design@claude-plugins-official', 'chrome-devtools-mcp@claude-plugins-official', 'ui-ux-pro-max@ui-ux-pro-max-skill']

export const PROFILES: readonly Profile[] = [
  { name: 'minimal', summary: 'chat, docs, notes: no extra plugins', plugins: [], skills: ['credential-handling'] },
  { name: 'job-search', summary: 'applications and boards in Chrome', plugins: [], skills: ['credential-handling', 'captcha-ninja', 'writing-scope-briefs'] },
  { name: 'dev', summary: 'backend and full-stack code', plugins: DEV_PLUGINS, skills: DEV_SKILLS },
  { name: 'frontend', summary: 'UI code with a browser to check it', plugins: FRONTEND_PLUGINS, skills: [...DEV_SKILLS, 'emil-design-eng'] },
  {
    name: 'design',
    summary: 'visual design, styles, palettes',
    plugins: [...FRONTEND_PLUGINS, 'taste-skill@taste-skill'],
    skills: ['credential-handling', 'emil-design-eng'],
  },
  { name: 'architecture', summary: 'boundaries, modules, domain models', plugins: DEV_PLUGINS, skills: [...DEV_SKILLS, 'domain-driven-design', 'writing-scope-briefs'] },
  { name: 'review', summary: 'code and security review', plugins: ['zerograph@zerograph', 'claude-security@anthropic-plugin-directory'], skills: ['credential-handling', 'security-review', 'property-based-testing'] },
  { name: 'work', summary: 'Jira tickets in work repos', plugins: [...DEV_PLUGINS, 'atlassian@claude-plugins-official'], skills: DEV_SKILLS },
  {
    name: 'authoring',
    summary: 'plugins, skills, CLAUDE.md, READMEs',
    plugins: ['superpowers@claude-plugins-official', 'skill-creator@claude-plugins-official', 'claude-md-management@claude-plugins-official'],
    skills: ['credential-handling', 'crafting-effective-readmes', 'writing-scope-briefs', 'arch-tsdown'],
  },
]

export const RESET = 'reset'

export function findProfile(name: string, profiles: readonly Profile[] = PROFILES): Profile | undefined {
  return profiles.find(profile => profile.name === name)
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {}
}

// The cockpit drives the page it is drawn on, so no profile or toggle may turn it off.
export const PROTECTED = ['bond-cockpit@devmaxxx']

// Every entry some profile names is managed too, so a plugin added to one profile goes off in the others.
export function managed(profiles: readonly Profile[]): { plugins: string[]; skills: string[] } {
  const plugins = new Set<string>([...MANAGED_PLUGINS, ...profiles.flatMap(profile => profile.plugins)])
  const skills = new Set<string>([...MANAGED_SKILLS, ...profiles.flatMap(profile => profile.skills)])
  for (const id of PROTECTED) {
    plugins.delete(id)
  }

  return { plugins: [...plugins], skills: [...skills] }
}

// Keys outside the managed lists, and every other settings key, stay as the file has them; null clears them all.
export function applyProfile(settings: SettingsObject, profile: Profile | null, profiles: readonly Profile[] = PROFILES): SettingsObject {
  const plugins = asRecord(settings.enabledPlugins)
  const skills = asRecord(settings.skillOverrides)
  const held = managed(profiles)
  for (const id of held.plugins) {
    if (profile === null) {
      delete plugins[id]
    } else {
      plugins[id] = profile.plugins.includes(id)
    }
  }
  for (const name of held.skills) {
    if (profile === null) {
      delete skills[name]
    } else {
      skills[name] = profile.skills.includes(name) ? 'on' : 'off'
    }
  }
  const next: SettingsObject = { ...settings }
  setOrDrop(next, 'enabledPlugins', plugins)
  setOrDrop(next, 'skillOverrides', skills)

  return next
}

function setOrDrop(target: SettingsObject, key: string, value: Record<string, unknown>): void {
  if (Object.keys(value).length === 0) {
    delete target[key]
  } else {
    target[key] = value
  }
}

// The profile the file matches entry for entry; null when it was never set or was edited by hand since.
export function activeProfile(settings: SettingsObject, profiles: readonly Profile[] = PROFILES): string | null {
  const plugins = asRecord(settings.enabledPlugins)
  const skills = asRecord(settings.skillOverrides)
  const held = managed(profiles)
  const match = profiles.find(
    profile =>
      held.plugins.every(id => plugins[id] === profile.plugins.includes(id)) &&
      held.skills.every(name => skills[name] === (profile.skills.includes(name) ? 'on' : 'off')),
  )

  return match?.name ?? null
}

// Adds the entry to the profile or takes it out; the other profiles stay as they are.
export function editProfile(profiles: readonly Profile[], name: string, kind: 'plugin' | 'skill', id: string): Profile[] {
  return profiles.map(profile => {
    if (profile.name !== name || PROTECTED.includes(id)) {
      return profile
    }
    const key = kind === 'plugin' ? 'plugins' : 'skills'
    const held = profile[key]
    const next = held.includes(id) ? held.filter(entry => entry !== id) : [...held, id]

    return { ...profile, [key]: next }
  })
}

// $.store keeps the edited profiles; anything that is not a list of profiles falls back to the defaults.
export function storedProfiles(value: unknown): Profile[] {
  if (!Array.isArray(value)) {
    return [...PROFILES]
  }
  const valid = value.filter(
    (item): item is Profile =>
      typeof item === 'object' && item !== null && typeof item.name === 'string' && Array.isArray(item.plugins) && Array.isArray(item.skills),
  )

  return valid.length > 0 ? valid.map(item => ({ name: item.name, summary: String(item.summary ?? ''), plugins: item.plugins.map(String), skills: item.skills.map(String) })) : [...PROFILES]
}

export function profileLine(profile: Profile): string {
  const plugins = profile.plugins.map(id => id.split('@')[0]).join(', ') || 'none'

  return `${profile.name}: ${profile.summary} · plugins ${plugins} · ${profile.skills.length} skills`
}

export function parseSettings(text: string | null): SettingsObject {
  if (text === null || text.trim() === '') {
    return {}
  }
  const parsed: unknown = JSON.parse(text)

  return asRecord(parsed)
}

export type Uses = Record<string, number>


type ListedSkill = { name: string; source: string; pluginName?: string; tokens: number }
type ListedTool = { name: string; serverName: string; tokens: number }

// The settings hold no list of installed plugins, so the page lists the ones some settings file or profile names.
export function buildCatalog(
  merged: SettingsObject,
  local: SettingsObject,
  listed: { skills: readonly ListedSkill[]; tools: readonly ListedTool[] },
  uses: Uses,
  profiles: readonly Profile[] = PROFILES,
): Omit<Catalog, 'features' | 'servers' | 'descCap'> {
  const enabled = asRecord(merged.enabledPlugins)
  const overrides = asRecord(merged.skillOverrides)
  const held = managed(profiles)
  const plugins = [...new Set([...Object.keys(enabled), ...held.plugins, ...PROTECTED])]
    .sort()
    .map(id => {
      const name = id.split('@')[0] ?? id
      const skillTokens = sum(listed.skills.filter(skill => skill.pluginName === name).map(skill => skill.tokens))
      const toolTokens = sum(listed.tools.filter(tool => serverPlugin(tool.serverName) === name).map(tool => tool.tokens))

      return { kind: 'plugin' as const, id, label: name, isOn: enabled[id] === true, tokens: skillTokens + toolTokens, uses: uses[`plugin:${name}`] ?? 0 }
    })
  const own = listed.skills.filter(skill => skill.source === 'userSettings' || skill.source === 'projectSettings')
  const names = new Set([...own.map(skill => skill.name), ...Object.keys(overrides), ...held.skills])
  const skills = [...names].sort().map(name => {
    const state = overrides[name]

    return {
      kind: 'skill' as const,
      id: name,
      label: name,
      isOn: state === undefined || state === 'on' || state === 'name-only',
      tokens: own.find(skill => skill.name === name)?.tokens ?? 0,
      uses: uses[name] ?? 0,
    }
  })

  return {
    profile: activeProfile(local, profiles),
    plugins,
    skills,
    skillTokens: sum(listed.skills.map(skill => skill.tokens)),
    mcpTokens: sum(listed.tools.map(tool => tool.tokens)),
  }
}

// A plugin's MCP server is named `plugin:<plugin>:<server>`.
function serverPlugin(server: string): string | null {
  const match = /^plugin[:_]([a-z0-9-]+)[:_]/.exec(server)

  return match?.[1] ?? null
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

export function toggleEntry(local: SettingsObject, entry: CatalogEntry): SettingsObject {
  if (PROTECTED.includes(entry.id)) {
    return local
  }
  const key = entry.kind === 'plugin' ? 'enabledPlugins' : 'skillOverrides'
  const held = asRecord(local[key])
  held[entry.id] = entry.kind === 'plugin' ? !entry.isOn : entry.isOn ? 'off' : 'on'

  return { ...local, [key]: held }
}

// A Skill call counts for the skill, and a plugin's skill or MCP tool for its plugin too.
export function countUse(uses: Uses, tool: string, args: Record<string, unknown>): Uses | null {
  if (tool === 'Skill') {
    const skill = String(args.skill ?? '').replace(/^\//, '')
    if (skill === '') {
      return null
    }
    const [plugin, name] = skill.includes(':') ? skill.split(':', 2) : [null, skill]
    const next = { ...uses, [name ?? skill]: (uses[name ?? skill] ?? 0) + 1 }

    return plugin === null ? next : { ...next, [`plugin:${plugin}`]: (next[`plugin:${plugin}`] ?? 0) + 1 }
  }
  const mcp = /^mcp__plugin_([a-z0-9-]+)_/.exec(tool)
  if (mcp === null) {
    return null
  }
  const key = `plugin:${mcp[1]}`

  return { ...uses, [key]: (uses[key] ?? 0) + 1 }
}

export function formatTokens(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens)
}
