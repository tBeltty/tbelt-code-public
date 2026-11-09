/** Path safety, copy budget, porcelain parsing, base-ref qualification, and branch names. */
import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { qualifyBaseRef } from '../src/base-ref.ts'
import { MAX_BRANCH_NAME_WORDS, sanitizeBranchSlug } from '../src/branch-name.ts'
import { createCopyBudgetTracker, formatSkippedCopyWarning } from '../src/copy-budget.ts'
import { parseWorktreeList } from '../src/porcelain.ts'
import { safeRelativePath } from '../src/safe-path.ts'
import { blockingEntries } from '../src/worktrees.ts'
import { put, scratchDir } from './support.ts'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups.length = 0
})

describe('safeRelativePath', () => {
  it.each([
    ['node_modules', 'node_modules'],
    ['/apps/web/.env', 'apps/web/.env'],
    ['\\apps\\web', 'apps\\web'],
    ['  .env  ', '.env'],
  ])('accepts %j as %j', (raw, rel) => {
    expect(safeRelativePath(raw)).toEqual({ safe: true, rel })
  })

  it.each(['', '  ', '/', '../escape', 'a/../../b', 'a\\..\\b', 'C:foo', 'c:\\x', '\\..\\x'])('refuses %j', (raw) => {
    expect(safeRelativePath(raw)).toEqual({ safe: false })
  })
})

describe('createCopyBudgetTracker', () => {
  it('admits entries until bytes run out and refuses an over-budget entry without consuming budget', async () => {
    const dir = await scratchDir('dsh-budget-', cleanups)
    await put(join(dir, 'a', 'one'), 'x'.repeat(60))
    await put(join(dir, 'b', 'two'), 'x'.repeat(60))
    await put(join(dir, 'c', 'three'), 'x'.repeat(10))
    const tracker = createCopyBudgetTracker({ maxBytes: 100, maxEntries: 100 })
    expect(await tracker.admit(join(dir, 'a'))).toEqual({ withinBudget: true, bytes: 60, entries: 2 })
    expect(await tracker.admit(join(dir, 'b'))).toEqual({ withinBudget: false, reason: 'bytes' })
    expect(await tracker.admit(join(dir, 'c'))).toEqual({ withinBudget: true, bytes: 10, entries: 2 })
  })

  it('refuses by entry count and counts symlinks as one entry without following them', async () => {
    const dir = await scratchDir('dsh-budget-', cleanups)
    for (const name of ['1', '2', '3']) await put(join(dir, 'many', name), 'x')
    await mkdir(join(dir, 'linked'))
    await symlink(join(dir, 'many'), join(dir, 'linked', 'loop'))
    const tracker = createCopyBudgetTracker({ maxBytes: 1_000, maxEntries: 3 })
    expect(await tracker.admit(join(dir, 'many'))).toEqual({ withinBudget: false, reason: 'entries' })
    expect(await tracker.admit(join(dir, 'linked'))).toEqual({ withinBudget: true, bytes: 0, entries: 2 })
  })

  it('does not charge bytes for a copy-on-write clone and bills them when the clone fails', async () => {
    const dir = await scratchDir('dsh-budget-', cleanups)
    await put(join(dir, 'big'), 'x'.repeat(500))
    const tracker = createCopyBudgetTracker({ maxBytes: 100, maxEntries: 10 })
    expect(await tracker.admit(join(dir, 'big'), { bytesAreCopied: false })).toEqual({ withinBudget: true, bytes: 500, entries: 1 })
    expect(tracker.chargeBytes(500)).toBe(false)
    expect(tracker.chargeBytes(40)).toBe(true)
    expect(tracker.chargeBytes(61)).toBe(false)
  })

  it('stops measuring after the sizing walk is spent and attributes it to sizing', async () => {
    const dir = await scratchDir('dsh-budget-', cleanups)
    for (const name of ['d1', 'd2', 'd3']) for (const file of ['1', '2', '3']) await put(join(dir, name, file), 'x')
    const tracker = createCopyBudgetTracker({ maxBytes: 1_000, maxEntries: 2 })
    // Each directory holds 4 entries: refused after walking 3, until the 10-entry walk allowance is gone.
    expect(await tracker.admit(join(dir, 'd1'))).toEqual({ withinBudget: false, reason: 'entries' })
    expect(await tracker.admit(join(dir, 'd2'))).toEqual({ withinBudget: false, reason: 'entries' })
    expect(await tracker.admit(join(dir, 'd3'))).toEqual({ withinBudget: false, reason: 'entries' })
    expect(await tracker.admit(join(dir, 'd1'))).toEqual({ withinBudget: false, reason: 'sizing' })
    expect(await tracker.admit(join(dir, 'd1'))).toEqual({ withinBudget: false, reason: 'sizing' })
  })

  it('treats a vanished or unreadable source as nothing to measure', async () => {
    const dir = await scratchDir('dsh-budget-', cleanups)
    const tracker = createCopyBudgetTracker({ maxBytes: 100, maxEntries: 10 })
    expect(await tracker.admit(join(dir, 'missing'))).toEqual({ withinBudget: true, bytes: 0, entries: 0 })
    await writeFile(join(dir, 'file'), 'abc')
    expect(await tracker.admit(join(dir, 'file'))).toEqual({ withinBudget: true, bytes: 3, entries: 1 })
  })
})

