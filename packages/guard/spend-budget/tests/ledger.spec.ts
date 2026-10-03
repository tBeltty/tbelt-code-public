/**
 * Ledger and guard behavior over the shipping agent loop: accounting from
 * committed `assistant/message` and `assistant/attempt` events, unknown
 * prices, concurrent Sessions, subagent lineage, UTC month rollover,
 * durability across a remount, and the refused step.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { agentEvents, type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { LlmModelPricing } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SpendBudget, { SPEND_LIMIT_CODE } from '../src/index.ts'
import { PricedAdapter, type ScriptedResponse } from './fixtures/priced-adapter.ts'

/** 1M input + 1M output tokens: $3 + $15 under {@link PRICE}. */
const USAGE = { inputTokens: 1_000_000, outputTokens: 1_000_000 }
const PRICE: LlmModelPricing = { input: 3, output: 15 }
const REQUEST_USD = 18

const contexts: Context[] = []
const roots: string[] = []

afterEach(async () => {
  vi.useRealTimers()
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function newRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-spend-budget-'))
  roots.push(root)
  return root
}

interface Harness {
  readonly ctx: Context
  readonly adapter: PricedAdapter
  readonly dispose: () => Promise<void>
}

async function harness(options: {
  root: string
  pricing?: LlmModelPricing | undefined
  script?: ScriptedResponse[]
  monthlyLimitUsd?: number
}): Promise<Harness> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: options.root })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop)
  const fiber = await ctx.plugin(SpendBudget, options.monthlyLimitUsd === undefined ? {} : { monthlyLimitUsd: options.monthlyLimitUsd })
  const adapter = new PricedAdapter(USAGE, 'pricing' in options ? options.pricing : PRICE, options.script)
  ctx.llm.registerAdapter(['mock'], adapter)
  return { ctx, adapter, dispose: () => fiber.dispose() }
}

async function runTurn(agent: Agent, text = 'go'): Promise<void> {
  agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
  await agent.whenIdle()
}

function lastTurnEnd(agent: Agent) {
  return agent.session.snapshotEvents().filter(event => event.type === 'turn/end').at(-1)
}

