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

declare module 'claude-code' {
  interface PluginState {
    'bond-cockpit': {
      cache: CacheSnapshot | null
      session: CacheSession
      countdown: string
      models: ModelTally
      usage: UsageSnapshot | null
    }
  }
}
