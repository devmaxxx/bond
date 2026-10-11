import { expect, test } from 'claude-code/testing'

import { EMPTY_JOB, elapsed, endJob, jobCard, loopEnded, startJob, toolEnded, toolLabel, toolStarted } from '../hooks/job'

const NOW = Date.parse('2026-10-12T12:00:00Z')

test('no job card before the first prompt', () => {
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

test('a finished tool leaves the in-flight list and shows as the last one; a failure is counted', () => {
  let job = startJob(EMPTY_JOB, 'task', NOW)
  job = toolStarted(job, 't1', 'Read', { file_path: '/repo/src/a.ts' }, undefined, NOW)
  job = toolEnded(job, 't1', 'Read', true, undefined)
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

test('agent loops are listed by their description, working ones first, and a workflow shows its progress', () => {
  let job = startJob(EMPTY_JOB, 'task', NOW)
  job = toolStarted(job, 'w', 'Workflow', {}, undefined, NOW)
  job = toolStarted(job, 'a1', 'Grep', { pattern: 'TODO' }, 'agent-aaaaaa', NOW + 1_000)
  job = toolStarted(job, 'b1', 'Read', { file_path: '/x/b.ts' }, 'agent-bbbbbb', NOW + 2_000)
  job = loopEnded(job, 'agent-aaaaaa', NOW + 3_000)
  const card = jobCard(job, [{ id: 'agent-bbbbbb', description: 'review', type: 'general-purpose' }], NOW + 4_000)
  const rows = card?.rows ?? []

  expect(rows).toContainEqual({ kind: 'gauge', label: 'workflow', value: '1/2', ratio: 0.5, note: '4s', tone: 'ok' })
  expect(rows).toContainEqual({ kind: 'section', title: 'agents 1 working', tone: 'dim' })
  const agents = rows.filter(row => row.kind === 'pair' && /^[●✓]/.test(row.label))
  expect(agents.map(row => (row.kind === 'pair' ? row.label : ''))).toEqual(['● review', '✓ #agent-'])
})

test('a new prompt restarts the counts but keeps agents still working', () => {
  let job = startJob(EMPTY_JOB, 'first', NOW)
  job = toolStarted(job, 'a1', 'Bash', { command: 'ls' }, 'bg', NOW)
  job = startJob(job, 'second', NOW + 1_000)

  expect(job.task).toBe('second')
  expect(job.tools).toBe(0)
  expect(Object.keys(job.loops)).toEqual(['bg'])
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