describe('spend ledger', () => {
  it('prices a successful request from assistant/message', async () => {
    const { ctx } = await harness({ root: await newRoot() })
    const agent = await ctx.agentLoop.create(SessionId('priced'), { provider: 'mock', model: 'm' })
    await runTurn(agent)
    await ctx.spendBudget.whenSettled()
    const summary = ctx.spendBudget.summary(agent.session.id)
    expect(summary.session).toEqual({ spentUsd: REQUEST_USD, unpricedCalls: 0 })
    expect(summary.monthly).toEqual({ spentUsd: REQUEST_USD, unpricedCalls: 0 })
    expect(summary.budgetSession).toBe(agent.session.id)
  })

  it('answers the Remote reads with settled spend', async () => {
    const { ctx } = await harness({ root: await newRoot(), monthlyLimitUsd: 50 })
    const agent = await ctx.agentLoop.create(SessionId('remote-read'), { provider: 'mock', model: 'm' })
    await runTurn(agent)
    // No whenSettled() here: the Remote reads wait for pending accounting themselves.
    await expect(ctx.spendBudget.settledSummary(agent.session.id)).resolves.toMatchObject({
      session: { spentUsd: REQUEST_USD, unpricedCalls: 0 },
      monthly: { spentUsd: REQUEST_USD, unpricedCalls: 0, limitUsd: 50 },
    })
    await expect(ctx.spendBudget.settledMonth()).resolves.toEqual({
      month: ctx.spendBudget.summary(agent.session.id).month,
      monthly: { spentUsd: REQUEST_USD, unpricedCalls: 0, limitUsd: 50 },
    })
  })

  it('prices a failed attempt from its stream usage and the request/context route', async () => {
    const { ctx } = await harness({ root: await newRoot(), script: ['error'] })
    const agent = await ctx.agentLoop.create(SessionId('attempt'), { provider: 'mock', model: 'm' })
    await runTurn(agent)
    expect(agent.session.snapshotEvents().map(event => event.type)).toContain('assistant/attempt')
    expect(agent.session.snapshotEvents().map(event => event.type)).not.toContain('assistant/message')
    await ctx.spendBudget.whenSettled()
    expect(ctx.spendBudget.summary(agent.session.id).session.spentUsd).toBe(REQUEST_USD)
  })

  it('counts a request on a route with no published price as unpriced and adds nothing', async () => {
    const { ctx } = await harness({ root: await newRoot(), pricing: undefined })
    const agent = await ctx.agentLoop.create(SessionId('unpriced'), { provider: 'mock', model: 'm' })
    await runTurn(agent)
    await ctx.spendBudget.whenSettled()
    const summary = ctx.spendBudget.summary(agent.session.id)
    expect(summary.session).toEqual({ spentUsd: 0, unpricedCalls: 1 })
    expect(summary.monthly).toEqual({ spentUsd: 0, unpricedCalls: 1 })
  })

  it('keeps every update when Sessions run concurrently', async () => {
    const { ctx } = await harness({ root: await newRoot() })
    const agents = await Promise.all(['a', 'b', 'c', 'd'].map(id =>
      ctx.agentLoop.create(SessionId(`concurrent-${id}`), { provider: 'mock', model: 'm' })))
    await Promise.all(agents.map(async (agent) => {
      await runTurn(agent, 'one')
      await runTurn(agent, 'two')
    }))
    await ctx.spendBudget.whenSettled()
    for (const agent of agents) {
      expect(ctx.spendBudget.summary(agent.session.id).session.spentUsd).toBe(2 * REQUEST_USD)
    }
    expect(ctx.spendBudget.summary(agents[0]!.session.id).monthly.spentUsd).toBe(8 * REQUEST_USD)
  })

  it('charges a subagent Session to the top Session of its lineage', async () => {
    const { ctx } = await harness({ root: await newRoot() })
    const parent = await ctx.agentLoop.create(SessionId('lineage-parent'), { provider: 'mock', model: 'm' })
    const child = await ctx.agents.create({
      sessionId: SessionId('lineage-child'),
      meta: { origin: 'subagent', parentSession: parent.session.id, delegationDepth: 1 },
      agentOptions: { provider: 'mock', model: 'm' },
    })
    await runTurn(child.agent)
    await ctx.spendBudget.whenSettled()
    expect(ctx.spendBudget.summary(child.agent.session.id).budgetSession).toBe(parent.session.id)
    expect(ctx.spendBudget.summary(parent.session.id).session.spentUsd).toBe(REQUEST_USD)

    await ctx.spendBudget.setSessionLimit(parent.session.id, 1)
    await runTurn(child.agent)
    expect(lastTurnEnd(child.agent)?.data).toMatchObject({ reason: { kind: 'error', error: { code: SPEND_LIMIT_CODE } } })
    await child.dispose()
  })

  it('starts a new month at the UTC month boundary', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.UTC(2026, 0, 31, 23, 0, 0))
    const { ctx } = await harness({ root: await newRoot(), monthlyLimitUsd: 20 })
    const agent = await ctx.agentLoop.create(SessionId('rollover'), { provider: 'mock', model: 'm' })
    await runTurn(agent)
    await ctx.spendBudget.whenSettled()
    expect(ctx.spendBudget.summary(agent.session.id)).toMatchObject({
      month: '2026-01',
      monthly: { spentUsd: REQUEST_USD, limitUsd: 20 },
    })

    vi.setSystemTime(Date.UTC(2026, 1, 1, 0, 0, 1))
    expect(ctx.spendBudget.summary(agent.session.id)).toMatchObject({
      month: '2026-02',
      monthly: { spentUsd: 0, unpricedCalls: 0, limitUsd: 20 },
      session: { spentUsd: REQUEST_USD },
    })
    await runTurn(agent)
    await ctx.spendBudget.whenSettled()
    expect(ctx.spendBudget.summary(agent.session.id).monthly.spentUsd).toBe(REQUEST_USD)
    expect(ctx.spendBudget.summary(agent.session.id).session.spentUsd).toBe(2 * REQUEST_USD)
  })

  it('keeps spend and limits across a remount', async () => {
    const root = await newRoot()
    const first = await harness({ root })
    const agent = await first.ctx.agentLoop.create(SessionId('durable'), { provider: 'mock', model: 'm' })
    await runTurn(agent)
    await first.ctx.spendBudget.setSessionLimit(agent.session.id, 50)
    await first.ctx.spendBudget.whenSettled()
    await first.ctx.fiber.dispose()

    const second = await harness({ root })
    expect(second.ctx.spendBudget.summary(SessionId('durable')).session).toEqual({
      spentUsd: REQUEST_USD, unpricedCalls: 0, limitUsd: 50,
    })
    expect(second.ctx.spendBudget.summary(SessionId('durable')).monthly.spentUsd).toBe(REQUEST_USD)
  })

  it('rejects a negative or non-finite limit', async () => {
    const { ctx } = await harness({ root: await newRoot() })
    await expect(ctx.spendBudget.setSessionLimit(SessionId('x'), -1)).rejects.toThrow(RangeError)
    await expect(ctx.spendBudget.setSessionLimit(SessionId('x'), Number.NaN)).rejects.toThrow(RangeError)
    await expect(ctx.spendBudget.setMonthlyLimit(Number.POSITIVE_INFINITY)).rejects.toThrow(RangeError)
  })

  it('refuses the monthly limit change without a Settings service', async () => {
    const { ctx } = await harness({ root: await newRoot() })
    await expect(ctx.spendBudget.setMonthlyLimit(5)).rejects.toThrow(/not editable here/)
  })
})

