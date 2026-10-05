/**
 * Real-composition coverage for `undo()`: a real Cordis context over `@deepseek-ai/dsh-fs-local`
 * and a real production Agent (via `@deepseek-ai/dsh-agent-loop-testkit`), driving real
 * `fs/edit-intent`/`fs/write-intent` waterfalls against a real temporary git repository (no
 * mocked git). Turn boundaries are driven directly through `agent.session.append('turn/start'
 * | 'turn/end', ...)` rather than a live model call, since `undo()` only reads the resulting
 * `turnBoundary` projection state.
 */

import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import type { Agent } from '@deepseek-ai/dsh-agent'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { FsError } from '@deepseek-ai/dsh-fs'
import * as FsPolicy from '@deepseek-ai/dsh-fs-observation-policy'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as GitSafetyNet from '@deepseek-ai/dsh-git-safety-net'
import { undo } from '@deepseek-ai/dsh-git-safety-net'

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
  const root = await mkdtemp(join(tmpdir(), 'dsh-command-undo-'))
  roots.push(root)
  git(root, ['init', '-q'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'user.name', 'Test'])
  await writeFile(join(root, 'tracked.txt'), 'original\n')
  git(root, ['add', 'tracked.txt'])
  git(root, ['commit', '-q', '-m', 'initial'])
  return root
}

interface Harness {
  readonly ctx: Context
  readonly agent: Agent
}

/** Real Cordis composition: fs-local, git-safety-net, and a real production Agent over `root`. */
async function setupHarness(root: string, mountFsPolicy = false): Promise<Harness> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LocalFileSystem, { cwd: root })
  if (mountFsPolicy) await ctx.plugin(FsPolicy)
  await ctx.plugin(GitSafetyNet)
  await mountAgentLoopTestDependencies(ctx)
  const loop = await mountAgentLoopTestHarness(ctx)
  const agent = await loop.create(SessionId('undo-test'), {}, { cwd: root })
  return { ctx, agent }
}

/**
 * Perform one checkpointed edit through the ordinary read-observe / `fs/edit-intent` /
 * `writeText` / `fs/observed` sequence a tool-driven edit uses (mirrors `dsh-tool-fs`'s own
 * `edit` tool). The leading stat+observe is required whenever `fs-observation-policy` is
 * mounted: its `fs/edit-intent` listener rejects an unobserved target with `FS_NOT_OBSERVED`.
 */
async function editThroughWaterfall(ctx: Context, agent: Agent, filePath: string, content: string): Promise<void> {
  const actor = { agent }
  const target = await ctx.fs.resolve(filePath)
  const info = await ctx.fs.stat(target)
  if (info !== undefined) ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, actor)
  await ctx.waterfall('fs/edit-intent', target, actor, () => undefined)
  const outcome = await ctx.fs.writeText(target, content)
  ctx.emit('fs/observed', target, { kind: 'present', version: outcome.version }, actor)
}

