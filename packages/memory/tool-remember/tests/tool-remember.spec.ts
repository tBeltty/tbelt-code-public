/**
 * Real composition: `ctx.tools` + `@deepseek-ai/dsh-memory-storage` (real
 * storage-domain composition over an in-memory backend) driving
 * `remember_fact` through actual tool dispatch (`ctx.tools.execute`),
 * mirroring `tool-todo`'s loader-composition test's lighter hand-built
 * agent harness (no scripted model needed for a single direct tool call).
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { unsupportedInbox } from '@deepseek-ai/dsh-agent-loop-testkit'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import MemoryStorage, { GLOBAL_SCOPE_ID, scopeDirectory, topicFilePath } from '@deepseek-ai/dsh-memory-storage'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import * as toolRemember from '../src/index.ts'

let dshHome: string
let context: Context | undefined

beforeEach(async () => {
  dshHome = await mkdtemp(join(tmpdir(), 'dsh-tool-remember-'))
})

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  await rm(dshHome, { recursive: true, force: true })
})

async function harness(): Promise<{ ctx: Context; agent: Agent }> {
  const ctx = new Context()
  context = ctx
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const pool = new MemoryMediaPool()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  await ctx.plugin(MemoryStorage, { dshHome })
  await ctx.plugin(toolRemember)

  const scope = ctx.plugin(() => {})
  const id = SessionId('tool-remember-test')
  const session = Session.create(id)
  const agent: Agent = {
    id, options: {}, session, inbox: unsupportedInbox(),
    status: 'idle', ctx: scope.ctx,
    followup: () => {}, steer: () => {}, inject: () => {}, send: () => {}, cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  await ctx.agents.register(agent)
  return { ctx, agent }
}

describe('remember_fact tool through ctx.tools.execute', () => {
  it('registers on the tool registry', async () => {
    const { ctx } = await harness()
    expect(ctx.tools.schemas().some(schema => schema.name === 'remember_fact')).toBe(true)
  })

  it('writes a global entry end to end', async () => {
    const { ctx, agent } = await harness()
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('remember-1'),
      name: 'remember_fact',
      arguments: {
        name: 'ci-preferences',
        type: 'feedback',
        description: 'Never add a Co-Authored-By trailer naming an AI tool.',
        content: 'The owner wants sole authorship credit on every commit.',
        projectScope: 'global',
      },
      agent,
    })
    expect(result.isError).toBe(false)

    const raw = await readFile(topicFilePath(scopeDirectory(join(dshHome, 'memory'), GLOBAL_SCOPE_ID), 'ci-preferences'), 'utf8')
    expect(raw).toContain('The owner wants sole authorship credit on every commit.')
  })

  it('rejects a call from a non-agent caller', async () => {
    const { ctx } = await harness()
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('remember-no-agent'),
      name: 'remember_fact',
      arguments: {
        name: 'orphan-entry',
        type: 'user',
        description: 'Should not be written.',
        content: 'No owning session.',
        projectScope: 'global',
      },
    })
    expect(result.isError).toBe(true)
  })

  it('redacts a detectable secret before it reaches disk', async () => {
    const { ctx, agent } = await harness()
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('remember-secret'),
      name: 'remember_fact',
      arguments: {
        name: 'deploy-notes',
        type: 'reference',
        description: 'Deployment credentials location.',
        content: 'AWS key: AKIAABCDEFGHIJKLMNOP for the staging bucket',
        projectScope: 'global',
      },
      agent,
    })
    expect(result.isError).toBe(false)

    const raw = await readFile(topicFilePath(scopeDirectory(join(dshHome, 'memory'), GLOBAL_SCOPE_ID), 'deploy-notes'), 'utf8')
    expect(raw).not.toContain('AKIAABCDEFGHIJKLMNOP')
  })
})
