import { expect, test } from 'claude-code/testing'

import { activeLoginOf, countChecks, expectedLogin, parseRemote, resolveTracker, toPrStatus } from '../hooks/parse'

const ACCOUNTS = { personal: 'devmaxxx', work: 'maxSynEfisco' }

test('parseRemote reads host and owner from ssh, https and alias remotes', () => {
  expect(parseRemote('git@github.com:devmaxxx/bond.git')).toEqual({ host: 'github', owner: 'devmaxxx' })
  expect(parseRemote('https://github.com/devmaxxx/bond.git')).toEqual({ host: 'github', owner: 'devmaxxx' })
  expect(parseRemote('git@github-personal:devmaxxx/bond.git')).toEqual({ host: 'github', owner: 'devmaxxx' })
  expect(parseRemote('ssh://git@bitbucket.org/bonliva/bonliva-erp.git')).toEqual({ host: 'bitbucket', owner: 'bonliva' })
  expect(parseRemote('https://max@bitbucket.org/bonliva/bonliva-crm.git')).toEqual({ host: 'bitbucket', owner: 'bonliva' })
  expect(parseRemote('git@gitlab.com:someone/repo.git')).toEqual({ host: null, owner: 'someone' })
  expect(parseRemote(null)).toEqual({ host: null, owner: null })
})

test('expectedLogin follows the remote owner, then Bonliva, and never guesses', () => {
  expect(expectedLogin({ host: 'github', owner: 'devmaxxx' }, false, ACCOUNTS)).toBe('devmaxxx')
  expect(expectedLogin({ host: 'github', owner: 'bonliva' }, true, ACCOUNTS)).toBe('maxSynEfisco')
  expect(expectedLogin({ host: 'github', owner: 'someone-else' }, false, ACCOUNTS)).toBe(null)
})

test('resolveTracker lets the manifest win and defaults to jira only in Bonliva', () => {
  expect(resolveTracker('none', true)).toBe('none')
  expect(resolveTracker('jira', false)).toBe('jira')
  expect(resolveTracker(undefined, true)).toBe('jira')
  expect(resolveTracker(undefined, false)).toBe('none')
})

test('countChecks sorts check runs and status contexts into passed, failed and pending', () => {
  const checks = countChecks([
    { __typename: 'CheckRun', name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { __typename: 'CheckRun', name: 'docs', status: 'COMPLETED', conclusion: 'SKIPPED' },
    { __typename: 'CheckRun', name: 'lint', status: 'COMPLETED', conclusion: 'FAILURE' },
    { __typename: 'CheckRun', name: 'e2e', status: 'IN_PROGRESS', conclusion: '' },
    { __typename: 'StatusContext', context: 'ci/woodpecker', state: 'ERROR' },
    { __typename: 'StatusContext', context: 'deploy', state: 'PENDING' },
  ])

  expect(checks).toEqual({ passed: 2, failed: 2, pending: 2, failing: ['lint', 'ci/woodpecker'] })
})

test('toPrStatus maps gh pr view output and rejects anything without a number', () => {
  const pr = toPrStatus({
    number: 7,
    title: 'feat: hud',
    state: 'OPEN',
    isDraft: true,
    reviewDecision: '',
    url: 'https://github.com/devmaxxx/bond/pull/7',
    statusCheckRollup: [],
  })

  expect(pr).toEqual({
    number: 7,
    title: 'feat: hud',
    state: 'OPEN',
    isDraft: true,
    review: null,
    url: 'https://github.com/devmaxxx/bond/pull/7',
    checks: { passed: 0, failed: 0, pending: 0, failing: [] },
  })
  expect(toPrStatus({ title: 'no number' })).toBe(null)
  expect(toPrStatus(null)).toBe(null)
})

test('activeLoginOf picks the active github.com account from gh auth status json', () => {
  const status = { hosts: { 'github.com': [{ login: 'maxSynEfisco', active: true, state: 'success' }] } }

  expect(activeLoginOf(status)).toBe('maxSynEfisco')
  expect(activeLoginOf({ hosts: {} })).toBe(null)
  expect(activeLoginOf(null)).toBe(null)
})
