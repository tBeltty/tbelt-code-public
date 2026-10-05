/** The directories the sandbox may grant to a linked worktree, and the forgeries it must refuse. */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { linkedWorktreeWritableRoots } from '../src/git-dirs.ts'
import { git, makeRepo, put, scratchDir } from './support.ts'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups.length = 0
})

/** A repository with one linked worktree, plus the private git directory git made for it. */
async function linked(): Promise<{ repo: string; worktree: string; privateDir: string }> {
  const { parent, repo } = await makeRepo(cleanups)
  const worktree = join(parent, 'wt')
  git(repo, 'worktree', 'add', '-q', '-b', 'topic', worktree)
  return { repo, worktree, privateDir: join(repo, '.git', 'worktrees', 'wt') }
}

describe('linkedWorktreeWritableRoots', () => {
  it('grants the private git directory and the shared objects, refs, and logs, never hooks or config', async () => {
    const { repo, worktree, privateDir } = await linked()
    const roots = linkedWorktreeWritableRoots(worktree)
    expect(roots).toEqual([privateDir, join(repo, '.git', 'objects'), join(repo, '.git', 'refs'), join(repo, '.git', 'logs')])
    expect(roots.some(root => /hooks|config/.test(root))).toBe(false)
  })

  it('omits shared directories that do not exist yet', async () => {
    const { repo, worktree, privateDir } = await linked()
    await rm(join(repo, '.git', 'logs'), { recursive: true, force: true })
    expect(linkedWorktreeWritableRoots(worktree)).toEqual([privateDir, join(repo, '.git', 'objects'), join(repo, '.git', 'refs')])
  })

  it('lets a confined git commit succeed through exactly those roots', async () => {
    const { worktree } = await linked()
    await put(join(worktree, 'new.txt'), 'n')
    git(worktree, 'add', '-A')
    git(worktree, 'commit', '-q', '-m', 'in worktree')
    expect(git(worktree, 'log', '-1', '--format=%s').trim()).toBe('in worktree')
  })

  it('grants nothing for a primary checkout, a plain directory, or a missing directory', async () => {
    const { repo } = await makeRepo(cleanups)
    expect(linkedWorktreeWritableRoots(repo)).toEqual([])
    const plain = await scratchDir('dsh-plain-', cleanups)
    expect(linkedWorktreeWritableRoots(plain)).toEqual([])
    expect(linkedWorktreeWritableRoots(join(plain, 'missing'))).toEqual([])
  })

  it('grants nothing when the .git file does not name a gitdir or names an unresolvable one', async () => {
    const dir = await scratchDir('dsh-forged-', cleanups)
    await writeFile(join(dir, '.git'), 'something else\n')
    expect(linkedWorktreeWritableRoots(dir)).toEqual([])
    await writeFile(join(dir, '.git'), 'gitdir: /nonexistent/worktrees/x\n')
    expect(linkedWorktreeWritableRoots(dir)).toEqual([])
  })

  it('refuses a .git file a model wrote to point at a directory it does not own', async () => {
    const victim = await scratchDir('dsh-victim-', cleanups)
    await mkdir(join(victim, 'objects'))
    await mkdir(join(victim, 'refs'))
    const dir = await scratchDir('dsh-forged-', cleanups)
    // Not under a `worktrees` directory.
    await writeFile(join(dir, '.git'), `gitdir: ${victim}\n`)
    expect(linkedWorktreeWritableRoots(dir)).toEqual([])
    // Under `worktrees` but without the metadata git writes.
    await mkdir(join(victim, 'worktrees', 'x'), { recursive: true })
    await writeFile(join(dir, '.git'), `gitdir: ${join(victim, 'worktrees', 'x')}\n`)
    expect(linkedWorktreeWritableRoots(dir)).toEqual([])
    // A commondir that names another directory.
    await writeFile(join(victim, 'worktrees', 'x', 'commondir'), '/tmp\n')
    expect(linkedWorktreeWritableRoots(dir)).toEqual([])
    // A correct commondir, but no back-link to this checkout.
    await writeFile(join(victim, 'worktrees', 'x', 'commondir'), '../..\n')
    expect(linkedWorktreeWritableRoots(dir)).toEqual([])
    // A back-link to some other checkout.
    await writeFile(join(victim, 'worktrees', 'x', 'gitdir'), '/somewhere/else/.git\n')
    expect(linkedWorktreeWritableRoots(dir)).toEqual([])
  })

  it('accepts relative gitdir and absolute commondir spellings', async () => {
    const { repo, worktree, privateDir } = await linked()
    const relative = join('..', 'app', '.git', 'worktrees', 'wt')
    await writeFile(join(worktree, '.git'), `gitdir: ${relative}\n`)
    await writeFile(join(privateDir, 'commondir'), `${join(repo, '.git')}\n`)
    expect(await readFile(join(worktree, '.git'), 'utf8')).toContain(relative)
    expect(linkedWorktreeWritableRoots(worktree)).toEqual([privateDir, join(repo, '.git', 'objects'), join(repo, '.git', 'refs'), join(repo, '.git', 'logs')])
  })
})
