import { expect, test } from 'claude-code/testing'

import { paneCards, statusLine } from '../hooks/view'
import type { TaskItem } from '../types'

const IDLE = { isRunning: false, startedAt: 0, toolCount: 0, lastTool: null }

function task(index: number, status: TaskItem['status']): TaskItem {
  return { id: String(index), subject: `step ${index}`, status }
}

test('a long checklist keeps the first unfinished task in view', () => {
  const tasks = [
    ...Array.from({ length: 15 }, (_, index) => task(index, 'completed' as const)),
    task(15, 'in_progress'),
    ...Array.from({ length: 4 }, (_, index) => task(16 + index, 'pending' as const)),
  ]

  const texts = paneCards({ crew: null, repo: null, pr: null, turn: IDLE, tasks, agents: [], now: 0 }).flatMap(card => card.rows.map(row => row.text))

  expect(texts).toContain('Tasks 15/20')
  expect(texts).toContain('▸ step 15')
  expect(texts).toContain('○ step 19')
  expect(texts).toContain('… 8 earlier')
})

test('the status line leaves out the account warning when no account is expected', () => {
  const repo = { branch: 'main', host: 'github' as const, tracker: 'none' as const, login: 'someone', expectedLogin: null }

  expect(statusLine(repo, null)).toBe('⎇ main · github · gh someone')
})
