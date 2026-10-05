/**
 * Real composition: `ctx.tools` + `@deepseek-ai/dsh-memory-storage` (real
 * storage-domain composition over an in-memory backend) driving
 * `recall_memory` through actual tool dispatch (`ctx.tools.execute`),
 * mirroring `tool-remember`'s harness exactly.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { unsupportedInbox } from '@deepseek-ai/dsh-agent-loop-testkit'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import MemoryStorage from '@deepseek-ai/dsh-memory-storage'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import * as toolRecallMemory from '../src/index.ts'
import * as toolRemember from '../../tool-remember/src/index.ts'

let dshHome: string
let context: Context | undefined

beforeEach(async () => {
  dshHome = await mkdtemp(join(tmpdir(), 'dsh-tool-recall-memory-'))
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
  await ctx.plugin(toolRecallMemory)

  const scope = ctx.plugin(() => {})
  const id = SessionId('tool-recall-memory-test')
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

async function remember(ctx: Context, agent: Agent, input: {
  name: string
  type: string
  description: string
  content: string
  projectScope: 'project' | 'global'
}): Promise<void> {
  const result = await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId(`remember-${input.name}`),
    name: 'remember_fact',
    arguments: input,
    agent,
  })
  expect(result.isError).toBe(false)
}

describe('recall_memory tool through ctx.tools.execute', () => {
  it('registers on the tool registry', async () => {
    const { ctx } = await harness()
    expect(ctx.tools.schemas().some(schema => schema.name === 'recall_memory')).toBe(true)
  })

  it('finds a global entry by a description keyword, case-insensitively', async () => {
    const { ctx, agent } = await harness()
    await remember(ctx, agent, {
      name: 'ci-preferences', type: 'feedback',
      description: 'Never add a Co-Authored-By trailer naming an AI tool.',
      content: 'The owner wants sole authorship credit on every commit.',
      projectScope: 'global',
    })

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('recall-1'),
      name: 'recall_memory',
      arguments: { query: 'AUTHORSHIP CREDIT' },
      agent,
    })

    expect(result.isError).toBe(false)
    const output = result.value as { query: string; results: { name: string; excerpt: string }[] }
    expect(output.results.some(entry => entry.name === 'ci-preferences')).toBe(true)
  })

  it('finds an entry only by its topic-file body when the query misses the description', async () => {
    const { ctx, agent } = await harness()
    await remember(ctx, agent, {
      name: 'deploy-notes', type: 'reference',
      description: 'Deployment steps.',
      content: 'The staging bucket is named tbelt-staging-artifacts.',
      projectScope: 'global',
    })

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('recall-2'),
      name: 'recall_memory',
      arguments: { query: 'tbelt-staging-artifacts' },
      agent,
    })

    expect(result.isError).toBe(false)
    const output = result.value as { results: { name: string; excerpt: string }[] }
    expect(output.results).toHaveLength(1)
    expect(output.results[0]?.name).toBe('deploy-notes')
    expect(output.results[0]?.excerpt).toContain('tbelt-staging-artifacts')
  })

  it('excludes a non-matching entry and an entry excluded by the type filter', async () => {
    const { ctx, agent } = await harness()
    await remember(ctx, agent, {
      name: 'match-me', type: 'feedback', description: 'mentions widget somewhere', content: 'irrelevant body',
      projectScope: 'global',
    })
    await remember(ctx, agent, {
      name: 'wrong-type', type: 'reference', description: 'also mentions widget', content: 'irrelevant body',
      projectScope: 'global',
    })
    await remember(ctx, agent, {
      name: 'no-match', type: 'feedback', description: 'unrelated content entirely', content: 'nothing to find',
      projectScope: 'global',
    })

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('recall-3'),
      name: 'recall_memory',
      arguments: { query: 'widget', type: 'feedback' },
      agent,
    })

    expect(result.isError).toBe(false)
    const output = result.value as { results: { name: string }[] }
    expect(output.results.map(entry => entry.name)).toEqual(['match-me'])
  })

  it('returns no results, not an error, for an unmatched query', async () => {
    const { ctx, agent } = await harness()
    await remember(ctx, agent, {
      name: 'ci-preferences', type: 'feedback', description: 'about CI', content: 'CI details',
      projectScope: 'global',
    })

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('recall-4'),
      name: 'recall_memory',
      arguments: { query: 'no-such-keyword-anywhere' },
      agent,
    })

    expect(result.isError).toBe(false)
    const output = result.value as { results: unknown[] }
    expect(output.results).toEqual([])
  })

  it('rejects a call from a non-agent caller', async () => {
    const { ctx } = await harness()
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('recall-no-agent'),
      name: 'recall_memory',
      arguments: { query: 'anything' },
    })
    expect(result.isError).toBe(true)
  })
})
