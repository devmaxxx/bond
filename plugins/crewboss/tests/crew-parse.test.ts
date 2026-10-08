import { expect, test } from 'claude-code/testing'

import { answerKey, fillRepoPath, lastJson, pickProfileFile, toAnswerOptions, toClaimable, toLoopTask, toProfile } from '../hooks/crew-parse'

test('only a lone profile is picked, as crewboss v1 runs exactly one', () => {
  expect(pickProfileFile(['beauty-crm.json', 'notes.txt'])).toBe('beauty-crm.json')
  expect(pickProfileFile(['a.json', 'b.json'])).toBe(null)
  expect(pickProfileFile([])).toBe(null)
})

test('the claimable command prefers list over next and quotes the repo path', () => {
  const raw = {
    repo: { path: "/work/o'neil", github: 'acme/app' },
    ghUser: 'me',
    source: { adapter: 'repo-cli', commands: { next: 'next', list: 'node {repoPath}/cli.mjs list' } },
  }

  expect(toProfile('app.json', raw)).toEqual({
    name: 'app',
    repoPath: "/work/o'neil",
    github: 'acme/app',
    ghUser: 'me',
    claimableCommand: `node '/work/o'\\''neil'/cli.mjs list`,
  })
  expect(toProfile('jira.json', { ...raw, source: { adapter: 'jira' } })).toBe('profile jira has no repo-cli list or next command')
  expect(fillRepoPath('x', '/p')).toBe('x')
})

test('the last JSON value after a pnpm banner is the answer, and null means nothing ready', () => {
  expect(lastJson('> app@1 tasks\n> node cli\n[{"id":"7"}]')).toEqual([{ id: '7' }])
  expect(lastJson('{\n  "id": 3\n}')).toEqual({ id: 3 })
  expect(lastJson('null')).toBe(null)
  expect(lastJson('next: nothing claimable')).toBe(undefined)
})

test('claimable items get an issue link when the id is an issue number', () => {
  expect(toClaimable([{ id: 12, title: 'a' }, { id: 'PLAT-1', title: 'b' }, { title: 'no id' }], 'acme/app')).toEqual([
    { id: '12', title: 'a', url: 'https://github.com/acme/app/issues/12' },
    { id: 'PLAT-1', title: 'b', url: null },
  ])
  expect(toClaimable({ id: '5', url: 'https://x/5' }, 'acme/app')).toEqual([{ id: '5', title: '', url: 'https://x/5' }])
  expect(toClaimable(null, 'acme/app')).toEqual([])
})

test('a state file without a task reads as no task in progress', () => {
  expect(toLoopTask(null)).toBe(null)
  expect(toLoopTask({ v: 1 })).toBe(null)
  expect(toLoopTask({ task: { id: 9, state: 'WaitingCI', pr: 41 } })?.pr).toBe(41)
})

test('drafted answers are read from the model reply, fenced or not, and capped at four', () => {
  const reply = '```json\n[{"label":"Split it","answer":"Split T27 in two."},{"label":"","answer":"Wait in alpha."},{"answer":""},{"label":"a","answer":"b"},{"label":"c","answer":"d"},{"label":"e","answer":"f"}]\n```'

  expect(toAnswerOptions(reply)).toEqual([
    { label: 'Split it', answer: 'Split T27 in two.' },
    { label: 'Wait in alpha.', answer: 'Wait in alpha.' },
    { label: 'a', answer: 'b' },
    { label: 'c', answer: 'd' },
  ])
  expect(toAnswerOptions('I cannot help with that')).toEqual([])
  expect(toAnswerOptions('Here:\n[\n  {"label": "x", "answer": "Same."},\n  {"label": "y", "answer": "Same."}\n]\nLet me know.')).toEqual([
    { label: 'x', answer: 'Same.' },
  ])
})

test('only a NeedsHuman task with a question gets answer options', () => {
  const task = { id: 7, title: '', state: 'NeedsHuman', stateSince: 0, branch: null, pr: null, fixCount: 0, needsHumanReason: 'Wait or split?' }

  expect(answerKey(task)).toBe('7:Wait or split?')
  expect(answerKey({ ...task, state: 'WaitingCI' })).toBe(null)
  expect(answerKey({ ...task, needsHumanReason: null })).toBe(null)
})
