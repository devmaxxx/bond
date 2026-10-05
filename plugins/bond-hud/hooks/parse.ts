import type { Checks, Host, PrStatus, RepoStatus } from '../types'

export type Accounts = { personal: string; work: string }

export type Remote = { host: Host | null; owner: string | null }

export type CheckNode = {
  __typename?: string
  name?: string
  context?: string
  status?: string
  conclusion?: string
  state?: string
}

export type Manifest = { host?: unknown; tracker?: unknown }

export type RawPr = {
  number?: unknown
  title?: string
  state?: string
  isDraft?: boolean
  reviewDecision?: string
  url?: string
  statusCheckRollup?: CheckNode[]
}

type Verdict = 'passed' | 'failed' | 'pending'

const REMOTE = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^:/]+)(?::\d+)?[:/]+([^/]+)\//i
const FAILED = new Set(['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])
const PENDING = new Set(['PENDING', 'EXPECTED'])

export function parseRemote(url: string | null): Remote {
  const match = url === null ? null : REMOTE.exec(url)
  if (match === null) {
    return { host: null, owner: null }
  }
  const [, domain = '', owner = ''] = match

  return { host: hostOf(domain.toLowerCase()), owner }
}

function hostOf(domain: string): Host | null {
  if (domain === 'bitbucket.org') {
    return 'bitbucket'
  }
  if (domain === 'github.com' || domain.startsWith('github-') || domain.startsWith('github.com-')) {
    return 'github'
  }

  return null
}

export function isBonlivaRemote(remote: Remote): boolean {
  return remote.host === 'bitbucket' && remote.owner === 'bonliva'
}

// Mirrors authorship-conventions: the remote owner decides first, Bonliva second,
// and anything else has no expected account rather than a guessed one.
export function expectedLogin(remote: Remote, isBonliva: boolean, accounts: Accounts): string | null {
  if (remote.owner === accounts.personal) {
    return accounts.personal
  }
  if (isBonliva) {
    return accounts.work
  }

  return null
}

export function resolveTracker(manifestTracker: unknown, isBonliva: boolean): RepoStatus['tracker'] {
  if (manifestTracker === 'jira' || manifestTracker === 'none') {
    return manifestTracker
  }

  return isBonliva ? 'jira' : 'none'
}

export function countChecks(nodes: readonly CheckNode[]): Checks {
  const checks: Checks = { passed: 0, failed: 0, pending: 0, failing: [] }
  for (const node of nodes) {
    const verdict = verdictOf(node)
    checks[verdict] += 1
    if (verdict === 'failed') {
      checks.failing.push(node.name ?? node.context ?? 'unnamed check')
    }
  }

  return checks
}

function verdictOf(node: CheckNode): Verdict {
  if (node.__typename === 'StatusContext') {
    return verdictOfState(node.state ?? '')
  }
  if (node.status !== 'COMPLETED') {
    return 'pending'
  }

  return FAILED.has(node.conclusion ?? '') ? 'failed' : 'passed'
}

function verdictOfState(state: string): Verdict {
  if (PENDING.has(state)) {
    return 'pending'
  }

  return FAILED.has(state) ? 'failed' : 'passed'
}

export function toPrStatus(raw: RawPr | null): PrStatus | null {
  if (raw === null || typeof raw.number !== 'number') {
    return null
  }

  return {
    number: raw.number,
    title: raw.title ?? '',
    state: raw.state ?? '',
    isDraft: raw.isDraft === true,
    review: raw.reviewDecision || null,
    url: raw.url ?? '',
    checks: countChecks(raw.statusCheckRollup ?? []),
  }
}

export function activeLoginOf(authStatus: unknown): string | null {
  const hosts = (authStatus as { hosts?: Record<string, { login?: string; active?: boolean }[]> } | null)?.hosts
  const active = hosts?.['github.com']?.find(account => account.active !== false)

  return active?.login ?? null
}

export function parseJson(text: string | null): unknown {
  if (text === null) {
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
