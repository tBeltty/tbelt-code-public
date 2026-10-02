/**
 * Real composition: `ctx.commands` + `@deepseek-ai/dsh-git-safety-net` + `@deepseek-ai/dsh-fs-local`
 * over a real temporary git repository (no mocked git), driving `/undo` through the actual
 * command dispatch (`ctx.commands.execute`), mirroring `command-compact`'s own test style.
 */

import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import * as FsPolicy from '@deepseek-ai/dsh-fs-observation-policy'
import * as GitSafetyNet from '@deepseek-ai/dsh-git-safety-net'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as commandUndo from '@deepseek-ai/dsh-command-undo'

const contexts: Context[] = []
const roots: string[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed (${String(result.status)}): ${result.stderr}`)
  }
  return result.stdout.replace(/\n$/, '')
}

async function setupGitRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-command-undo-composition-'))
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

async function setupHarness(root: string): Promise<Harness> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(CommandRuntime)
  await ctx.plugin(LocalFileSystem, { cwd: root })
  await ctx.plugin(FsPolicy)
  await ctx.plugin(GitSafetyNet)
  await ctx.plugin(commandUndo)
  await mountAgentLoopTestDependencies(ctx)
  const loop = await mountAgentLoopTestHarness(ctx)
  const agent = await loop.create(SessionId('command-undo-test'), {}, { cwd: root })
  return { ctx, agent }
}

/** Edit through the observed fs path so both git-safety-net and fs-observation-policy see it. */
async function edit(ctx: Context, agent: Agent, filePath: string, content: string): Promise<void> {
  const actor = { agent }
  const target = await ctx.fs.resolve(filePath)
  const info = await ctx.fs.stat(target)
  if (info !== undefined) ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, actor)
  await ctx.waterfall('fs/edit-intent', target, actor, () => undefined)
  const outcome = await ctx.fs.writeText(target, content)
  ctx.emit('fs/observed', target, { kind: 'present', version: outcome.version }, actor)
}

describe('@deepseek-ai/dsh-command-undo registration', () => {
  it('registers one argument-free command with Loader-safe exports and disposes it', async () => {
    const root = await setupGitRepo()
    const { ctx, agent } = await setupHarness(root)
    expect(commandUndo.name).toBe('command-undo')
    expect(commandUndo.inject).toEqual(['commands', 'fs'])
    expect('default' in commandUndo).toBe(false)
    const loader = Object.create(Loader.prototype) as Loader
    expect(loader.unwrapExports(commandUndo)).toBe(commandUndo)
    expect(ctx.commands.list(agent)).toContainEqual({
      definitionId: '@deepseek-ai/dsh-command-undo',
      name: 'undo',
      description: 'Revert the current turn\'s file edits, restoring their pre-edit content',
    })
  })
})

describe('/undo human command', () => {
  it('restores the current turn\'s edits and reports what it restored', async () => {
    const root = await setupGitRepo()
    const { ctx, agent } = await setupHarness(root)
    const filePath = join(root, 'tracked.txt')

    agent.session.append('turn/start', { turn: 1 })
    await edit(ctx, agent, filePath, 'edited\n')
    agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    expect(await readFile(filePath, 'utf8')).toBe('edited\n')

    const eventsBefore = agent.session.snapshotEvents().length

    const execution = await ctx.commands.execute(agent, '/undo', [], new AbortController().signal)
    if (execution === undefined) throw new Error('/undo was not registered')
    expect(execution.result).toEqual({
      kind: 'success',
      text: 'Reverted turn 1: restored 1 file (tracked.txt).',
    })
    expect(await readFile(filePath, 'utf8')).toBe('original\n')

    // Restoring conversation-context: the revert appends only its own command/run + command/done
    // lifecycle pair — no message, turn, or step events are added, edited, or removed.
    const eventsAfter = agent.session.snapshotEvents()
    expect(eventsAfter.length).toBe(eventsBefore + 2)
    expect(eventsAfter.slice(eventsBefore).map(event => event.type)).toEqual(['command/run', 'command/done'])
    expect(agent.session.surface.nodes).toEqual([])
    expect(agent.session.deriveMessages()).toEqual([])
  })

  it('reports nothing to undo and rejects arguments', async () => {
    const root = await setupGitRepo()
    const { ctx, agent } = await setupHarness(root)

    const nothing = await ctx.commands.execute(agent, '/undo', [], new AbortController().signal)
    expect(nothing?.result).toEqual({ kind: 'success', text: 'Nothing to undo.' })

    const rejected = await ctx.commands.execute(agent, '/undo now', [], new AbortController().signal)
    expect(rejected?.result).toEqual({ kind: 'error', text: 'Usage: /undo (no arguments)' })
  })

  it('reports a restore conflict as an error instead of overwriting the independent change', async () => {
    const root = await setupGitRepo()
    const { ctx, agent } = await setupHarness(root)
    const filePath = join(root, 'tracked.txt')

    agent.session.append('turn/start', { turn: 1 })
    await edit(ctx, agent, filePath, 'edited\n')
    agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await writeFile(filePath, 'independently changed\n')

    const execution = await ctx.commands.execute(agent, '/undo', [], new AbortController().signal)
    expect(execution?.result.kind).toBe('error')
    expect((execution?.result as { text: string }).text).toMatch(/^Undo could not restore the file:/)
    expect(await readFile(filePath, 'utf8')).toBe('independently changed\n')
  })
})
