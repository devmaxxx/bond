import { expect, test } from 'claude-code/testing'

import type { CacheSnapshot, ModelTally, UsageSnapshot } from '../types'
import { EMPTY_JOB, agentCard, agentSpawned, sendNotice, elapsed, endJob, isBusy, jobCard, loopEnded, startJob, testRun, toolAsked, toolEnded, toolLabel, toolStarted, workflowLaunched } from '../hooks/job'
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
  const agents = rows.flatMap(row => (row.kind === 'agent' ? [[row.mark, row.name, row.model, row.calls, row.time, row.detail, row.test, row.pushed]] : []))

  expect(rows).toContainEqual({ kind: 'section', title: 'workflow · batch-build · 36953d3d', tone: 'dim' })
  expect(rows).toContainEqual({ kind: 'gauge', label: 'finished', value: '0/2', ratio: 0, note: '1m04s', tone: 'ok' })
  expect(rows).toContainEqual({ kind: 'section', title: 'agents · 2 working · 1 red', tone: 'dim' })
  expect(agents).toEqual([
    ['●', 'implement:B', 'opus', 1, '1m04s', 'Bash git push -u origin x', null, true],
    ['●', 'implement:A', 'opus', 1, '1m04s', 'Bash pnpm exec vitest run · vitest', { pass: 44, fail: 2 }, false],
    ['✓', 'review', 'haiku', 0, '1m01s ago', 'finished', null, false],
  ])
})

test('a test run is read only from a runner command, by the counts it printed last', () => {
  expect(testRun('node --test tests/*.test.mjs', '# pass 476\n# fail 0')).toEqual({ pass: 476, fail: 0, label: 'node --test' })
  expect(testRun('pnpm exec tsc --noEmit', 'Found 3 errors in 2 files.')).toEqual({ pass: null, fail: 3, label: 'tsc' })
  expect(testRun("python3 - <<'EOF'\nrun('vitest')", '1 failed')).toBe(null)
  expect(testRun('pnpm exec vitest run', 'no output')).toEqual({ pass: null, fail: 0, label: 'vitest' })
  expect(testRun('pnpm exec vitest run', 'Tests 12 passed (12) · returns 2 errors')).toEqual({ pass: 12, fail: 0, label: 'vitest' })
  expect(testRun('test -f log && cat log', '3 errors')).toBe(null)
  expect(testRun('pnpm -r test', '3 failed | 2 passed')).toEqual({ pass: 2, fail: 3, label: 'test' })
})

test('a clean rerun clears a red loop', () => {
  let job = toolStarted(startJob(EMPTY_JOB, 'task', NOW), 't1', 'Bash', { command: 'npx tsc --noEmit' }, 'a', NOW)
  job = toolEnded(job, 't1', true, 'a', testRun('npx tsc --noEmit', 'Found 3 errors in 2 files.', true))
  expect(jobCard(job, [], NOW)?.rows).toContainEqual({ kind: 'section', title: 'agents · 1 working · 1 red', tone: 'dim' })
  job = toolEnded(toolStarted(job, 't2', 'Bash', { command: 'npx tsc --noEmit' }, 'a', NOW), 't2', false, 'a', testRun('npx tsc --noEmit', ''))
  expect(jobCard(job, [], NOW)?.rows).toContainEqual({ kind: 'section', title: 'agents · 1 working', tone: 'dim' })
})

test('only a command that runs a push flags it', () => {
  const pushed = (command: string) => toolStarted(EMPTY_JOB, 't', 'Bash', { command }, 'a', NOW).loops.a?.pushed
  expect(pushed('rg "git push" docs/')).toBe(false)
  expect(pushed('cd /w && git -C repo push origin x')).toBe(true)
  expect(pushed('pnpm test; gh pr create --fill')).toBe(true)
})

