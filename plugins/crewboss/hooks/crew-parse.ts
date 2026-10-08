import type { ClaimableIssue, LoopTask, OpenPr } from '../types'
import { countChecks } from './parse'
import type { RawPr } from './parse'

export type CrewProfile = {
  name: string
  repoPath: string
  github: string
  ghUser: string
  claimableCommand: string
}

type RawProfile = {
  repo?: { path?: unknown; github?: unknown }
  ghUser?: unknown
  source?: { adapter?: unknown; commands?: { next?: unknown; list?: unknown } }
}

type RawTask = {
  id?: unknown
  title?: unknown
  state?: unknown
  stateSince?: unknown
  branch?: unknown
  pr?: unknown
  fixCount?: unknown
  needsHumanReason?: unknown
}

type RawItem = { id?: unknown; title?: unknown; url?: unknown }

// crewboss v1 runs one profile and refuses to guess between several; the mod shows the one it would run.
export function pickProfileFile(names: readonly string[]): string | null {
  const profiles = names.filter(name => name.endsWith('.json'))

  return profiles.length === 1 ? (profiles[0] ?? null) : null
}

export function toProfile(file: string, raw: unknown): CrewProfile | string {
  const profile = (raw ?? {}) as RawProfile
  const name = file.replace(/\.json$/, '')
  const repoPath = profile.repo?.path
  const github = profile.repo?.github
  const ghUser = profile.ghUser
  if (typeof repoPath !== 'string' || typeof github !== 'string' || typeof ghUser !== 'string') {
    return `profile ${name} lacks repo.path, repo.github or ghUser`
  }
  const commands = profile.source?.adapter === 'repo-cli' ? profile.source.commands : undefined
  // `list` is the whole ready queue; `next` is what crewboss falls back to and may answer with fewer.
  const command = commands?.list ?? commands?.next
  if (typeof command !== 'string') {
    return `profile ${name} has no repo-cli list or next command`
  }

  return { name, repoPath, github, ghUser, claimableCommand: fillRepoPath(command, repoPath) }
}

export function fillRepoPath(template: string, repoPath: string): string {
  return template.replaceAll('{repoPath}', shellQuote(repoPath))
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

export function toLoopTask(raw: unknown): LoopTask | null {
  const task = (raw as { task?: RawTask } | null)?.task
  if (typeof task?.id !== 'number' || typeof task.state !== 'string') {
    return null
  }

  return {
    id: task.id,
    title: typeof task.title === 'string' ? task.title : '',
    state: task.state,
    stateSince: typeof task.stateSince === 'number' ? task.stateSince : 0,
    branch: typeof task.branch === 'string' ? task.branch : null,
    pr: typeof task.pr === 'number' ? task.pr : null,
    fixCount: typeof task.fixCount === 'number' ? task.fixCount : 0,
    needsHumanReason: typeof task.needsHumanReason === 'string' ? task.needsHumanReason : null,
  }
}

export function toOpenPrs(raw: unknown): OpenPr[] {
  if (!Array.isArray(raw)) {
    return []
  }

  return (raw as RawPr[]).flatMap(pr => typeof pr.number === 'number'
    ? [{
        number: pr.number,
        title: pr.title ?? '',
        isDraft: pr.isDraft === true,
        review: pr.reviewDecision || null,
        url: pr.url ?? '',
        checks: countChecks(pr.statusCheckRollup ?? []),
      }]
    : [])
}

// A task CLI run through pnpm prints its banner before the JSON, so only the last JSON value counts, as crewboss reads it.
export function lastJson(stdout: string): unknown {
  const lines = stdout.trim().split('\n')
  for (let start = lines.length - 1; start >= 0; start -= 1) {
    if (!/^\s*[[{n]/.test(lines[start] ?? '')) {
      continue
    }
    try {
      return JSON.parse(lines.slice(start).join('\n'))
    } catch {
      // A line that opens a value but is not where it starts; keep walking up.
    }
  }

  return undefined
}

export function toClaimable(raw: unknown, github: string): ClaimableIssue[] {
  if (raw === null || raw === undefined) {
    return []
  }
  const items = (Array.isArray(raw) ? raw : [raw]) as RawItem[]

  return items.flatMap(item => {
    if (typeof item.id !== 'string' && typeof item.id !== 'number') {
      return []
    }
    const id = String(item.id)

    return [{ id, title: typeof item.title === 'string' ? item.title : '', url: issueUrl(item.url, id, github) }]
  })
}

function issueUrl(url: unknown, id: string, github: string): string | null {
  if (typeof url === 'string' && url !== '') {
    return url
  }

  return /^\d+$/.test(id) ? `https://github.com/${github}/issues/${id}` : null
}
