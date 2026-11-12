import type { EngineInterface, RenderElement } from 'claude-code'

import { DESC_STEPS, nextDescCap, toggleFeature, toggleServer } from './features'
import type { Ui } from './pane'
import { readLocal, refreshCatalog, writeLocal } from './plugins-page'
import { formatTokens } from './profiles'
import type { Catalog, SettingsObject } from './profiles'

export const SETTINGS_PANE = 'bond-cockpit-settings'
export const SETTINGS_TITLE = 'settings'
const NAME_COLUMNS = 26

async function change($: EngineInterface, edit: (local: SettingsObject) => SettingsObject, note: string): Promise<void> {
  const { path, settings } = await readLocal($)
  await writeLocal($, path, edit(settings))
  await refreshCatalog($)
  $.ui.toast(`bond cockpit: ${note}; the settings reload now, a few keys wait for the next session`)
}

export function renderSettings($: EngineInterface, ui: Ui, shown: Catalog | null, columns: number): RenderElement {
  const { Box, Text, Button } = ui
  if (shown === null) {
    void refreshCatalog($).catch(() => undefined)
    return <Text dimColor>reading settings…</Text>
  }
  const width = Math.max(30, columns - 2)
  const line = (isOn: boolean, label: string, stats: string) => `${isOn ? '●' : '○'} ${label.slice(0, NAME_COLUMNS).padEnd(NAME_COLUMNS)} ${stats}`.slice(0, width)
  const cost = (tokens: number) => (tokens > 0 ? formatTokens(tokens) : '–')
  const total = shown.features.reduce((sum, row) => sum + (row.isOn ? row.tokens : 0), 0) + shown.servers.reduce((sum, row) => sum + (row.isOn ? row.tokens : 0), 0)
  const cap = shown.descCap
  const nextCap = DESC_STEPS[(DESC_STEPS.indexOf(cap) + 1) % DESC_STEPS.length] ?? null

  return (
    <Box flexDirection="column">
      <Text bold>Context features</Text>
      <Text dimColor wrap="truncate-end">{`on now: ${formatTokens(total)} tok measured · skills ${formatTokens(shown.skillTokens)} · MCP ${formatTokens(shown.mcpTokens)}`}</Text>
      {shown.features.map(row => (
        <Button key={`feature:${row.key}`} plain label={`toggle ${row.label}`} onPress={() => void change($, local => toggleFeature(local, row.key, row.isOn), `${row.label} ${row.isOn ? 'off' : 'on'}`).catch(() => undefined)}>
          <Text dimColor={!row.isOn}>{line(row.isOn, row.label, cost(row.tokens))}</Text>
        </Button>
      ))}
      <Button key="desc-cap" plain label="skill description cap" onPress={() => void change($, nextDescCap, `skill descriptions ${nextCap === null ? 'uncapped' : `capped at ${nextCap} chars`}`).catch(() => undefined)}>
        <Text>{line(cap === null, 'skill descriptions', cap === null ? 'full' : `≤${cap} chars`)}</Text>
      </Button>
      <Text bold>{`MCP servers (${shown.servers.filter(row => row.isOn).length}/${shown.servers.length} on)`}</Text>
      {shown.servers.length === 0 ? <Text dimColor>none listed</Text> : null}
      {shown.servers.map(row => (
        <Button key={`server:${row.name}`} plain label={`toggle ${row.name}`} onPress={() => void change($, local => toggleServer(local, row.name, row.isOn), `${row.name} ${row.isOn ? 'denied' : 'allowed'}`).catch(() => undefined)}>
          <Text dimColor={!row.isOn}>{line(row.isOn, row.name, `${cost(row.tokens)} · ${row.tools} tools`)}</Text>
        </Button>
      ))}
      <Text dimColor wrap="wrap">Writes this checkout's .claude/settings.local.json. tokens: what is loaded into every request; deferred MCP tools cost only their name.</Text>
    </Box>
  )
}
