/** Shared and copied path materialization, the macOS clone path, and shared-link removal. */
import { chmod, copyFile, cp, lstat, mkdir, readFile, readlink, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApfsCloneUnavailableError, LinkedPathTargetExistsError, cloneWorktreePathWithApfs } from '../src/apfs-clone.ts'
import type { ApfsCloneDeps, RunCommand } from '../src/apfs-clone.ts'
import { materializePaths, removeSharedLinks, symlinkTypeCandidates } from '../src/linked-paths.ts'
import type { MaterializeOptions } from '../src/linked-paths.ts'
import { put, scratchDir } from './support.ts'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups.length = 0
})

const never: RunCommand = () => Promise.reject(new Error('no command expected'))

function options(overrides: Partial<MaterializeOptions> = {}, warnings: string[] = []): MaterializeOptions {
  return {
    platform: 'linux',
    apfsCloneDeps: { run: never, randomUUID: () => 'uuid', deviceOf: () => Promise.resolve(1) },
    copyBudget: { maxBytes: 1_000_000, maxEntries: 1_000 },
    warn: (message) => { warnings.push(message) },
    ...overrides,
  }
}

async function pair(): Promise<{ primary: string; worktree: string }> {
  const root = await scratchDir('dsh-linked-', cleanups)
  const primary = join(root, 'primary')
  const worktree = join(root, 'worktree')
  await mkdir(primary)
  await mkdir(worktree)
  return { primary, worktree }
}

describe('symlinkTypeCandidates', () => {
  it('tries a junction before a directory symlink on Windows and a plain type elsewhere', () => {
    expect(symlinkTypeCandidates('win32', true)).toEqual(['junction', 'dir'])
    expect(symlinkTypeCandidates('linux', true)).toEqual(['dir'])
    expect(symlinkTypeCandidates('win32', false)).toEqual(['file'])
  })
})

describe('materializePaths in share mode', () => {
  it('symlinks files and directories at the same relative place, creating parents', async () => {
    const { primary, worktree } = await pair()
    await put(join(primary, 'node_modules', 'dep', 'index.js'), 'dep')
    await put(join(primary, 'apps', 'web', '.env'), 'E=1')
    const warnings: string[] = []
    const skipped = await materializePaths(primary, worktree, ['node_modules', 'apps/web/.env'], 'share', options({}, warnings))
    expect(skipped).toEqual([])
    expect(warnings).toEqual([])
    expect(await readlink(join(worktree, 'node_modules'))).toBe(join(primary, 'node_modules'))
    expect(await readlink(join(worktree, 'apps', 'web', '.env'))).toBe(join(primary, 'apps', 'web', '.env'))
  })

  it('skips unsafe paths with a report, missing sources silently, and anything already in the worktree', async () => {
    const { primary, worktree } = await pair()
    await put(join(primary, 'present'), 'p')
    await put(join(worktree, 'present'), 'mine')
    await symlink(join(primary, 'nowhere'), join(worktree, 'dangling'))
    await put(join(primary, 'dangling'), 'd')
    const warnings: string[] = []
    await materializePaths(primary, worktree, ['../escape', 'missing', 'present', 'dangling'], 'share', options({}, warnings))
    expect(warnings).toEqual(['Skipping unsafe worktree path "../escape"'])
    expect(await readFile(join(worktree, 'present'), 'utf8')).toBe('mine')
    expect(await readlink(join(worktree, 'dangling'))).toBe(join(primary, 'nowhere'))
  })

  it('reports a source it cannot inspect and a link it cannot create, and continues', async () => {
    const { primary, worktree } = await pair()
    await put(join(primary, 'ok'), 'ok')
    await put(join(worktree, 'plain-file'), 'in the way')
    await put(join(primary, 'plain-file', 'child'), 'c')
    const warnings: string[] = []
    // `plain-file/child` cannot be linked because its parent in the worktree is a regular file.
    await materializePaths(primary, worktree, ['plain-file/child', 'ok'], 'share', options({}, warnings))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Failed to link "plain-file/child"')
    expect(await readlink(join(worktree, 'ok'))).toBe(join(primary, 'ok'))
  })

  it('reports a source whose inspection fails for a reason other than absence', async () => {
    const { primary, worktree } = await pair()
    const warnings: string[] = []
    // A NUL byte in the path makes lstat throw ERR_INVALID_ARG_VALUE, not ENOENT.
    await materializePaths(primary, worktree, ['bad\0name'], 'share', options({}, warnings))
    expect(warnings[0]).toContain('Failed to inspect "bad\0name"')
  })

  it('falls back from a junction to a directory symlink on Windows, and reports when every type fails', async () => {
    const { primary, worktree } = await pair()
    await mkdir(join(primary, 'dir'))
    await mkdir(join(primary, 'other'))
    const attempts: string[] = []
    const privileged = (type: 'junction' | 'dir' | 'file', failing: string[]) => {
      attempts.push(type)
      return failing.includes(type) ? Promise.reject(new Error(`EPERM ${type}`)) : Promise.resolve()
    }
    const warnings: string[] = []
    await materializePaths(primary, worktree, ['dir'], 'share', options({ platform: 'win32', symlink: (_s, _t, type) => privileged(type, ['junction']) }, warnings))
    expect(attempts).toEqual(['junction', 'dir'])
    expect(warnings).toEqual([])
    await materializePaths(primary, worktree, ['other'], 'share', options({ platform: 'win32', symlink: (_s, _t, type) => privileged(type, ['junction', 'dir']) }, warnings))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Failed to link "other"')
    expect(warnings[0]).toContain('EPERM dir')
  })
})