test('a run counts only its own agents finishing, and its launch result fixes a borrowed id', () => {
  let job = toolStarted(startJob(EMPTY_JOB, 'task', NOW), 'w1', 'Workflow', {}, undefined, NOW)
  job = agentSpawned(job, 'a', 'A', 'opus', 'wf_A', NOW)
  job = toolStarted(job, 'w2', 'Workflow', {}, undefined, NOW)
  job = agentSpawned(job, 'a2', 'A2', 'opus', 'wf_A', NOW)
  job = workflowLaunched(job, 'B', 'wf_B')
  job = agentSpawned(job, 'x', 'X', 'opus', 'wf_B', NOW)
  job = loopEnded(loopEnded(job, 'a', NOW), 'a2', NOW)

  expect(job.workflow).toEqual({ at: NOW, name: 'B', runId: 'wf_B', started: 1, done: 0 })
})

test('a loop saved by an older version draws without the newer fields', () => {
  const old = { calls: 2, last: 'Read a.ts', at: NOW, firstAt: NOW, done: false, workflow: true }
  const job = { ...startJob(EMPTY_JOB, 'task', NOW), loops: { a: old } } as unknown as typeof EMPTY_JOB

  expect(jobCard(job, [], NOW)?.rows).toContainEqual(expect.objectContaining({ kind: 'agent', name: '#a', test: null, pushed: false }))
})

test('the workflow count survives its agents dropping off the list', () => {
  let job = startJob(EMPTY_JOB, 'task', NOW)
  job = toolStarted(job, 'w', 'Workflow', {}, undefined, NOW)
  for (const id of ['a', 'b', 'c', 'd']) {
    job = loopEnded(agentSpawned(job, id, id, 'opus', 'wf_x', NOW), id, NOW)
  }
  job = agentSpawned(job, 'e', 'e', 'opus', 'wf_x', NOW + 6 * 60_000)
  const rows = jobCard(job, [], NOW + 7 * 60_000)?.rows ?? []

  expect(rows).toContainEqual({ kind: 'gauge', label: 'finished', value: '4/5', ratio: 0.8, note: '7m00s', tone: 'ok' })
})

