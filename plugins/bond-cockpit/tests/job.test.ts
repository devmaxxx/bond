import { expect, test } from 'claude-code/testing'

import type { CacheSnapshot, UsageSnapshot } from '../types'
import { EMPTY_JOB, agentSpawned, elapsed, endJob, isBusy, jobCard, loopEnded, startJob, testRun, toolAsked, toolEnded, toolLabel, toolStarted, workflowLaunched } from '../hooks/job'
import { summaryCard } from '../hooks/summary'

const NOW = Date.parse('2026-10-12T12:00:00Z')

test('no job card before the first turn', () => {
  expect(jobCard(EMPTY_JOB, [], NOW)).toBe(null)
})

test('a running job names its task, the tool in flight and how long it has run', () => {
  let job = startJob(EMPTY_JOB, 'improve the batch workflow\nmore detail', NOW)
  job = toolStarted(job, 't1', 'Bash', { command: 'node --test', description: 'Run bond tests' }, undefined, NOW + 5_000)
  const card = jobCard(job, [], NOW + 65_000)

  expect(card?.status).toBe('● working')
  expect(card?.badge).toBe('1m05s')
  expect(card?.rows[0]).toEqual({ kind: 'note', text: 'improve the batch workflow', tone: 'plain' })
  expect(card?.rows[1]).toEqual({ kind: 'pair', label: 'now', value: '1m00s', note: 'Bash Run bond tests', tone: 'ok' })
})

test('a call the permission check asked about reads as waiting for approval', () => {
  let job = startJob(EMPTY_JOB, 'task', NOW)
  job = toolStarted(job, 't1', 'Bash', { description: 'Push branch' }, undefined, NOW)
  job = toolAsked(job, 't1')

  expect(jobCard(job, [], NOW + 45_000)?.rows[1]).toEqual({ kind: 'pair', label: 'now', value: '45s', note: 'approve? Bash Push branch', tone: 'warn' })
})

test('a finished tool leaves the in-flight list and shows as the last one; a failure is counted', () => {
  let job = startJob(EMPTY_JOB, 'task', NOW)
  job = toolStarted(job, 't1', 'Read', { file_path: '/repo/src/a.ts' }, undefined, NOW)
  job = toolEnded(job, 't1', true, undefined)
  const card = jobCard(job, [], NOW + 1_000)

  expect(job.inFlight).toEqual([])
  expect(card?.rows[1]).toEqual({ kind: 'pair', label: 'now', value: '', note: 'thinking', tone: 'plain' })
  expect(card?.rows[2]).toEqual({ kind: 'pair', label: 'tools', value: '1', note: '1 failed · last Read a.ts', tone: 'warn' })
})

test('an ended job is idle and says how long it took', () => {
  const job = endJob(startJob(EMPTY_JOB, 'task', NOW), NOW + 90_000)
  const card = jobCard(job, [], NOW + 100_000)

  expect(card?.status).toBe('○ idle')
  expect(card?.badge).toBe('took 1m30s')
  expect(card?.rows[1]).toEqual({ kind: 'pair', label: 'now', value: '', note: 'waiting for you', tone: 'dim' })
})

test('a turn the engine starts for a delivery continues the job instead of replacing it', () => {
  let job = startJob(EMPTY_JOB, 'fix the bug', NOW)
  job = toolStarted(job, 't1', 'Bash', { description: 'Run tests' }, undefined, NOW + 1_000)
  job = startJob(job, '<task-notification>\n<task-id>x</task-id>', NOW + 2_000)

  expect(job.task).toBe('fix the bug')
  expect(job.tools).toBe(1)
  expect(job.inFlight.map(call => call.label)).toEqual(['Bash Run tests'])
})

test('a workflow counts the agents its script spawns, names them and shows their tests', () => {
  let job = startJob(EMPTY_JOB, 'task', NOW)
  job = toolStarted(job, 'w', 'Workflow', {}, undefined, NOW)
  job = workflowLaunched(toolEnded(job, 'w', false, undefined), 'batch-build', 'wf_36953d3d')
  job = agentSpawned(job, 'a1', 'implement:A', 'claude-opus-5-5', 'wf_36953d3d', NOW)
  job = agentSpawned(job, 'b1', 'implement:B', 'claude-opus-5-5', 'wf_36953d3d', NOW)
  job = agentSpawned(job, 'sub', 'review', 'claude-haiku-5-5', undefined, NOW)
  job = toolStarted(job, 't1', 'Bash', { command: 'pnpm exec vitest run' }, 'a1', NOW + 1_000)
  job = toolEnded(job, 't1', false, 'a1', testRun('cd /w && pnpm exec vitest run', 'Tests  2 failed | 44 passed (46)'))
  job = toolStarted(job, 't2', 'Bash', { command: 'git push -u origin x' }, 'b1', NOW + 2_000)
  job = loopEnded(job, 'sub', NOW + 3_000)
  const rows = jobCard(job, [], NOW + 64_000)?.rows ?? []
  const lines = rows.flatMap(row => (row.kind === 'line' ? [row.text] : []))

  expect(rows).toContainEqual({ kind: 'gauge', label: 'workflow', value: '0/2', ratio: 0, note: '1m04s', tone: 'ok' })
  expect(rows).toContainEqual({ kind: 'section', title: 'agents 2 working · 1 red', tone: 'dim' })
  expect(lines).toEqual([
    'batch-build · wf_36953d3d',
    '● implement:B · opus · 1 calls · 1m04s',
    '  Bash git push -u origin x',
    '  ran git push / gh pr',
    '● implement:A · opus · 1 calls · 1m04s',
    '  Bash pnpm exec vitest run · vitest 44✓ 2✗',
    '✓ review · haiku · 0 calls · done 1m01s ago',
    '  –',
  ])
})