describe('spend guard', () => {
  it('fails the turn before any request once the session limit is reached', async () => {
    const { ctx, adapter } = await harness({ root: await newRoot() })
    const agent = await ctx.agentLoop.create(SessionId('guarded'), { provider: 'mock', model: 'm' })
    await runTurn(agent)
    expect(adapter.requests).toBe(1)
    await ctx.spendBudget.setSessionLimit(agent.session.id, 10)

    await runTurn(agent)
    expect(adapter.requests).toBe(1)
    expect(lastTurnEnd(agent)?.data).toEqual({
      turn: 2,
      reason: {
        kind: 'error',
        error: {
          message: 'This session reached its spend limit: $18.00 spent of $10.00. Raise it with /budget <usd> or remove it with /budget off.',
          code: SPEND_LIMIT_CODE,
        },
      },
    })

    const events = agent.session.snapshotEvents()
    const refusedTurn = events.slice(events.findLastIndex(event => event.type === 'turn/start'))
    expect(refusedTurn.map(event => event.type)).not.toContain('user/message')
    expect(refusedTurn.map(event => event.type)).not.toContain('step/start')

    await ctx.spendBudget.setSessionLimit(agent.session.id, undefined)
    await runTurn(agent)
    expect(adapter.requests).toBe(2)
    expect(lastTurnEnd(agent)?.data.reason.kind).toBe('completed')
  })

  it('refuses every Session once the monthly limit is reached', async () => {
    const { ctx, adapter } = await harness({ root: await newRoot(), monthlyLimitUsd: 18 })
    const first = await ctx.agentLoop.create(SessionId('month-a'), { provider: 'mock', model: 'm' })
    await runTurn(first)
    const second = await ctx.agentLoop.create(SessionId('month-b'), { provider: 'mock', model: 'm' })
    await runTurn(second)
    expect(adapter.requests).toBe(1)
    const reason = lastTurnEnd(second)?.data.reason
    if (reason?.kind !== 'error') throw new Error('expected a failed turn')
    expect(reason.error.code).toBe(SPEND_LIMIT_CODE)
    expect(reason.error.message).toMatch(/^This month reached its spend limit: \$18\.00 spent of \$18\.00/)
  })

  it('stops refusing after the plugin is disposed', async () => {
    const { ctx, adapter, dispose } = await harness({ root: await newRoot() })
    const agent = await ctx.agentLoop.create(SessionId('disposed'), { provider: 'mock', model: 'm' })
    await ctx.spendBudget.setSessionLimit(agent.session.id, 0)
    const pre = await agentEvents(ctx, agent).waterfall('agent/pre-step', {
      messages: [], turn: 1, step: 1, signal: new AbortController().signal,
    }, () => Promise.resolve({ kind: 'enter' as const, messages: [] })).catch((error: unknown) => error)
    expect(pre).toMatchObject({ code: SPEND_LIMIT_CODE })
    await dispose()
    await runTurn(agent)
    expect(adapter.requests).toBe(1)
  })
})
