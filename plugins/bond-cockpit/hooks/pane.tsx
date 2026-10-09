import type { EngineInterface, RenderElement } from 'claude-code'

import { hitTone } from './cache'
import type { Card, Row, Segment, Tone } from './cache'

export type Ui = ReturnType<EngineInterface['ui']['resolve']>

const TONE_PROPS: Record<Tone, { bold?: boolean; dimColor?: boolean; color?: string }> = {
  heading: { bold: true },
  plain: {},
  dim: { dimColor: true },
  ok: { color: 'success' },
  bad: { color: 'error' },
  warn: { color: 'warning' },
}
// Only a card whose state matters wears colour; the rest sit back in the theme's subtle grey.
const BORDER_COLOR: Record<Tone, string> = {
  heading: 'subtle',
  plain: 'subtle',
  dim: 'inactive',
  ok: 'success',
  bad: 'error',
  warn: 'warning',
}
const FILLED = '━'
const EMPTY = '─'
const SPARK = '▁▂▃▄▅▆▇█'
// Border and one column of padding on each side.
const CARD_CHROME = 4
const LABEL_COLUMNS = 9
const VALUE_COLUMNS = 6
const HIT_COLUMNS = 9
const MIN_VISIBLE_SHARE = 0.01

/** `columns` is the pane body's width; bars stretch to fill whatever the card has. */
export function drawCards(ui: Ui, cards: readonly Card[], columns: number): RenderElement {
  const inner = Math.max(20, columns - CARD_CHROME)

  return <ui.Box flexDirection="column">{cards.map(card => drawCard(ui, card, inner))}</ui.Box>
}

function drawCard(ui: Ui, card: Card, inner: number): RenderElement {
  const { Box, Text } = ui

  return (
    <Box key={`card-${card.title}`} flexDirection="column" borderStyle="round" borderColor={BORDER_COLOR[card.tone]} paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Box flexDirection="row" gap={2}>
          <Text bold>{card.title}</Text>
          <Text {...TONE_PROPS[card.tone]}>{card.status}</Text>
        </Box>
        <Text dimColor>{card.badge}</Text>
      </Box>
      {card.rows.map((row, index) => drawRow(ui, row, `${card.title}-${index}`, inner))}
    </Box>
  )
}

function drawRow(ui: Ui, row: Row, key: string, inner: number): RenderElement {
  const { Box, Text } = ui
  const tone = TONE_PROPS[row.tone]
  switch (row.kind) {
    case 'split':
      return (
        <Box key={key} flexDirection="column" marginBottom={1}>
          <Box flexDirection="row">
            <Box width={HIT_COLUMNS}>
              <Text bold {...tone}>{`${row.hit}%`}</Text>
              <Text dimColor> hit</Text>
            </Box>
            {segmentBar(ui, row.segments, inner - HIT_COLUMNS)}
          </Box>
          <Box flexDirection="row" gap={2}>
            {row.segments.map(segment => (
              <Text key={segment.label}>
                <Text {...TONE_PROPS[segment.tone]}>● </Text>
                <Text dimColor>{`${segment.label} `}</Text>
                <Text>{segment.value}</Text>
              </Text>
            ))}
          </Box>
        </Box>
      )
    case 'meter': {
      // ⏱ draws two columns wide in most terminals while counting as one character.
      const cells = Math.max(4, inner - row.label.length - 2)
      const filled = Math.round(Math.min(1, Math.max(0, row.ratio)) * cells)
      return (
        <Box key={key} flexDirection="row" gap={1}>
          <Text {...tone}>{row.label}</Text>
          <Text>
            <Text {...tone}>{FILLED.repeat(filled)}</Text>
            <Text dimColor>{EMPTY.repeat(cells - filled)}</Text>
          </Text>
        </Box>
      )
    }
    case 'trend':
      return (
        <Box key={key} flexDirection="row">
          {labelValue(ui, row.label, row.value, row.tone)}
          <Box marginLeft={2}>
            <Text>
              {row.hits.map((hit, index) => (
                <Text key={String(index)} {...TONE_PROPS[hitTone(hit)]}>{SPARK[Math.min(SPARK.length - 1, Math.floor((hit / 100) * SPARK.length))]}</Text>
              ))}
            </Text>
          </Box>
        </Box>
      )
    case 'pair':
      return (
        <Box key={key} flexDirection="row">
          {labelValue(ui, row.label, row.value, row.tone)}
          <Box marginLeft={2} flexGrow={1}>
            <Text dimColor wrap="truncate-end">{row.note}</Text>
          </Box>
        </Box>
      )
    case 'note':
      return (
        <Box key={key} marginTop={1}>
          <Text wrap="truncate-end" {...tone}>{row.text}</Text>
        </Box>
      )
  }
}

function labelValue({ Box, Text }: Ui, label: string, value: string, tone: Tone): RenderElement {
  return (
    <Box flexDirection="row">
      <Box width={LABEL_COLUMNS}>
        <Text dimColor>{label}</Text>
      </Box>
      <Box width={VALUE_COLUMNS} justifyContent="flex-end">
        <Text bold {...TONE_PROPS[tone]}>{value}</Text>
      </Box>
    </Box>
  )
}

// One bar, each segment in its own colour, so the hit rate and the token split read as one picture.
function segmentBar({ Text }: Ui, segments: readonly Segment[], cells: number): RenderElement {
  const widths = allocate(segments.map(segment => segment.share), Math.max(4, cells))

  return (
    <Text>
      {segments.map((segment, index) => (
        <Text key={segment.label} {...TONE_PROPS[segment.tone]}>{FILLED.repeat(widths[index] ?? 0)}</Text>
      ))}
    </Text>
  )
}

// Largest remainder; a share of 1% or more always gets a cell, so a 4% write still shows.
function allocate(shares: readonly number[], cells: number): number[] {
  const total = shares.reduce((sum, share) => sum + share, 0)
  if (total <= 0) {
    return shares.map(() => 0)
  }
  const exact = shares.map(share => (share / total) * cells)
  const widths = exact.map((value, index) => ((shares[index] ?? 0) / total >= MIN_VISIBLE_SHARE ? Math.max(1, Math.floor(value)) : Math.floor(value)))
  const order = exact.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest)
  let spare = cells - widths.reduce((sum, width) => sum + width, 0)
  for (const { index } of order) {
    if (spare <= 0) {
      break
    }
    widths[index] = (widths[index] ?? 0) + 1
    spare -= 1
  }
  while (spare < 0) {
    const widest = widths.indexOf(Math.max(...widths))
    widths[widest] = (widths[widest] ?? 0) - 1
    spare += 1
  }

  return widths
}
