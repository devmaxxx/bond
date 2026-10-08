import { expect, test } from 'claude-code/testing'

import { fillRepoPath, lastJson, pickProfileFile, toClaimable, toLoopTask, toProfile } from '../hooks/crew-parse'

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