describe('materializePaths in copy mode', () => {
  it('copies files and directories privately and resolves a symlinked source to its content', async () => {
    const { primary, worktree } = await pair()
    await put(join(primary, '.env'), 'E=1')
    await put(join(primary, 'conf', 'a.json'), '{}')
    await put(join(primary, 'real.txt'), 'real')
    await symlink(join(primary, 'real.txt'), join(primary, 'alias.txt'))
    const skipped = await materializePaths(primary, worktree, ['.env', 'conf', 'alias.txt'], 'copy', options())
    expect(skipped).toEqual([])
    expect(await readFile(join(worktree, 'conf', 'a.json'), 'utf8')).toBe('{}')
    expect((await lstat(join(worktree, 'alias.txt'))).isSymbolicLink()).toBe(false)
    expect(await readFile(join(worktree, 'alias.txt'), 'utf8')).toBe('real')
  })

  it('refuses entries over the budget before writing anything', async () => {
    const { primary, worktree } = await pair()
    await put(join(primary, 'big', 'blob'), 'x'.repeat(500))
    await put(join(primary, 'small'), 'x')
    const skipped = await materializePaths(primary, worktree, ['big', 'small'], 'copy', options({ copyBudget: { maxBytes: 100, maxEntries: 100 } }))
    expect(skipped).toEqual([{ path: 'big', reason: 'bytes' }])
    await expect(lstat(join(worktree, 'big'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(worktree, 'small'), 'utf8')).toBe('x')
  })

  it('reports a copy that fails and continues with the next path', async () => {
    const { primary, worktree } = await pair()
    await put(join(primary, 'plain-file', 'child'), 'c')
    await put(join(worktree, 'plain-file'), 'in the way')
    await put(join(primary, 'ok'), 'ok')
    const warnings: string[] = []
    await materializePaths(primary, worktree, ['plain-file/child', 'ok'], 'copy', options({}, warnings))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Failed to copy "plain-file/child"')
    expect(await readFile(join(worktree, 'ok'), 'utf8')).toBe('ok')
  })

  it('uses the injected clone on macOS, charging no bytes for it', async () => {
    const { primary, worktree } = await pair()
    await put(join(primary, 'big'), 'x'.repeat(500))
    const clone = vi.fn((source: string, target: string) => copyFile(source, target))
    const skipped = await materializePaths(primary, worktree, ['big'], 'copy', options({ platform: 'darwin', cloneWorktreePath: clone, copyBudget: { maxBytes: 10, maxEntries: 10 } }))
    expect(skipped).toEqual([])
    expect(clone).toHaveBeenCalledWith(join(primary, 'big'), join(worktree, 'big'), false)
    expect(await readFile(join(worktree, 'big'), 'utf8')).toBe('x'.repeat(500))
  })

  it('leaves a target that appeared during the clone and falls back to a real copy when the clone is unavailable', async () => {
    const { primary, worktree } = await pair()
    await put(join(primary, 'raced'), 'r')
    await put(join(primary, 'unavailable'), 'u')
    const clone = vi.fn((_source: string, target: string) => {
      if (target.endsWith('raced')) return Promise.reject(new LinkedPathTargetExistsError(target))
      return Promise.reject(new ApfsCloneUnavailableError('other volume'))
    })
    const skipped = await materializePaths(primary, worktree, ['raced', 'unavailable'], 'copy', options({ platform: 'darwin', cloneWorktreePath: clone }))
    expect(skipped).toEqual([])
    await expect(lstat(join(worktree, 'raced'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(worktree, 'unavailable'), 'utf8')).toBe('u')
  })

  it('bills a failed clone as a real copy and refuses it, marking directories possibly partial, when it no longer fits', async () => {
    const { primary, worktree } = await pair()
    await put(join(primary, 'dir', 'blob'), 'x'.repeat(500))
    await put(join(primary, 'file'), 'x'.repeat(500))
    await put(join(primary, 'fits'), 'x')
    const clone = vi.fn(() => Promise.reject(new Error('clone exploded')))
    const warnings: string[] = []
    const skipped = await materializePaths(primary, worktree, ['dir', 'file', 'fits'], 'copy', options({ platform: 'darwin', cloneWorktreePath: clone, copyBudget: { maxBytes: 100, maxEntries: 100 } }, warnings))
    expect(skipped).toEqual([{ path: 'dir', reason: 'bytes', mayBePartial: true }, { path: 'file', reason: 'bytes' }])
    expect(warnings).toHaveLength(3)
    expect(warnings[0]).toContain('APFS clone-copy unavailable')
    expect(await readFile(join(worktree, 'fits'), 'utf8')).toBe('x')
  })

  it('probes the real volume on macOS when no clone is injected and copies when the probe says no', async () => {
    const { primary, worktree } = await pair()
    await put(join(primary, 'f'), 'f')
    const run = vi.fn<RunCommand>(() => Promise.reject(new Error('df unavailable')))
    const skipped = await materializePaths(primary, worktree, ['f'], 'copy', options({ platform: 'darwin', apfsCloneDeps: { run, randomUUID: () => 'u', deviceOf } }))
    expect(skipped).toEqual([])
    expect(run).toHaveBeenCalled()
    expect(await readFile(join(worktree, 'f'), 'utf8')).toBe('f')
  })
})

/** A command runner that emulates `df`, `diskutil`, and macOS `cp -c` with portable filesystem calls. */
/** Every path is on device 1 unless `deviceOf` says otherwise. */
const deviceOf = (): Promise<number> => Promise.resolve(1)

function fakeMac(filesystem: string, device = '/dev/disk1s1'): { deps: ApfsCloneDeps; calls: string[][] } {
  const calls: string[][] = []
  const run: RunCommand = async (argv) => {
    calls.push([...argv])
    const [program, ...args] = argv
    if (program === '/bin/df') return { stdout: `Filesystem 512-blocks Used Available Capacity Mounted on\n${device} 1 1 1 1% /\n` }
    if (program === '/usr/sbin/diskutil') return { stdout: `<dict><key>FilesystemName</key>\n<string>${filesystem}</string></dict>` }
    if (args.join(' ').includes('-R')) {
      const source = (args.at(-2) as string).replace(/\/\.$/, '')
      await cp(source, args.at(-1) as string, { recursive: true, force: false })
    } else {
      await copyFile(args.at(-2) as string, args.at(-1) as string)
    }
    return { stdout: '' }
  }
  return { deps: { run, randomUUID: () => 'fixed', deviceOf }, calls }
}

describe('cloneWorktreePathWithApfs', () => {
  it('clones a file through a temporary name published with a hard link, probing each device once', async () => {
    const { primary, worktree } = await pair()
    await put(join(primary, 'a.txt'), 'a')
    await put(join(primary, 'b.txt'), 'b')
    const { deps, calls } = fakeMac('APFS')
    const cache = new Map()
    await cloneWorktreePathWithApfs(join(primary, 'a.txt'), join(worktree, 'a.txt'), false, deps, cache)
    await cloneWorktreePathWithApfs(join(primary, 'b.txt'), join(worktree, 'b.txt'), false, deps, cache)
    expect(await readFile(join(worktree, 'a.txt'), 'utf8')).toBe('a')
    expect(calls.filter(call => call[0] === '/bin/df')).toHaveLength(1)
    await expect(lstat(join(worktree, '.dsh-apfs-clone-fixed'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('clones a directory into a reserved target and keeps its mode', async () => {
    const { primary, worktree } = await pair()
    await put(join(primary, 'dir', 'nested', 'x'), 'x')
    await chmod(join(primary, 'dir'), 0o750)
    await cloneWorktreePathWithApfs(join(primary, 'dir'), join(worktree, 'dir'), true, fakeMac('APFS').deps, new Map())
    expect(await readFile(join(worktree, 'dir', 'nested', 'x'), 'utf8')).toBe('x')
    expect((await lstat(join(worktree, 'dir'))).mode & 0o777).toBe(0o750)
  })

  it('refuses a different or non-APFS volume', async () => {
    const { primary, worktree } = await pair()
    await put(join(primary, 'a'), 'a')
    await expect(cloneWorktreePathWithApfs(join(primary, 'a'), join(worktree, 'a'), false, fakeMac('HFS+').deps, new Map())).rejects.toBeInstanceOf(ApfsCloneUnavailableError)
    const mac = fakeMac('APFS').deps
    const split: ApfsCloneDeps = { ...mac, deviceOf: path => Promise.resolve(path.startsWith(primary) ? 1 : 2), run: argv => (argv[0] === '/bin/df'
      ? Promise.resolve({ stdout: `h\n${String(argv[2]).startsWith(primary) ? '/dev/disk1' : '/dev/disk2'} 1 1 1 1% /\n` })
      : mac.run(argv)) }
    await expect(cloneWorktreePathWithApfs(join(primary, 'a'), join(worktree, 'a'), false, split, new Map())).rejects.toBeInstanceOf(ApfsCloneUnavailableError)
  })

  it('reports a target that exists, for a file and for a directory, and keeps what it found', async () => {
    const { primary, worktree } = await pair()
    await put(join(primary, 'f'), 'f')
    await put(join(worktree, 'f'), 'mine')
    await mkdir(join(primary, 'd'))
    await mkdir(join(worktree, 'd'))
    const { deps } = fakeMac('APFS')
    await expect(cloneWorktreePathWithApfs(join(primary, 'f'), join(worktree, 'f'), false, deps, new Map())).rejects.toBeInstanceOf(LinkedPathTargetExistsError)
    await expect(cloneWorktreePathWithApfs(join(primary, 'd'), join(worktree, 'd'), true, deps, new Map())).rejects.toBeInstanceOf(LinkedPathTargetExistsError)
    expect(await readFile(join(worktree, 'f'), 'utf8')).toBe('mine')
  })

  it('propagates unexpected failures and removes only the empty directory reservation', async () => {
    const { primary, worktree } = await pair()
    await mkdir(join(primary, 'd'))
    await put(join(primary, 'f'), 'f')
    const base = fakeMac('APFS').deps
    const failing: ApfsCloneDeps = { randomUUID: base.randomUUID, deviceOf, run: argv => (argv[0] === '/bin/cp' ? Promise.reject(new Error('cp exploded')) : base.run(argv)) }
    await expect(cloneWorktreePathWithApfs(join(primary, 'd'), join(worktree, 'd'), true, failing, new Map())).rejects.toThrow('cp exploded')
    await expect(lstat(join(worktree, 'd'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(cloneWorktreePathWithApfs(join(primary, 'f'), join(worktree, 'f'), false, failing, new Map())).rejects.toThrow('cp exploded')
    // A mkdir failure that is not "exists" propagates unchanged.
    await expect(cloneWorktreePathWithApfs(join(primary, 'd'), join(worktree, 'x'.repeat(300)), true, base, new Map())).rejects.toMatchObject({ code: 'ENAMETOOLONG' })
  })

  it('propagates a link failure that is not "already exists"', async () => {
    const { primary, worktree } = await pair()
    await put(join(primary, 'f'), 'f')
    const base = fakeMac('APFS').deps
    // The fake cp writes into a directory that vanishes before link(2), so link fails with ENOENT.
    const run: RunCommand = async (argv) => {
      const result = await base.run(argv)
      if (argv[0] === '/bin/cp') await (await import('node:fs/promises')).rm(argv.at(-1) as string)
      return result
    }
    await expect(cloneWorktreePathWithApfs(join(primary, 'f'), join(worktree, 'f'), false, { run, randomUUID: () => 'z', deviceOf }, new Map())).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('swallows a failed cleanup so the clone error is the one reported', async () => {
    const { primary, worktree } = await pair()
    await put(join(primary, 'f'), 'f')
    await mkdir(join(primary, 'd'))
    const base = fakeMac('APFS').deps
    // The fake cp leaves a directory at the temporary name, so link(2) and then rm(2) both fail.
    const dirAtTemp: ApfsCloneDeps = { ...base, run: async (argv) => {
      if (argv[0] === '/bin/cp') await mkdir(argv.at(-1) as string)
      else return base.run(argv)
      return { stdout: '' }
    } }
    await expect(cloneWorktreePathWithApfs(join(primary, 'f'), join(worktree, 'f'), false, dirAtTemp, new Map())).rejects.toMatchObject({ code: expect.stringMatching(/EPERM|EISDIR|EEXIST/) as string })
    // A copy that wrote into the reservation leaves it for review: the empty-directory removal fails quietly.
    const partial: ApfsCloneDeps = { ...base, run: async (argv) => {
      if (argv[0] !== '/bin/cp') return base.run(argv)
      await put(join(argv.at(-1) as string, 'half'), 'h')
      throw new Error('cp exploded midway')
    } }
    await expect(cloneWorktreePathWithApfs(join(primary, 'd'), join(worktree, 'd'), true, partial, new Map())).rejects.toThrow('cp exploded midway')
    expect(await readFile(join(worktree, 'd', 'half'), 'utf8')).toBe('h')
  })

  it('reports a df listing that names no device', async () => {
    const { primary, worktree } = await pair()
    await put(join(primary, 'f'), 'f')
    const run: RunCommand = () => Promise.resolve({ stdout: 'header only\n' })
    await expect(cloneWorktreePathWithApfs(join(primary, 'f'), join(worktree, 'f'), false, { run, randomUUID: () => 'u', deviceOf }, new Map())).rejects.toThrow('Could not resolve filesystem device')
  })

  it('reads a diskutil plist without a filesystem name as not APFS', async () => {
    const { primary, worktree } = await pair()
    await put(join(primary, 'f'), 'f')
    const run: RunCommand = argv => Promise.resolve({ stdout: argv[0] === '/bin/df' ? 'h\n/dev/d 1 1 1 1% /\n' : '<dict/>' })
    await expect(cloneWorktreePathWithApfs(join(primary, 'f'), join(worktree, 'f'), false, { run, randomUUID: () => 'u', deviceOf }, new Map())).rejects.toBeInstanceOf(ApfsCloneUnavailableError)
  })
})

describe('removeSharedLinks', () => {
  it('unlinks symbolic links only, leaves real files and missing paths, and reports other failures', async () => {
    const { primary, worktree } = await pair()
    await put(join(primary, 'cache', 'a'), 'a')
    await symlink(join(primary, 'cache'), join(worktree, 'cache'))
    await put(join(worktree, 'real.txt'), 'mine')
    await put(join(worktree, 'file'), 'f')
    const warnings: string[] = []
    await removeSharedLinks(worktree, ['cache', 'real.txt', 'missing', '../escape', 'file/child'], message => warnings.push(message))
    await expect(lstat(join(worktree, 'cache'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(primary, 'cache', 'a'), 'utf8')).toBe('a')
    expect(await readFile(join(worktree, 'real.txt'), 'utf8')).toBe('mine')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Failed to remove shared link "file/child"')
  })
})
