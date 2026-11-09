import { describe, expect, it } from 'vitest'
import { createStyle } from '../src/ansi.ts'
import { attachedFileName } from '../src/attachments.ts'
import { budgetLines } from '../src/budget.ts'
import { commandItems } from '../src/commands.ts'
import { applicationItems, OPEN_REVEAL } from '../src/open.ts'
import { latestPlan, planLines } from '../src/plan.ts'
import { referenceFor, referenceItems } from '../src/references.ts'
import { statusLines } from '../src/status.ts'
import { organizeItems, workspaceItems } from '../src/workspace.ts'
import { WORKTREE_CREATE, worktreeItems, worktreeLines } from '../src/worktrees.ts'
import { callEvent, text, userEvent } from './fixtures.ts'

const plain = createStyle(false)

describe('attachments', () => {
  it('names a file by its last path segment', () => {
    expect(attachedFileName('/home/me/docs/report.pdf')).toBe('report.pdf')
    expect(attachedFileName('C:\\docs\\notes.txt')).toBe('notes.txt')
    expect(attachedFileName('/')).toBe('file')
  })
})

describe('references', () => {
  it('lists directories, then files, then sessions, each marked by kind', () => {
    expect(referenceItems(
      [{ path: 'b.ts', kind: 'file' }, { path: 'src', kind: 'directory' }],
      [{ label: 'Fix login', displayTitle: undefined, mention: '@session-1' }, { label: 'x', displayTitle: 'Titled', mention: '@session-2' }],
    )).toEqual([
      { value: 'directory:src', label: 'src/', detail: 'directory' },
      { value: 'file:b.ts', label: 'b.ts', detail: 'file' },
      { value: 'session:@session-1', label: 'Fix login', detail: 'session' },
      { value: 'session:@session-2', label: 'Titled', detail: 'session' },
    ])
  })

  it('turns a chosen item into the text that replaces the token', () => {
    const token = { prefix: '@sr', query: 'sr', quoted: false }
    expect(referenceFor('file:src/a.ts', token)).toEqual({ text: '@src/a.ts', closed: true })
    expect(referenceFor('directory:src', token)).toEqual({ text: '@src/', closed: false })
    expect(referenceFor('file:my notes.md', token)).toEqual({ text: '@"my notes.md"', closed: true })
    expect(referenceFor('directory:my dir', token)).toEqual({ text: '@"my dir/', closed: false })
    expect(referenceFor('session:@session-1', token)).toEqual({ text: '@session-1', closed: true })
    expect(referenceFor('file:bad"name', token)).toBeUndefined()
  })
})

describe('budget', () => {
  it('shows spend against the limits and how to change one', () => {
    expect(budgetLines(plain, {
      session: { spentUsd: 0.4, limitUsd: 2, unpricedCalls: 0 }, month: '2026-10', monthly: { spentUsd: 3.1, unpricedCalls: 0 },
    })).toEqual([
      'This session: $0.40 of $2.00',
      'Month 2026-10: $3.10',
      "/budget <usd> sets this session's limit. /budget month <usd> sets the monthly limit. off clears one.",
    ])
  })

  it('warns about calls with no known price', () => {
    const lines = budgetLines(plain, {
      session: { spentUsd: 0, unpricedCalls: 2 }, month: '2026-10', monthly: { spentUsd: 0, limitUsd: 20, unpricedCalls: 5 },
    })
    expect(lines[2]).toBe('Model calls with no known price are not counted: 2 this session, 5 this month.')
    expect(lines[1]).toBe('Month 2026-10: $0.00 of $20.00')
  })
})

describe('workspaces and sessions', () => {
  it('lists workspaces with their directory and session count', () => {
    expect(workspaceItems([{ workspaceId: 'w1', path: '/home/me/app', title: 'app', sessionIds: ['a', 'b'] }], '/home/me')).toEqual([
      { value: 'w1', label: 'app', detail: '~/app · 2 sessions' },
    ])
  })

  it('offers archive or bring back, and pin or unpin', () => {
    expect(organizeItems(false, false).map(item => item.value)).toEqual(['archive', 'pin'])
    expect(organizeItems(true, true).map(item => item.value)).toEqual(['unarchive', 'unpin'])
  })
})

describe('worktrees', () => {
  it('starts with the row that creates one and flags each worktree', () => {
    expect(worktreeItems([
      { path: '/home/me/app', branch: 'main', isPrimary: true, locked: false, prunable: false },
      { path: '/home/me/app-x', isPrimary: false, locked: true, prunable: true },
    ], '/home/me')).toEqual([
      { value: WORKTREE_CREATE, label: 'Create a worktree' },
      { value: '/home/me/app', label: 'main', detail: 'main checkout · ~/app' },
      { value: '/home/me/app-x', label: 'detached', detail: 'locked · missing on disk · ~/app-x' },
    ])
  })

  it('describes the state of one worktree', () => {
    expect(worktreeLines(plain, { linked: true, branch: 'feature', uncommitted: [] })).toEqual([
      'feature', 'A worktree of the repository.', 'No uncommitted changes.',
    ])
    expect(worktreeLines(plain, { linked: false, uncommitted: ['a.ts', 'b.ts'] })).toEqual([
      'detached', 'Not a linked worktree.', 'Uncommitted changes, 2', '  a.ts', '  b.ts',
    ])
  })
})

