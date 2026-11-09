/**
 * Real composition: `ctx.commands` + `@deepseek-ai/dsh-memory-storage` (real
 * storage-domain composition over an in-memory backend) driving `/remember`
 * through actual command dispatch (`ctx.commands.execute`), mirroring
 * `command-undo`'s own test style.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import MemoryStorage, { GLOBAL_SCOPE_ID, indexFilePath, scopeDirectory, topicFilePath } from '@deepseek-ai/dsh-memory-storage'
import { SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import * as commandRemember from '../src/index.ts'

const contexts: Context[] = []

let dshHome: string

beforeEach(async () => {
  dshHome = await mkdtemp(join(tmpdir(), 'dsh-command-remember-'))
})

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  await rm(dshHome, { recursive: true, force: true })
})

async function setupHarness() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(CommandRuntime)
  const pool = new MemoryMediaPool()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  await ctx.plugin(MemoryStorage, { dshHome })
  await ctx.plugin(commandRemember)
  await mountAgentLoopTestDependencies(ctx)
  const loop = await mountAgentLoopTestHarness(ctx)
  const agent = await loop.create(SessionId('command-remember-test'), {}, { cwd: '/tmp/example-project' })
  return { ctx, agent }
}

describe('@deepseek-ai/dsh-command-remember registration', () => {
  it('registers one command with Loader-safe exports and disposes it', async () => {
    const { ctx, agent } = await setupHarness()
    expect(commandRemember.name).toBe('command-remember')
    expect(commandRemember.inject).toEqual(['commands', 'memoryStorage'])
    expect('default' in commandRemember).toBe(false)
    const loader = Object.create(Loader.prototype) as Loader
    expect(loader.unwrapExports(commandRemember)).toBe(commandRemember)
    expect(ctx.commands.list(agent)).toContainEqual({
      definitionId: '@deepseek-ai/dsh-command-remember',
      name: 'remember',
      description: 'Durably remember a fact, preference, or pointer across sessions',
    })
  })
})

describe('/remember human command', () => {
  it('writes a global entry and reports success', async () => {
    const { ctx, agent } = await setupHarness()
    const execution = await ctx.commands.execute(
      agent, '/remember --global ci-preferences Never add a Co-Authored-By trailer naming an AI tool.', [], new AbortController().signal,
    )
    if (execution === undefined) throw new Error('/remember was not registered')
    expect(execution.result.kind).toBe('success')
    expect(execution.result.text).toContain('ci-preferences')

    const raw = await readFile(topicFilePath(scopeDirectory(join(dshHome, 'memory'), GLOBAL_SCOPE_ID), 'ci-preferences'), 'utf8')
    expect(raw).toContain('Never add a Co-Authored-By trailer naming an AI tool.')

    const index = await readFile(indexFilePath(scopeDirectory(join(dshHome, 'memory'), GLOBAL_SCOPE_ID)), 'utf8')
    expect(index).toContain('ci-preferences')
  })

  it('defaults to project scope, resolving from the session cwd', async () => {
    const { ctx, agent } = await setupHarness()
    const execution = await ctx.commands.execute(
      agent, '/remember local-fact This project uses pnpm workspaces.', [], new AbortController().signal,
    )
    if (execution === undefined) throw new Error('/remember was not registered')
    expect(execution.result).toEqual({ kind: 'success', text: 'Remembered "local-fact" (user, this project).' })
  })

  it('rejects missing content with usage text', async () => {
    const { ctx, agent } = await setupHarness()
    const execution = await ctx.commands.execute(agent, '/remember just-a-name', [], new AbortController().signal)
    expect(execution?.result.kind).toBe('error')
    expect(execution?.result.text).toContain('Usage: /remember')
  })

  it('rejects an unknown --type value', async () => {
    const { ctx, agent } = await setupHarness()
    const execution = await ctx.commands.execute(agent, '/remember --type=bogus name some text', [], new AbortController().signal)
    expect(execution?.result.kind).toBe('error')
    expect(execution?.result.text).toContain('Unknown --type value')
  })

  it('redacts a detectable secret before it reaches disk', async () => {
    const { ctx, agent } = await setupHarness()
    const execution = await ctx.commands.execute(
      agent, '/remember --global deploy-notes AWS key: AKIAABCDEFGHIJKLMNOP for the staging bucket', [], new AbortController().signal,
    )
    expect(execution?.result.kind).toBe('success')
    expect(execution?.result.text).toContain('withheld')

    const raw = await readFile(topicFilePath(scopeDirectory(join(dshHome, 'memory'), GLOBAL_SCOPE_ID), 'deploy-notes'), 'utf8')
    expect(raw).not.toContain('AKIAABCDEFGHIJKLMNOP')
  })
})
