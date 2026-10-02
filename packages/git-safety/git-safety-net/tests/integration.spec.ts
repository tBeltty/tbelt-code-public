/**
 * Real-composition coverage: a real Cordis context over `@deepseek-ai/dsh-fs-local`, driving the
 * actual `fs/edit-intent` waterfall against a real temporary git repository (no mocked git). The
 * mandatory negative control is `records a checkpoint without touching HEAD, the index, or the
 * working tree`: it captures `git rev-parse HEAD` and `git status --porcelain` immediately before
 * and after the checkpoint fires and asserts byte-identical output.
 */

import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import * as FsPolicy from '@deepseek-ai/dsh-fs-observation-policy'
import * as GitSafetyNet from '@deepseek-ai/dsh-git-safety-net'
import { CHECKPOINT_REF } from '@deepseek-ai/dsh-git-safety-net'

const contexts: Context[] = []
const roots: string[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

/** Run one `git` command synchronously in `cwd` and return trimmed stdout; throws on nonzero exit. */
function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed (${String(result.status)}): ${result.stderr}`)
  }
  return result.stdout.replace(/\n$/, '')
}

async function setupGitRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-git-safety-net-'))
  roots.push(root)
  git(root, ['init', '-q'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'user.name', 'Test'])
  await writeFile(join(root, 'tracked.txt'), 'original\n')
  git(root, ['add', 'tracked.txt'])
  git(root, ['commit', '-q', '-m', 'initial'])
  return root
}

async function setupContext(root: string): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LocalFileSystem, { cwd: root })
  await ctx.plugin(GitSafetyNet)
  return ctx
}

describe('git-safety-net integration', () => {
  it('records a checkpoint without touching HEAD, the index, or the working tree', async () => {
    const root = await setupGitRepo()
    const ctx = await setupContext(root)
    const filePath = join(root, 'tracked.txt')
    const target = await ctx.fs.resolve(filePath)

    const headBefore = git(root, ['rev-parse', 'HEAD'])
    const statusBefore = git(root, ['status', '--porcelain'])

    // The negative control: drive only the edit-intent waterfall (the git-safety-net's own
    // mechanism), with no file mutation on either side of it.
    await ctx.waterfall('fs/edit-intent', target, undefined, () => undefined)

    const headAfter = git(root, ['rev-parse', 'HEAD'])
    const statusAfter = git(root, ['status', '--porcelain'])
    expect(headAfter).toBe(headBefore)
    expect(statusAfter).toBe(statusBefore)

    const checkpointSha = git(root, ['rev-parse', CHECKPOINT_REF])
    expect(checkpointSha).not.toBe('')
    expect(git(root, ['show', `${checkpointSha}:tracked.txt`])).toBe('original')
    expect(git(root, ['rev-parse', `${checkpointSha}^`])).toBe(headBefore)
  })

  it('snapshots the content from before the edit, not after', async () => {
    const root = await setupGitRepo()
    const ctx = await setupContext(root)
    const filePath = join(root, 'tracked.txt')
    const target = await ctx.fs.resolve(filePath)

    await ctx.waterfall('fs/edit-intent', target, undefined, () => undefined)
    await ctx.fs.writeText(target, 'edited\n')

    expect(await readFile(filePath, 'utf8')).toBe('edited\n')
    const checkpointSha = git(root, ['rev-parse', CHECKPOINT_REF])
    expect(git(root, ['show', `${checkpointSha}:tracked.txt`])).toBe('original')
  })

  it('chains consecutive checkpoints onto each other, not onto HEAD each time', async () => {
    const root = await setupGitRepo()
    const ctx = await setupContext(root)
    const filePath = join(root, 'tracked.txt')

    await ctx.waterfall('fs/edit-intent', await ctx.fs.resolve(filePath), undefined, () => undefined)
    await ctx.fs.writeText(await ctx.fs.resolve(filePath), 'edit-one\n')
    const firstCheckpoint = git(root, ['rev-parse', CHECKPOINT_REF])

    await ctx.waterfall('fs/edit-intent', await ctx.fs.resolve(filePath), undefined, () => undefined)
    await ctx.fs.writeText(await ctx.fs.resolve(filePath), 'edit-two\n')
    const secondCheckpoint = git(root, ['rev-parse', CHECKPOINT_REF])

    expect(secondCheckpoint).not.toBe(firstCheckpoint)
    expect(git(root, ['rev-parse', `${secondCheckpoint}^`])).toBe(firstCheckpoint)
    expect(git(root, ['show', `${secondCheckpoint}:tracked.txt`])).toBe('edit-one')
  })

  it('still records a checkpoint when a decision-owning fs/edit-intent listener never calls next()', async () => {
    // fs-observation-policy occupies the single fs/edit-intent decision slot and never calls
    // next() itself (see its own source). Without `prepend: true`, a listener registered after
    // it in the bundle would never run at all — this is the concrete case that requirement guards.
    const root = await setupGitRepo()
    const ctx = await setupContext(root)
    await ctx.plugin(FsPolicy)
    const filePath = join(root, 'tracked.txt')
    const target = await ctx.fs.resolve(filePath)
    const info = await ctx.fs.stat(target)
    if (info === undefined) throw new Error('expected the file to exist')
    // fs-observation-policy keys its per-owner state off `actor.agent.session`; any stable
    // object shape satisfies it without needing a real Agent.
    const actor = { agent: { session: {} } }
    ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, actor)

    const intent = await ctx.waterfall('fs/edit-intent', target, actor, () => undefined)
    expect(intent).toBeDefined()
    if (intent === undefined) throw new Error('expected fs-observation-policy to supply a version guard')
    await ctx.fs.writeText(target, 'edited\n', { kind: 'replaceIfVersion', version: intent.version })

    const checkpointSha = git(root, ['rev-parse', CHECKPOINT_REF])
    expect(git(root, ['show', `${checkpointSha}:tracked.txt`])).toBe('original')
  })

  it('skips snapshotting silently outside a git repository, without failing the edit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-git-safety-net-no-git-'))
    roots.push(root)
    await writeFile(join(root, 'plain.txt'), 'x\n')
    const ctx = await setupContext(root)
    const target = await ctx.fs.resolve(join(root, 'plain.txt'))

    await expect(ctx.waterfall('fs/edit-intent', target, undefined, () => undefined)).resolves.toBeUndefined()
    await ctx.fs.writeText(target, 'y\n')
    expect(await readFile(join(root, 'plain.txt'), 'utf8')).toBe('y\n')
  })
})