describe('open', () => {
  it('puts the default application first and ends with the file manager', () => {
    expect(applicationItems([
      { id: 'code', name: 'VS Code', default: false },
      { id: 'zed', name: 'Zed', default: true },
    ])).toEqual([
      { value: 'app:zed', label: 'Zed', detail: 'default' },
      { value: 'app:code', label: 'VS Code', detail: undefined },
      { value: OPEN_REVEAL, label: 'Show in the file manager' },
    ])
  })
})

describe('commands', () => {
  it('sorts commands by name and shows their argument hint', () => {
    expect(commandItems([
      { name: 'goal', description: 'Set a goal\nfor the session', input: { hint: '<objective>' } },
      { name: 'clear', description: 'Clear' },
    ])).toEqual([
      { value: 'clear', label: '/clear', detail: 'Clear' },
      { value: 'goal', label: '/goal <objective>', detail: 'Set a goal for the session' },
    ])
  })
})

describe('plan', () => {
  const submit = (plan: string) => callEvent(`p${plan.length}`, 'exit_plan_mode', { plan })

  it('finds the newest submitted plan and prints it under its title', () => {
    const events = [submit('# Old plan\nstep'), userEvent([text('go on')]), submit('# New plan\n\n- one\n- two\n')]
    const plan = latestPlan(events)
    expect(plan?.title).toBe('New plan')
    expect(planLines(plain, plan!)).toEqual(['New plan', '# New plan', '', '- one', '- two'])
  })

  it('finds nothing in a history without a plan', () => {
    expect(latestPlan([userEvent([text('hi')])])).toBeUndefined()
    expect(latestPlan([])).toBeUndefined()
  })
})

describe('status', () => {
  const facts = { sessionId: 'session-3f9a0c1e-0000', cwd: '/home/me/app', home: '/home/me', running: true, queued: 2 }
  const full: Record<string, unknown> = {
    title: 'Fix the login',
    modelSelection: { lastUsed: { provider: 'p0', model: 'm0' }, next: { provider: 'p1', model: 'm1', reasoningEffort: 'high' } },
    permissions: { currentValue: 'auto' },
    plan: { active: true, pending: false },
    goal: { goal: { objective: 'Ship it' } },
    sessionStats: { turns: 3, steps: 9, llmMs: 12_000, toolMs: 4000 },
    tokenUsage: { uncachedInputTokens: 500, cacheReadTokens: 12_000, cacheWriteTokens: 0, outputTokens: 2_500_000 },
    contextPressure: { pressureTokens: 40_000, projectedTokens: 50_000, contextWindow: 200_000 },
  }

  it('reports what the projections hold', () => {
    expect(statusLines(plain, facts, key => full[key])).toEqual([
      'Fix the login',
      'Session     3f9a0c1e',
      'Directory   ~/app',
      'State       working',
      'Model       p1 / m1 · high',
      'Permissions auto',
      'Plan mode   on',
      'Goal        Ship it',
      'Queued      2',
      'Turns       3 turns · 9 steps · model 12s · tools 4s',
      'Tokens      input 12.5k · cached 12.0k · output 2.5M',
      'Context     50.0k of 200.0k tokens · 25%',
    ])
  })

  it('leaves out what the Host does not report', () => {
    expect(statusLines(plain, { ...facts, running: false, queued: 0 }, () => undefined)).toEqual([
      'Untitled session', 'Session     3f9a0c1e', 'Directory   ~/app', 'State       idle',
    ])
  })

  it('falls back to what an older projection holds', () => {
    const values: Record<string, unknown> = {
      title: '',
      modelSelection: { lastUsed: { model: 'only-model' } },
      plan: { active: false },
      contextPressure: { pressureTokens: 800 },
      tokenUsage: {},
    }
    const lines = statusLines(plain, { ...facts, queued: 0 }, key => values[key])
    expect(lines).toContain('Untitled session')
    expect(lines).toContain('Model       only-model')
    expect(lines).toContain('Plan mode   off')
    expect(lines).toContain('Context     800')
    expect(lines).toContain('Tokens      input 0 · cached 0 · output 0')
    expect(statusLines(plain, facts, key => key === 'modelSelection' ? { next: { model: 'm' } } : undefined)).toContain('Model       m')
    expect(statusLines(plain, facts, key => key === 'modelSelection' ? { next: {} } : undefined).some(line => line.startsWith('Model'))).toBe(false)
  })
})
