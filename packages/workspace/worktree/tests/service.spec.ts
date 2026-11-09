/** Creation, listing, change detection, and removal against real git repositories. */
import type { Config } from '../src/types.ts'
import { lstat, mkdir, readFile, readlink } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitCommandError } from '../src/git.ts'
import {
  GitUnavailableError, NotALinkedWorktreeError, NotARepositoryError, WorktreeDirtyError, WorktreeLockedError,
} from '../src/index.ts'
import { git, makeRepo, mount, put, scratchDir } from './support.ts'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups.length = 0
})

describe('create', () => {
  it('creates a worktree beside the repository on a new branch from HEAD', async () => {
    const { parent, repo } = await makeRepo(cleanups)
    const ctx = await mount({}, cleanups)
    const created = await ctx.worktrees.create({ repoPath: repo, name: 'Fix the login bug' })
    expect(created).toMatchObject({
      path: join(parent, 'app-worktrees', 'fix-the-login-bug'),
      branch: 'fix-the-login-bug',
      baseRef: 'HEAD',
      primaryPath: repo,
      warnings: [],
    })
    expect(created.head).toBe(git(repo, 'rev-parse', 'HEAD').trim())
    expect(git(created.path, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('fix-the-login-bug')
    expect(await readFile(join(created.path, 'README.md'), 'utf8')).toBe('hello\n')
  })

  it('creates from any directory inside a linked worktree and appends a suffix on a name collision', async () => {
    const { repo } = await makeRepo(cleanups)
    const ctx = await mount({ branchPrefix: 'wt/' }, cleanups)
    const first = await ctx.worktrees.create({ repoPath: repo, name: 'task' })
    const second = await ctx.worktrees.create({ repoPath: first.path, name: 'task' })
    expect(first.branch).toBe('wt/task')
    expect(second.branch).toBe('wt/task-2')
    expect(second.path).toBe(join(first.path, '..', 'task-2'))
    expect(second.primaryPath).toBe(repo)
  })

  it('names the worktree randomly when no usable name is given', async () => {
    const { repo } = await makeRepo(cleanups)
    const ctx = await mount({}, cleanups)
    expect((await ctx.worktrees.create({ repoPath: repo, name: '!!!' })).branch).toMatch(/^wt-[0-9a-f]{6}$/)
    expect((await ctx.worktrees.create({ repoPath: repo })).branch).toMatch(/^wt-[0-9a-f]{6}$/)
  })

  it('skips a name whose branch already exists even when its directory is free', async () => {
    const { repo } = await makeRepo(cleanups)
    git(repo, 'branch', 'taken')
    const ctx = await mount({}, cleanups)
    const created = await ctx.worktrees.create({ repoPath: repo, name: 'taken' })
    expect(created.branch).toBe('taken-2')
  })

  it('reports a worktree directory that cannot hold worktrees', async () => {
    const { repo } = await makeRepo(cleanups)
    const ctx = await mount({ directory: 'README.md' }, cleanups)
    await expect(ctx.worktrees.create({ repoPath: repo, name: 'x' })).rejects.toMatchObject({ code: 'ENOTDIR' })
  })

  it('probes copy volumes through helper commands on macOS and falls back to a real copy', async () => {
    const { repo } = await makeRepo(cleanups)
    await put(join(repo, '.env'), 'SECRET=1\n')
    const ctx = await mount({}, cleanups)
    // Resolve git while the host is still itself; the macOS developer-tools stub check would otherwise reject /usr/bin/git.
    await ctx.worktrees.list(repo)
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
    const created = await ctx.worktrees.create({ repoPath: repo, name: 'mac' })
    expect(await readFile(join(created.path, '.env'), 'utf8')).toBe('SECRET=1\n')
  })

  it('branches from a requested local branch, qualifying the ref', async () => {
    const { repo } = await makeRepo(cleanups)
    git(repo, 'switch', '-q', '-c', 'feature')
    await put(join(repo, 'feature.txt'), 'f\n')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', 'feature')
    git(repo, 'switch', '-q', 'main')
    const ctx = await mount({}, cleanups)
    const created = await ctx.worktrees.create({ repoPath: repo, name: 'from-feature', baseRef: 'feature' })
    expect(created.baseRef).toBe('refs/heads/feature')
    expect(await readFile(join(created.path, 'feature.txt'), 'utf8')).toBe('f\n')
  })

  it('reports git refusing an unknown base without leaving a worktree behind', async () => {
    const { repo } = await makeRepo(cleanups)
    const ctx = await mount({}, cleanups)
    await expect(ctx.worktrees.create({ repoPath: repo, name: 'x', baseRef: 'nope' })).rejects.toBeInstanceOf(GitCommandError)
    expect((await ctx.worktrees.list(repo)).map(entry => entry.path)).toEqual([repo])
  })

  it('shares and copies configured paths and runs setup commands in the new worktree', async () => {
    const { repo } = await makeRepo(cleanups)
    await put(join(repo, 'node_modules', 'dep', 'index.js'), 'dep\n')
    await put(join(repo, '.env'), 'SECRET=1\n')
    const ctx = await mount({
      sharedPaths: ['node_modules'],
      setup: [[process.execPath, '-e', "require('node:fs').writeFileSync('setup-marker', 'ran')"]],
    }, cleanups)
    const created = await ctx.worktrees.create({ repoPath: repo, name: 'prepared' })
    expect(created.warnings).toEqual([])
    expect((await lstat(join(created.path, 'node_modules'))).isSymbolicLink()).toBe(true)
    expect(await readlink(join(created.path, 'node_modules'))).toBe(join(repo, 'node_modules'))
    expect(await readFile(join(created.path, '.env'), 'utf8')).toBe('SECRET=1\n')
    expect((await lstat(join(created.path, '.env'))).isSymbolicLink()).toBe(false)
    expect(await readFile(join(created.path, 'setup-marker'), 'utf8')).toBe('ran')
  })

  it('keeps the worktree and reports a warning when a setup command fails, skipping later ones', async () => {
    const { repo } = await makeRepo(cleanups)
    const fail = [process.execPath, '-e', "console.error('boom'); process.exit(3)"]
    const later = [process.execPath, '-e', "require('node:fs').writeFileSync('later-marker', 'ran')"]
    const ctx = await mount({ setup: [fail, later] }, cleanups)
    const created = await ctx.worktrees.create({ repoPath: repo, name: 'broken-setup' })
    expect(created.warnings).toHaveLength(1)
    expect(created.warnings[0]).toContain('failed: exited 3: boom')
    await expect(lstat(join(created.path, 'later-marker'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('reports a missing setup program and a setup timeout', async () => {
    const { repo } = await makeRepo(cleanups)
    const missing = await mount({ setup: [['dsh-no-such-program-xyz']] }, cleanups)
    const first = await missing.worktrees.create({ repoPath: repo, name: 'missing-program' })
    expect(first.warnings[0]).toContain('Setup command ["dsh-no-such-program-xyz"] failed')
    const slow = await mount({ setup: [[process.execPath, '-e', 'setTimeout(() => {}, 60000)']], setupTimeoutMs: 200 }, cleanups)
    const second = await slow.worktrees.create({ repoPath: repo, name: 'slow-setup' })
    expect(second.warnings[0]).toContain('timed out after 200ms')
  })

  it('reports a setup command that exits silently, and one the caller aborted', async () => {
    const { repo } = await makeRepo(cleanups)
    const silent = await mount({ setup: [[process.execPath, '-e', 'process.exit(5)']] }, cleanups)
    expect((await silent.worktrees.create({ repoPath: repo, name: 'silent' })).warnings[0]).toMatch(/failed: exited 5$/)
    const waiting = await mount({ setup: [[process.execPath, '-e', 'setTimeout(() => {}, 60000)']] }, cleanups)
    const controller = new AbortController()
    setTimeout(() => { controller.abort() }, 300)
    const aborted = await waiting.worktrees.create({ repoPath: repo, name: 'aborted-setup', signal: controller.signal })
    expect(aborted.warnings[0]).toContain('failed: was aborted')
  })

  it('warns about copy entries the budget refused', async () => {
    const { repo } = await makeRepo(cleanups)
    await put(join(repo, '.env'), 'x'.repeat(100))
    const ctx = await mount({ copyBudget: { maxBytes: 10, maxEntries: 100 } }, cleanups)
    const created = await ctx.worktrees.create({ repoPath: repo, name: 'budget' })
    expect(created.warnings).toHaveLength(1)
    expect(created.warnings[0]).toContain('copy entry ".env" was not copied into the new worktree')
  })

  it('says the budget for measuring ran out when only unsized entries were skipped', async () => {
    const { repo } = await makeRepo(cleanups)
    for (const name of ['a', 'b', 'c', 'd']) for (const file of ['1', '2', '3', '4']) await put(join(repo, 'dir-' + name, file), 'x')
    const ctx = await mount({ copyPaths: ['dir-a', 'dir-b', 'dir-c', 'dir-d'], copyBudget: { maxBytes: 1_000, maxEntries: 2 } }, cleanups)
    const created = await ctx.worktrees.create({ repoPath: repo, name: 'sized' })
    expect(created.warnings[0]).toContain('copy entries "dir-a", "dir-b", "dir-c" were not copied')
    expect(created.warnings[0]).toContain('copy entry "dir-d" was not copied into the new worktree: earlier entries used up the budget for measuring what to copy')
  })

  it('lets a project override one field without erasing the other defaults', async () => {
    const { repo } = await makeRepo(cleanups)
    await put(join(repo, '.env'), 'E=1')
    await put(join(repo, 'cache', 'a'), 'a')
    const ctx = await mount({ sharedPaths: ['cache'], projects: [{ path: repo, branchPrefix: 'only/' }] }, cleanups)
    const created = await ctx.worktrees.create({ repoPath: repo, name: 'partial' })
    expect(created.branch).toBe('only/partial')
    expect((await lstat(join(created.path, 'cache'))).isSymbolicLink()).toBe(true)
    expect(await readFile(join(created.path, '.env'), 'utf8')).toBe('E=1')
  })

  it('applies per-project overrides to the matching repository only', async () => {
    const { parent, repo } = await makeRepo(cleanups)
    const other = await makeRepo(cleanups)
    const ctx = await mount({
      projects: [{ path: repo, directory: 'trees', branchPrefix: 'p/', baseRef: 'main', copyPaths: [] }],
    }, cleanups)
    const mine = await ctx.worktrees.create({ repoPath: repo, name: 'one' })
    expect(mine.path).toBe(join(repo, 'trees', 'one'))
    expect(mine.branch).toBe('p/one')
    expect(mine.baseRef).toBe('refs/heads/main')
    const theirs = await ctx.worktrees.create({ repoPath: other.repo, name: 'one' })
    expect(theirs.path).toBe(join(other.parent, 'app-worktrees', 'one'))
    expect(parent).not.toBe(other.parent)
  })

  it('rejects a path outside any repository and a bare repository', async () => {
    const outside = await scratchDir('dsh-worktree-outside-', cleanups)
    const ctx = await mount({}, cleanups)
    await expect(ctx.worktrees.create({ repoPath: outside })).rejects.toBeInstanceOf(NotARepositoryError)
    const { repo } = await makeRepo(cleanups)
    const bare = join(outside, 'bare.git')
    git(outside, 'clone', '-q', '--bare', repo, bare)
    await expect(ctx.worktrees.create({ repoPath: bare })).rejects.toThrow('a bare repository has no checkout')
  })

  it('cancels with the caller signal', async () => {
    const { repo } = await makeRepo(cleanups)
    const ctx = await mount({}, cleanups)
    const controller = new AbortController()
    controller.abort()
    await expect(ctx.worktrees.create({ repoPath: repo, signal: controller.signal })).rejects.toThrow('was aborted')
  })

  it('fails with GitUnavailableError when git cannot be resolved', async () => {
    const { repo } = await makeRepo(cleanups)
    const ctx = await mount({}, cleanups)
    const original = process.env.PATH
    process.env.PATH = '/nonexistent'
    try {
      await expect(ctx.worktrees.list(repo)).rejects.toBeInstanceOf(GitUnavailableError)
    } finally {
      process.env.PATH = original
    }
  })
})

describe('list and uncommittedChanges', () => {
  it('lists the primary checkout first and reports branches', async () => {
    const { repo } = await makeRepo(cleanups)
    const ctx = await mount({}, cleanups)
    const created = await ctx.worktrees.create({ repoPath: repo, name: 'listed' })
    git(created.path, 'checkout', '-q', '--detach')
    const listed = await ctx.worktrees.list(created.path)
    expect(listed.map(entry => [entry.path, entry.branch, entry.isPrimary])).toEqual([[repo, 'main', true], [created.path, undefined, false]])
    expect(listed[1]).not.toHaveProperty('branch')
  })

  it('names dirty entries and ignores the shared links', async () => {
    const { repo } = await makeRepo(cleanups)
    await mkdir(join(repo, 'cache'))
    await put(join(repo, 'cache', 'a'), 'a')
    const ctx = await mount({ sharedPaths: ['cache'] }, cleanups)
    const created = await ctx.worktrees.create({ repoPath: repo, name: 'dirty' })
    expect(await ctx.worktrees.uncommittedChanges(created.path)).toEqual([])
    await put(join(created.path, 'new.txt'), 'n')
    expect(await ctx.worktrees.uncommittedChanges(created.path)).toEqual(['?? new.txt'])
  })
})

describe('remove', () => {
  it('removes a clean worktree and deletes its merged branch', async () => {
    const { repo } = await makeRepo(cleanups)
    const ctx = await mount({}, cleanups)
    const created = await ctx.worktrees.create({ repoPath: repo, name: 'done' })
    expect(await ctx.worktrees.remove({ path: created.path })).toEqual({ branch: 'done', branchDeleted: true })
    await expect(lstat(created.path)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(git(repo, 'branch', '--list', 'done').trim()).toBe('')
  })

  it('keeps a branch with unmerged commits and one the caller asked to keep', async () => {
    const { repo } = await makeRepo(cleanups)
    const ctx = await mount({}, cleanups)
    const unmerged = await ctx.worktrees.create({ repoPath: repo, name: 'unmerged' })
    await put(join(unmerged.path, 'work.txt'), 'w')
    git(unmerged.path, 'add', '-A')
    git(unmerged.path, 'commit', '-q', '-m', 'work')
    expect(await ctx.worktrees.remove({ path: unmerged.path })).toEqual({ branch: 'unmerged', branchDeleted: false })
    expect(git(repo, 'branch', '--list', 'unmerged')).toContain('unmerged')
    const kept = await ctx.worktrees.create({ repoPath: repo, name: 'kept' })
    expect(await ctx.worktrees.remove({ path: kept.path, keepBranch: true })).toEqual({ branch: 'kept', branchDeleted: false })
  })

  it('removes the shared links so a clean worktree needs no force', async () => {
    const { repo } = await makeRepo(cleanups)
    await mkdir(join(repo, 'cache'))
    await put(join(repo, 'cache', 'a'), 'a')
    await mkdir(join(repo, 'real'))
    const ctx = await mount({ sharedPaths: ['cache', 'real', 'missing'] }, cleanups)
    const created = await ctx.worktrees.create({ repoPath: repo, name: 'linked' })
    expect(created.warnings).toEqual([])
    await expect(ctx.worktrees.remove({ path: created.path })).resolves.toMatchObject({ branchDeleted: true })
    expect((await lstat(join(repo, 'cache'))).isDirectory()).toBe(true)
  })

  it('refuses a dirty worktree unless forced', async () => {
    const { repo } = await makeRepo(cleanups)
    const ctx = await mount({}, cleanups)
    const created = await ctx.worktrees.create({ repoPath: repo, name: 'wip' })
    await put(join(created.path, 'wip.txt'), 'w')
    const failure = await ctx.worktrees.remove({ path: created.path }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(WorktreeDirtyError)
    expect((failure as WorktreeDirtyError).entries).toEqual(['?? wip.txt'])
    expect((await lstat(created.path)).isDirectory()).toBe(true)
    await ctx.worktrees.remove({ path: created.path, force: true })
    await expect(lstat(created.path)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses the primary checkout, a non-worktree directory, and a locked worktree', async () => {
    const { repo } = await makeRepo(cleanups)
    const ctx = await mount({}, cleanups)
    await expect(ctx.worktrees.remove({ path: repo })).rejects.toBeInstanceOf(NotALinkedWorktreeError)
    await expect(ctx.worktrees.remove({ path: join(repo, 'missing'), repoPath: repo })).rejects.toBeInstanceOf(NotALinkedWorktreeError)
    const created = await ctx.worktrees.create({ repoPath: repo, name: 'locked' })
    git(repo, 'worktree', 'lock', '--reason', 'in use', created.path)
    await expect(ctx.worktrees.remove({ path: created.path })).rejects.toThrow('is locked: in use')
    await expect(ctx.worktrees.remove({ path: created.path })).rejects.toBeInstanceOf(WorktreeLockedError)
    const bare = await ctx.worktrees.create({ repoPath: repo, name: 'locked-bare' })
    git(repo, 'worktree', 'lock', bare.path)
    await expect(ctx.worktrees.remove({ path: bare.path })).rejects.toThrow(/is locked$/)
  })

  it('reports a shared link it cannot remove and still removes the worktree', async () => {
    const { repo } = await makeRepo(cleanups)
    await put(join(repo, 'file'), 'f')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', 'file')
    const ctx = await mount({ sharedPaths: ['file/child'] }, cleanups)
    const created = await ctx.worktrees.create({ repoPath: repo, name: 'odd-link' })
    expect(created.warnings).toHaveLength(1)
    await expect(ctx.worktrees.remove({ path: created.path })).resolves.toMatchObject({ branchDeleted: true })
  })

  it('finishes a removal whose directory is already gone', async () => {
    const { repo } = await makeRepo(cleanups)
    const ctx = await mount({}, cleanups)
    const created = await ctx.worktrees.create({ repoPath: repo, name: 'gone' })
    const { rm } = await import('node:fs/promises')
    await rm(created.path, { recursive: true, force: true })
    expect((await ctx.worktrees.list(repo)).find(entry => entry.path === created.path)?.prunable).toBe(true)
    expect(await ctx.worktrees.remove({ path: created.path, repoPath: repo })).toEqual({ branch: 'gone', branchDeleted: true })
    expect((await ctx.worktrees.list(repo)).map(entry => entry.path)).toEqual([repo])
  })

  it('removes a detached worktree without a branch', async () => {
    const { repo } = await makeRepo(cleanups)
    const ctx = await mount({}, cleanups)
    const created = await ctx.worktrees.create({ repoPath: repo, name: 'detached' })
    git(created.path, 'checkout', '-q', '--detach')
    expect(await ctx.worktrees.remove({ path: created.path })).toEqual({ branchDeleted: false })
  })
})

describe('configuration', () => {
  it.each([
    [{ directory: ' ' }, 'directory must not be empty'],
    [{ baseRef: '' }, 'baseRef must not be empty'],
    [{ sharedPaths: ['../up'] }, 'sharedPaths entry "../up" must be a repository-relative path'],
    [{ copyPaths: ['C:foo'] }, 'copyPaths entry "C:foo" must be a repository-relative path'],
    [{ setup: [[]] }, 'setup commands need a program name'],
    [{ timeoutMs: 0 }, 'timeoutMs must be a positive integer'],
    [{ copyBudget: { maxBytes: 0, maxEntries: 1 } }, 'copyBudget.maxBytes must be a positive integer'],
    [{ projects: [{ path: 'relative' }] }, 'project path "relative" must be absolute'],
    [{ projects: [{ path: '/abs', setup: [['']] }] }, 'project "/abs": setup commands need a program name'],
  ])('rejects %j at load', async (config, message) => {
    const ctx = new (await import('@deepseek-ai/cordis')).Context()
    cleanups.push(() => ctx.fiber.dispose())
    await ctx.plugin((await import('@deepseek-ai/dsh-subprocess-local')).default)
    await expect(ctx.plugin((await import('../src/index.ts')).default, config as Config)).rejects.toThrow(message)
  })
})