describe('undo()', () => {
  it('restores a single-edit turn to its pre-turn content', async () => {
    const root = await setupGitRepo()
    const { ctx, agent } = await setupHarness(root)
    const filePath = join(root, 'tracked.txt')

    agent.session.append('turn/start', { turn: 1 })
    await editThroughWaterfall(ctx, agent, filePath, 'edited\n')
    agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    expect(await readFile(filePath, 'utf8')).toBe('edited\n')

    const outcome = await undo(ctx, agent, new AbortController().signal)
    expect(outcome).toEqual({
      kind: 'reverted',
      turn: 1,
      files: [{ relPath: 'tracked.txt', fromCheckpointSha: expect.any(String) as unknown }],
    })
    expect(await readFile(filePath, 'utf8')).toBe('original\n')
  })

  it('restores to the content before the FIRST edit when a file is edited more than once in one turn', async () => {
    const root = await setupGitRepo()
    const { ctx, agent } = await setupHarness(root)
    const filePath = join(root, 'tracked.txt')

    agent.session.append('turn/start', { turn: 1 })
    await editThroughWaterfall(ctx, agent, filePath, 'edit-one\n')
    await editThroughWaterfall(ctx, agent, filePath, 'edit-two\n')
    agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    const outcome = await undo(ctx, agent, new AbortController().signal)
    expect(outcome.kind).toBe('reverted')
    expect(await readFile(filePath, 'utf8')).toBe('original\n')
  })

  it('does not revert checkpoints recorded in an earlier turn', async () => {
    const root = await setupGitRepo()
    const { ctx, agent } = await setupHarness(root)
    await writeFile(join(root, 'other.txt'), 'other-original\n')
    git(root, ['add', 'other.txt'])
    git(root, ['commit', '-q', '-m', 'add other'])
    const trackedPath = join(root, 'tracked.txt')
    const otherPath = join(root, 'other.txt')

    agent.session.append('turn/start', { turn: 1 })
    await editThroughWaterfall(ctx, agent, trackedPath, 'turn-one-edit\n')
    agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    agent.session.append('turn/start', { turn: 2 })
    await editThroughWaterfall(ctx, agent, otherPath, 'turn-two-edit\n')
    agent.session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })

    const outcome = await undo(ctx, agent, new AbortController().signal)
    expect(outcome).toEqual({
      kind: 'reverted',
      turn: 2,
      files: [{ relPath: 'other.txt', fromCheckpointSha: expect.any(String) as unknown }],
    })
    // Turn 2's checkpoint is reverted; turn 1's edit to tracked.txt is untouched.
    expect(await readFile(otherPath, 'utf8')).toBe('other-original\n')
    expect(await readFile(trackedPath, 'utf8')).toBe('turn-one-edit\n')
  })

  it('reports nothing-to-undo before any turn has started', async () => {
    const root = await setupGitRepo()
    const { ctx, agent } = await setupHarness(root)
    const outcome = await undo(ctx, agent, new AbortController().signal)
    expect(outcome).toEqual({ kind: 'nothing-to-undo' })
  })

  it('reports nothing-to-undo when the current turn recorded no checkpoint', async () => {
    const root = await setupGitRepo()
    const { ctx, agent } = await setupHarness(root)
    agent.session.append('turn/start', { turn: 1 })
    const outcome = await undo(ctx, agent, new AbortController().signal)
    expect(outcome).toEqual({ kind: 'nothing-to-undo' })
  })

  it('never touches HEAD or the index while restoring', async () => {
    const root = await setupGitRepo()
    const { ctx, agent } = await setupHarness(root)
    const filePath = join(root, 'tracked.txt')

    agent.session.append('turn/start', { turn: 1 })
    await editThroughWaterfall(ctx, agent, filePath, 'edited\n')
    agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    const headBefore = git(root, ['rev-parse', 'HEAD'])
    const stagedBefore = git(root, ['diff', '--cached', '--name-only'])

    await undo(ctx, agent, new AbortController().signal)

    expect(git(root, ['rev-parse', 'HEAD'])).toBe(headBefore)
    expect(git(root, ['diff', '--cached', '--name-only'])).toBe(stagedBefore)
  })

  it('rejects a restore when the file changed independently since its checkpoint', async () => {
    const root = await setupGitRepo()
    const { ctx, agent } = await setupHarness(root, true)
    const filePath = join(root, 'tracked.txt')

    agent.session.append('turn/start', { turn: 1 })
    await editThroughWaterfall(ctx, agent, filePath, 'edited\n')
    agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    // An independent write outside the observed fs path: same effect as another actor
    // editing the file after the checkpoint but before `/undo` runs.
    await writeFile(filePath, 'independently changed\n')

    await expect(undo(ctx, agent, new AbortController().signal)).rejects.toThrow(FsError)
    expect(await readFile(filePath, 'utf8')).toBe('independently changed\n')
  })

  it('reports nothing-to-undo outside a git repository', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-command-undo-no-git-'))
    roots.push(root)
    await writeFile(join(root, 'plain.txt'), 'x\n')
    const { ctx, agent } = await setupHarness(root)
    agent.session.append('turn/start', { turn: 1 })
    const outcome = await undo(ctx, agent, new AbortController().signal)
    expect(outcome).toEqual({ kind: 'nothing-to-undo' })
  })
})