describe('formatSkippedCopyWarning', () => {
  const budget = { maxBytes: 2 * 1024 * 1024 * 1024, maxEntries: 50_000 }

  it('is undefined when nothing was skipped', () => {
    expect(formatSkippedCopyWarning([], budget)).toBeUndefined()
  })

  it('names a single over-budget entry with the byte and file limits', () => {
    expect(formatSkippedCopyWarning([{ path: 'node_modules', reason: 'bytes' }], budget)).toBe(
      'copy entry "node_modules" was not copied into the new worktree: copying it would exceed the 2 GB / 50,000 file limit that keeps worktree creation responsive. Copy it in manually if this worktree needs it.',
    )
  })

  it('lists at most five names, separates unsized and partial entries, and reports megabytes', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(path => ({ path, reason: 'entries' as const }))
    const warning = formatSkippedCopyWarning([
      ...many,
      { path: 'late', reason: 'sizing' },
      { path: 'half', reason: 'bytes', mayBePartial: true },
      { path: 'half2', reason: 'bytes', mayBePartial: true },
    ], { maxBytes: 5 * 1024 * 1024, maxEntries: 10 })
    expect(warning).toContain('copy entries "a", "b", "c", "d", "e" and 4 more were not copied into the new worktree: copying them would exceed the 5 MB / 10 file limit')
    expect(warning).toContain('copy entry "late" was not copied into the new worktree: earlier entries used up the budget for measuring what to copy.')
    expect(warning).toContain('"half", "half2" may hold a partial copy from the interrupted attempt; check them before reusing this worktree.')
    expect(warning).toMatch(/Copy them in manually if this worktree needs them\.$/)
  })

  it('leaves out the over-budget sentence when every entry was only unsized', () => {
    expect(formatSkippedCopyWarning([{ path: 'x', reason: 'sizing' }], budget)).toBe(
      'copy entry "x" was not copied into the new worktree: earlier entries used up the budget for measuring what to copy. Copy it in manually if this worktree needs it.',
    )
  })

  it('rounds a sub-megabyte ceiling up to 1 MB', () => {
    expect(formatSkippedCopyWarning([{ path: 'x', reason: 'bytes' }], { maxBytes: 100, maxEntries: 1 })).toContain('1 MB / 1 file limit')
  })
})

describe('parseWorktreeList', () => {
  it('parses NUL-delimited entries, marking the first as primary', () => {
    const output = [
      'worktree /repo', 'HEAD aaa', 'branch refs/heads/main', '',
      'worktree /repo-wt/x', 'HEAD bbb', 'branch refs/heads/x', 'locked in use', '',
      'worktree /repo-wt/gone', 'HEAD ccc', 'detached', 'prunable gitdir file points to non-existent location', 'locked', '',
      'worktree /bare', 'bare', '', '', 'HEAD orphan-without-path', '',
    ].join('\0') + '\0'
    expect(parseWorktreeList(output)).toEqual([
      { path: '/repo', head: 'aaa', branch: 'refs/heads/main', isBare: false, isMainWorktree: true, locked: false, lockReason: '', prunable: false },
      { path: '/repo-wt/x', head: 'bbb', branch: 'refs/heads/x', isBare: false, isMainWorktree: false, locked: true, lockReason: 'in use', prunable: false },
      { path: '/repo-wt/gone', head: 'ccc', branch: '', isBare: false, isMainWorktree: false, locked: true, lockReason: '', prunable: true },
      { path: '/bare', head: '', branch: '', isBare: true, isMainWorktree: false, locked: false, lockReason: '', prunable: false },
    ])
  })

  it('returns nothing for empty output and flushes a final entry without a terminator', () => {
    expect(parseWorktreeList('')).toEqual([])
    expect(parseWorktreeList('worktree /a\0HEAD x')).toHaveLength(1)
  })
})

describe('qualifyBaseRef', () => {
  const exists = (known: string[]) => (ref: string) => Promise.resolve(known.includes(ref))

  it('keeps a fully qualified ref', async () => {
    expect(await qualifyBaseRef('refs/tags/v1', exists([]))).toBe('refs/tags/v1')
  })

  it('prefers a remote-tracking ref for a slashed name, then a local branch, then the name itself', async () => {
    expect(await qualifyBaseRef('origin/main', exists(['refs/remotes/origin/main', 'refs/heads/origin/main']))).toBe('refs/remotes/origin/main')
    expect(await qualifyBaseRef('feature/x', exists(['refs/heads/feature/x']))).toBe('refs/heads/feature/x')
    expect(await qualifyBaseRef('main', exists(['refs/heads/main']))).toBe('refs/heads/main')
    expect(await qualifyBaseRef('abc1234', exists([]))).toBe('abc1234')
  })
})

describe('sanitizeBranchSlug', () => {
  it('lowercases, joins words with dashes, and keeps a bounded number of words', () => {
    expect(sanitizeBranchSlug('Fix the Login  bug!')).toBe('fix-the-login-bug')
    expect(sanitizeBranchSlug('a b c d e f g h')).toBe('a-b-c-d-e-f')
    expect(sanitizeBranchSlug('a b c d', 2)).toBe('a-b')
    expect(sanitizeBranchSlug('---')).toBe('')
    expect(MAX_BRANCH_NAME_WORDS).toBe(6)
  })
})

describe('blockingEntries', () => {
  it('drops untracked shared links, spelled with either separator, and keeps everything else', () => {
    expect(blockingEntries(['?? node_modules', '?? apps/web/cache/', '?? new.txt', ' M tracked.ts', '?? ../x'], ['node_modules/', '\\apps\\web\\cache', '../x', '']))
      .toEqual(['?? new.txt', ' M tracked.ts', '?? ../x'])
  })
})
