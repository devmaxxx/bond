// Built-in features that add to every request, as settings keys this checkout's local file can turn off.
import type { FeatureRow, ServerRow } from '../types'

export type { FeatureRow, ServerRow }

type SettingsObject = Record<string, unknown>

export type Feature = {
  key: string
  label: string
  // The value that turns the feature off, and the one that turns it back on over a lower file.
  off: unknown
  on: unknown
  // A restrictive value from any file wins for this key, so turning it on can only drop the local value.
  isSticky?: boolean
  // Which part of the listing it costs: skills by source, or MCP servers by name prefix.
  skillSource?: string
  serverPrefix?: string
}

export const FEATURES: readonly Feature[] = [
  { key: 'includeGitInstructions', label: 'git and PR instructions', off: false, on: true },
  { key: 'enableArtifact', label: 'Artifact tool', off: false, on: true, isSticky: true },
  { key: 'disableBundledSkills', label: 'bundled skills, workflows', off: true, on: false, skillSource: 'built-in' },
  { key: 'syncClaudeAiSkills', label: 'claude.ai skills', off: false, on: true, skillSource: 'syncedSkills' },
  { key: 'syncClaudeAiPlugins', label: 'claude.ai plugins', off: false, on: true },
  { key: 'disableClaudeAiConnectors', label: 'claude.ai connectors', off: true, on: false, isSticky: true, serverPrefix: 'claude.ai' },
  { key: 'autoMemoryEnabled', label: 'auto memory', off: false, on: true },
  { key: 'enableWorkflows', label: 'workflows', off: false, on: true },
]

export const DESC_KEY = 'skillListingMaxDescChars'
// Cycled by the page: the engine's own cap, then shorter ones.
export const DESC_STEPS: readonly (number | null)[] = [null, 160, 80]

type ListedSkill = { source: string; tokens: number }
type ListedTool = { serverName: string; tokens: number; isLoaded: boolean }

export function featureRows(merged: SettingsObject, listed: { skills: readonly ListedSkill[]; tools: readonly ListedTool[] }): FeatureRow[] {
  return FEATURES.map(feature => {
    const skillTokens = feature.skillSource === undefined ? 0 : sumOf(listed.skills.filter(skill => skill.source === feature.skillSource))
    const toolTokens = feature.serverPrefix === undefined ? 0 : sumOf(listed.tools.filter(tool => tool.isLoaded && tool.serverName.startsWith(feature.serverPrefix!)))

    return { key: feature.key, label: feature.label, isOn: merged[feature.key] !== feature.off, tokens: skillTokens + toolTokens }
  })
}

// Every MCP server the listing names, the claude.ai connectors among them, with what its loaded tools cost.
export function serverRows(merged: SettingsObject, tools: readonly ListedTool[]): ServerRow[] {
  const denied = deniedNames(merged.deniedMcpServers)
  const names = [...new Set([...tools.map(tool => tool.serverName), ...denied])].sort()

  return names.map(name => {
    const own = tools.filter(tool => tool.serverName === name)

    return { name, isOn: !denied.includes(name), tokens: sumOf(own.filter(tool => tool.isLoaded)), tools: own.length }
  })
}

function sumOf(entries: readonly { tokens: number }[]): number {
  return entries.reduce((total, entry) => total + entry.tokens, 0)
}

function deniedNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap(entry => (typeof entry === 'object' && entry !== null && typeof (entry as { serverName?: unknown }).serverName === 'string' ? [(entry as { serverName: string }).serverName] : []))
}

export function toggleFeature(local: SettingsObject, key: string, isOn: boolean): SettingsObject {
  const feature = FEATURES.find(entry => entry.key === key)
  if (feature === undefined) {
    return local
  }
  const next = { ...local }
  if (isOn) {
    next[key] = feature.off
  } else if (feature.isSticky === true) {
    delete next[key]
  } else {
    next[key] = feature.on
  }

  return next
}

// Lists merge across files, so this only adds or drops the local deny; a deny in another file stays.
export function toggleServer(local: SettingsObject, name: string, isOn: boolean): SettingsObject {
  const held = Array.isArray(local.deniedMcpServers) ? (local.deniedMcpServers as unknown[]) : []
  const rest = held.filter(entry => (entry as { serverName?: unknown } | null)?.serverName !== name)
  const next = { ...local, deniedMcpServers: isOn ? [...rest, { serverName: name }] : rest }
  if (next.deniedMcpServers.length === 0) {
    delete (next as SettingsObject).deniedMcpServers
  }

  return next
}

export function nextDescCap(local: SettingsObject): SettingsObject {
  const current = typeof local[DESC_KEY] === 'number' ? (local[DESC_KEY] as number) : null
  const at = DESC_STEPS.indexOf(current)
  const step = DESC_STEPS[(at + 1) % DESC_STEPS.length] ?? null
  const next = { ...local }
  if (step === null) {
    delete next[DESC_KEY]
  } else {
    next[DESC_KEY] = step
  }

  return next
}
