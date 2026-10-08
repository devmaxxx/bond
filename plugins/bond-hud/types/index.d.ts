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

declare module 'claude-code' {
  interface PluginState {
    'bond-hud': {
      repo: RepoStatus | null
      pr: PrStatus | null
      tasks: TaskItem[]
      agents: AgentItem[]
      turn: TurnProgress
    }
  }
}
