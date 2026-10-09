/** The last main-thread request's prompt-cache usage, and when its entry lapses. */
export type CacheSnapshot = {
  read: number
  wrote: number
  fresh: number
  at: number
  ttlMs: number
}

declare module 'claude-code' {
  interface PluginState {
    'bond-cockpit': {
      cache: CacheSnapshot | null
      countdown: string
    }
  }
}