test('a loop that never reports its end goes quiet, stops the redraws, then drops off', () => {
  const job = toolStarted(startJob(EMPTY_JOB, 'task', NOW), 'f', 'Read', { file_path: '/a.ts' }, 'fork1', NOW)

  expect(isBusy(job, NOW + 10_000)).toBe(true)
  expect(isBusy(job, NOW + 3 * 60_000)).toBe(false)
  expect(jobCard(job, [], NOW + 3 * 60_000)?.rows).toContainEqual(expect.objectContaining({ kind: 'agent', mark: '◌', name: '#fork1', time: 'idle 3m00s', tone: 'warn' }))
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

test('the main tab keeps the task, then the job and session tabs in brief: cache, model and only the gauges that matter', () => {
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
  const models: ModelTally = { current: 'claude-opus-5-5', byModel: { 'claude-opus-5-5': { requests: 4, tokens: 12_000 }, 'claude-haiku-5-5': { requests: 2, tokens: 3_000 } } }
  const card = summaryCard(job, cache, usage, models, NOW + 10_000, 10_000)
  const outline = card.rows.map(row => (row.kind === 'section' ? `[${row.tab}]` : 'label' in row ? row.label : row.kind))

  expect(card.title).toBe('Cockpit')
  expect(card.badge).toBe('10s · $1.50')
  expect(outline).toEqual(['note', '[job]', 'now', '[session]', 'cache', 'model', '5h', 'spend', 'context'])
  expect(card.rows.find(row => row.kind === 'pair' && row.label === 'model')).toMatchObject({ value: '12.0k', note: 'opus-5-5 · 4 req · +1 more' })
})

test('agents working with no task yet go under the job heading, and the card has no task line', () => {
  const job = agentSpawned(EMPTY_JOB, 'a1', 'implement:A', 'claude-opus-5-5', undefined, NOW)
  const card = summaryCard(toolStarted(job, 't1', 'Read', { file_path: '/w/a.ts' }, 'a1', NOW), null, null, { current: null, byModel: {} }, NOW + 1_000, 10_000)

  expect(card.status).toBe('● working')
  expect(card.rows.map(row => (row.kind === 'section' ? `[${row.tab}]` : 'label' in row ? row.label : row.kind === 'line' ? row.text : row.kind))).toEqual(['[job]', 'now', 'agents', '[session]', 'No request yet'])
})

test('before anything runs the main tab still heads both tabs, each saying it is empty', () => {
  const card = summaryCard(EMPTY_JOB, null, null, { current: null, byModel: {} }, NOW, 10_000)

  expect(card.status).toBe('○ idle')
  expect(card.rows.map(row => (row.kind === 'section' ? `[${row.tab}]` : row.kind === 'line' ? row.text : row.kind))).toEqual(['[job]', 'Nothing running', '[session]', 'No request yet'])
})

test('the agent tab shows one agent and its latest calls, newest first', () => {
  let job = agentSpawned(startJob(EMPTY_JOB, 'task', NOW), 'a1', 'implement:A', 'claude-opus-5-5', 'wf_1', NOW)
  job = toolStarted(job, 't1', 'Read', { file_path: '/w/a.ts' }, 'a1', NOW + 1_000)
  job = toolStarted(job, 't2', 'Bash', { command: 'pnpm exec vitest run' }, 'a1', NOW + 5_000)
  const card = agentCard(job, 'a1', [], NOW + 10_000)

  expect(card.title).toBe('implement:A')
  expect(card.status).toBe('● working')
  expect(card.badge).toBe('opus')
  expect(card.rows.flatMap(row => (row.kind === 'line' ? [row.text] : []))).toEqual(['    5s  Bash pnpm exec vitest run', '    9s  Read a.ts'])
  expect(agentCard(job, null, [], NOW).rows).toEqual([{ kind: 'note', text: 'Press an agent in the job tab', tone: 'dim' }])
})

test('runners are found past env prefixes, package-manager flags and subcommands', () => {
  const label = (command: string) => testRun(command, '2 failed | 3 passed')?.label ?? null
  expect(['pnpm vitest run', 'pnpm tsc --noEmit', 'CI=1 pnpm test', 'pnpm -C plugins/x test', 'npm exec vitest', 'pnpm run vitest', 'pnpm --filter api exec vitest'].map(label))
    .toEqual(['vitest', 'tsc', 'test', 'test', 'vitest', 'vitest', 'vitest'])
  expect(label('test -f a && cat a')).toBe(null)
  expect(label('npx prettier --check .')).toBe(null)
})

test("a late agent of an earlier run leaves the newer run's gauge alone", () => {
  let job = toolStarted(startJob(EMPTY_JOB, 'task', NOW), 'w1', 'Workflow', {}, undefined, NOW)
  job = workflowLaunched(agentSpawned(job, 'a1', 'A', 'opus', 'r1', NOW), 'one', 'r1')
  job = toolStarted(job, 'w2', 'Workflow', {}, undefined, NOW)
  job = workflowLaunched(job, 'two', 'r2')
  job = agentSpawned(agentSpawned(job, 'b1', 'B1', 'opus', 'r2', NOW), 'b2', 'B2', 'opus', 'r2', NOW)
  job = agentSpawned(job, 'a2', 'A2', 'opus', 'r1', NOW)
  job = loopEnded(loopEnded(job, 'b1', NOW), 'b2', NOW)

  expect(job.workflow).toEqual({ at: NOW, name: 'two', runId: 'r2', started: 2, done: 2 })
})

test('the agent tab keeps an agent quiet past the five-minute cut', () => {
  const job = agentSpawned(startJob(EMPTY_JOB, 'task', NOW), 'a1', 'implement:A', 'opus', undefined, NOW)
  const card = agentCard(job, 'a1', [], NOW + 6 * 60_000)

  expect(card.title).toBe('implement:A')
  expect(card.rows[0]).toEqual(expect.objectContaining({ kind: 'agent', name: 'implement:A', mark: '◌' }))
})

test('the send notice says whether the message reached the agent', () => {
  expect(sendNotice('implement:A', { isDelivered: true })).toBe('bond-cockpit: sent to implement:A')
  expect(sendNotice('implement:A', { isDelivered: false, reason: 'no such agent' })).toBe('bond-cockpit: not sent to implement:A: no such agent')
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