test('a test run is read only from a runner command, by the counts it printed last', () => {
  expect(testRun('node --test tests/*.test.mjs', '# pass 476\n# fail 0')).toEqual({ pass: 476, fail: 0, label: 'node --test' })
  expect(testRun('pnpm exec tsc --noEmit', 'Found 3 errors in 2 files.')).toEqual({ pass: null, fail: 3, label: 'tsc' })
  expect(testRun("python3 - <<'EOF'\nrun('vitest')", '1 failed')).toBe(null)
  expect(testRun('pnpm exec vitest run', 'no output')).toBe(null)
})

test('the workflow count survives its agents dropping off the list', () => {
  let job = startJob(EMPTY_JOB, 'task', NOW)
  job = toolStarted(job, 'w', 'Workflow', {}, undefined, NOW)
  for (const id of ['a', 'b', 'c', 'd']) {
    job = loopEnded(agentSpawned(job, id, id, 'opus', 'wf_x', NOW), id, NOW)
  }
  job = agentSpawned(job, 'e', 'e', 'opus', 'wf_x', NOW + 6 * 60_000)
  const rows = jobCard(job, [], NOW + 7 * 60_000)?.rows ?? []

  expect(rows).toContainEqual({ kind: 'gauge', label: 'workflow', value: '4/5', ratio: 0.8, note: '7m00s', tone: 'ok' })
})

test('a loop that never reports its end goes quiet, stops the redraws, then drops off', () => {
  const job = toolStarted(startJob(EMPTY_JOB, 'task', NOW), 'f', 'Read', { file_path: '/a.ts' }, 'fork1', NOW)

  expect(isBusy(job, NOW + 10_000)).toBe(true)
  expect(isBusy(job, NOW + 3 * 60_000)).toBe(false)
  expect(jobCard(job, [], NOW + 3 * 60_000)?.rows).toContainEqual({ kind: 'line', text: '● #fork1 · 1 calls · quiet 3m00s', tone: 'dim' })
  expect(jobCard(job, [], NOW + 6 * 60_000)?.rows.some(row => row.kind === 'section')).toBe(false)
})

test('a new prompt restarts the counts but keeps agents still listed', () => {
  let job = startJob(EMPTY_JOB, 'first', NOW)
  job = toolStarted(job, 'a1', 'Bash', { command: 'ls' }, 'bg', NOW)
  job = startJob(job, 'second', NOW + 1_000)

  expect(job.task).toBe('second')
  expect(job.tools).toBe(0)
  expect(Object.keys(job.loops)).toEqual(['bg'])
})

test('the short page keeps the job, the cache and only the gauges that matter', () => {
  let job = startJob(EMPTY_JOB, 'ship it', NOW)
  job = toolStarted(job, 't1', 'Edit', { file_path: '/a/b.ts' }, undefined, NOW)
  const cache: CacheSnapshot = { read: 900, wrote: 0, fresh: 100, at: NOW, ttlMs: 3_600_000, ttlSource: 'plan' }
  const usage: UsageSnapshot = {
    rateLimits: [
      { kind: 'five_hour', percentUsed: 40 },
      { kind: 'seven_day', percentUsed: 20 },
      { kind: 'spend_limit', percentUsed: 80 },
    ],
    contextPercent: 30,
    contextWindow: 200_000,
    costUsd: 1.5,
  }
  const card = summaryCard(job, cache, usage, NOW + 10_000, 10_000)
  const labels = card.rows.flatMap(row => ('label' in row ? [row.label] : []))

  expect(card.title).toBe('Cockpit')
  expect(card.badge).toBe('10s · $1.50')
  expect(labels).toEqual(['now', 'cache', '5h', 'spend', 'context'])
})

test('tool labels name what the call works on', () => {
  expect(toolLabel('Edit', { file_path: '/a/b/c.tsx' })).toBe('Edit c.tsx')
  expect(toolLabel('WebFetch', { url: 'https://docs.example.com/x' })).toBe('WebFetch docs.example.com')
  expect(toolLabel('Agent', { description: 'Run tests' })).toBe('Agent Run tests')
  expect(toolLabel('TodoWrite', {})).toBe('TodoWrite')
})

test('elapsed reads in seconds, minutes, then hours', () => {
  expect(elapsed(9_500)).toBe('9s')
  expect(elapsed(125_000)).toBe('2m05s')
  expect(elapsed(3_660_000)).toBe('1h01m')
})
