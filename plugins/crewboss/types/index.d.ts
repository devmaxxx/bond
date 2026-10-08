export type Host = 'github' | 'bitbucket'

export type RepoStatus = {
  branch: string
  host: Host | null
  tracker: 'jira' | 'none'
  login: string | null
  expectedLogin: string | null
}

export type Checks = {
  passed: number
  failed: number
  pending: number
  failing: string[]
}

export type PrStatus = {
  number: number
  title: string
  state: string
  isDraft: boolean
  review: string | null
  url: string
  checks: Checks
}

export type TaskItem = {
  id: string
  subject: string
  status: 'pending' | 'in_progress' | 'completed'
}

export type AgentItem = {
  id: string
  description: string
  status: string
}

export type TurnProgress = {
  isRunning: boolean
  startedAt: number
  toolCount: number
  lastTool: string | null
}

export type OpenPr = {
  number: number
  title: string
  isDraft: boolean
  review: string | null
  url: string
  checks: Checks
}

export type LoopTask = {
  id: number
  title: string
  state: string
  stateSince: number
  branch: string | null
  pr: number | null
  fixCount: number
  needsHumanReason: string | null
}

export type ClaimableIssue = {
  id: string
  title: string
  url: string | null
}

export type CrewStatus = {
  profile: string | null
  repo: string | null
  ghUser: string | null
  task: LoopTask | null
  prs: OpenPr[]
  claimable: ClaimableIssue[]
  problems: string[]
}

export type AnswerOption = {
  label: string
  answer: string
}

// key: the task and question the options were drafted for, so a new question drafts again.
export type AnswerOptions = {
  key: string
  options: AnswerOption[]
}

declare module 'claude-code' {
  interface PluginState {
    crewboss: {
      crew: CrewStatus | null
      answers: AnswerOptions | null
      repo: RepoStatus | null
      pr: PrStatus | null
      tasks: TaskItem[]
      agents: AgentItem[]
      turn: TurnProgress
    }
  }
}
