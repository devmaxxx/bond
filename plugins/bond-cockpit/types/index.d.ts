/** The last main-thread request's prompt-cache usage, and when its entry lapses. */
export type CacheSnapshot = {
  read: number
  wrote: number
  fresh: number
  at: number
  ttlMs: number
  // Why the TTL is what it is: a fixed setting, a subscription in overage, a model switch's report, or the plan default.
  ttlSource: 'setting' | 'overage' | 'switch' | 'plan' | 'api'
}

/** Every main-thread request since the session started or was cleared. */
export type CacheSession = {
  requests: number
  read: number
  wrote: number
  fresh: number
  // Requests that read less than half their prompt from cache: the prefix was rebuilt.
  misses: number
  lastMissAt: number | null
  // Hit rate of the latest requests, oldest first, for the sparkline.
  recent: number[]
}

/** Every request since the session started or was cleared, subagents' included, by the model that answered. */
export type ModelTally = {
  // The model the main thread's last request named.
  current: string | null
  byModel: Record<string, { requests: number; tokens: number }>
}

/** The account's rate-limit windows, the context fill and the session's cost, as the status line reads them. */
export type UsageSnapshot = {
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]
  contextPercent: number | null
  contextWindow: number
  costUsd: number | null
}

/** One subagent, teammate or workflow agent loop, as its tool calls show it. */
export type JobLoop = {
  calls: number
  // The label of its latest tool call.
  last: string
  // Its latest tool call, or when it finished.
  at: number
  firstAt: number
  done: boolean
  // A workflow script's agent() started it.
  workflow: boolean
  // The run it belongs to, so only its own run's agents finish that run.
  runId: string | null
  // From its spawn: the description it runs under and the model it runs on.
  name: string | null
  model: string | null
  // Its latest test, typecheck or lint run, by the counts the runner printed.
  test: { pass: number | null; fail: number | null; label: string } | null
  // It ran git push or gh pr create/merge; agents in a batch never push.
  pushed: boolean
  // Its latest tool calls, oldest first, for the agent tab.
  history: { label: string; at: number }[]
}

/** What the session is doing: the prompt it works on, the tools in flight, the agent loops it runs. */
export type JobState = {
  task: string | null
  startedAt: number | null
  endedAt: number | null
  // Main-loop tool calls not yet answered, oldest first.
  // `asked`: the permission check put it to a decision, so it may be waiting on the person.
  inFlight: { id: string; label: string; at: number; asked: boolean }[]
  tools: number
  failed: number
  recent: string[]
  loops: Record<string, JobLoop>
  // The latest Workflow run: when it was launched, its script's name, and its agents started and finished since.
  workflow: { at: number; name: string | null; runId: string | null; started: number; done: number } | null
  // The bond implement flow this session drives, as its latest state file write reported it.
  flow?: FlowState | null
}

/** One phase of a bond implement run. */
export type FlowPhase = { name: string; status: 'done' | 'active' | 'paused' | 'todo' | 'skipped' }

/** A bond implement run's progress: the flow writes it to `~/.local/state/bond-flow/<repo>--<branch>.json` at every phase boundary. */
export type FlowState = {
  branch: string
  // The progress file the run wrote; its `.pause` sibling stops the run at the next boundary. Absent in state saved before it.
  file?: string
  phases: FlowPhase[]
  // The phase the run is in or stopped at; -1 once every phase is done.
  current: number
  // Set while the run waits at a checkpoint for the person.
  paused: string | null
  at: number
}

/** One plugin or user skill on the plugins tab. */
export type CatalogEntry = {
  kind: 'plugin' | 'skill'
  // A plugin's `name@marketplace`, a skill's name.
  id: string
  label: string
  isOn: boolean
  // What the entry adds to every request: its skills' listing, and for a plugin its MCP tools' schemas.
  tokens: number
  uses: number
}

/** What the plugins tab lists: the active profile, every plugin and skill, and the listing's total tokens. */
export type Catalog = {
  profile: string | null
  plugins: CatalogEntry[]
  skills: CatalogEntry[]
  skillTokens: number
  mcpTokens: number
  // The settings tab: built-in features, MCP servers and the skill description cap, as the settings hold them.
  features: FeatureRow[]
  servers: ServerRow[]
  descCap: number | null
}

/** A built-in feature a settings key turns off, with what it costs every request where the listing shows it. */
export type FeatureRow = { key: string; label: string; isOn: boolean; tokens: number }

/** One MCP server, with its loaded tools' cost and how many tools it has. */
export type ServerRow = { name: string; isOn: boolean; tokens: number; tools: number }

declare module 'claude-code' {
  interface PluginState {
    'bond-cockpit': {
      cache: CacheSnapshot | null
      session: CacheSession
      countdown: string
      models: ModelTally
      usage: UsageSnapshot | null
      job: JobState
      beat: number
      // The agent the agent tab shows.
      watched: string | null
      // The strip under the prompt; null until session.start reads it from $.store.
      strip: 'expanded' | 'collapsed' | 'hidden' | null
      // The plugins tab: what it lists, null until it first opens; and the profile it edits, null for none.
      catalog: Catalog | null
      editing: string | null
    }
  }
}
