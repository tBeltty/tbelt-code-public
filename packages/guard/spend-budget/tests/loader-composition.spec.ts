/**
 * Real profile composition: the spend stack booted through `dsh-app-boot`'s
 * Loader from a test bundle patch, with only the model adapter scripted. A
 * monthly limit set through Settings and then reached fails the next turn with the refusal on its durable
 * `turn/end` reason, the text the Web chat shows on its failed-turn line;
 * Settings changes the limit without a remount, and both the limit and the
 * ledger survive a restart.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SPEND_LIMIT_CODE } from '../src/index.ts'
import { PricedAdapter } from './fixtures/priced-adapter.ts'
import { createSpendProfile, type SpendProfile } from './fixtures/profile.ts'

let ctx: Context | undefined
let profile: SpendProfile | undefined

afterEach(async () => {
  try { await ctx?.fiber.dispose() } finally { profile?.remove() }
  ctx = undefined
  profile = undefined
})

const SPEND_ROW = `
    - id: spend-budget
      name: cordis:spend-budget
`

async function start(): Promise<{ ctx: Context; adapter: PricedAdapter }> {
  if (profile === undefined) throw new Error('profile not created')
  ctx = await profile.start()
  const unloaded = [...ctx.loader.entries()]
    .filter(entry => entry.fiber === undefined && !entry.disabled)
    .map(entry => entry.options.name)
  expect(unloaded).toEqual([])
  // 1M input + 1M output at $3/$15 per million: $18 per request.
  const adapter = new PricedAdapter({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, { input: 3, output: 15 })
  ctx.llm.registerAdapter(['mock'], adapter)
  return { ctx, adapter }
}

async function runTurn(agent: Agent): Promise<void> {
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
  await agent.whenIdle()
}

it('refuses a model step past the monthly limit with a visible turn failure', { timeout: 60_000 }, async () => {
  profile = createSpendProfile(SPEND_ROW)
  const booted = await start()
  const agent = await booted.ctx.agentLoop.create(SessionId('composition'), { provider: 'mock', model: 'm' })
  expect(booted.ctx.spendBudget.summary(agent.session.id).monthly).toEqual({ spentUsd: 0, unpricedCalls: 0 })
  await booted.ctx.spendBudget.setMonthlyLimit(10)
  expect(readFileSync(profile.patchPath, 'utf8')).toContain('monthlyLimitUsd: 10')

  await runTurn(agent)
  expect(booted.adapter.requests).toBe(1)
  await runTurn(agent)
  expect(booted.adapter.requests).toBe(1)
  const end = agent.session.snapshotEvents().filter(event => event.type === 'turn/end').at(-1)
  expect(end?.data).toEqual({
    turn: 2,
    reason: {
      kind: 'error',
      error: {
        message: 'This month reached its spend limit: $18.00 spent of $10.00 (UTC calendar month). '
          + 'Raise it with /budget month <usd>, remove it with /budget month off, or change the monthlyLimitUsd setting.',
        code: SPEND_LIMIT_CODE,
      },
    },
  })

  const fiber = [...booted.ctx.loader.entries()].find(entry => entry.options.id === 'spend-budget')?.fiber
  await booted.ctx.spendBudget.setMonthlyLimit(100)
  expect([...booted.ctx.loader.entries()].find(entry => entry.options.id === 'spend-budget')?.fiber).toBe(fiber)
  expect(readFileSync(profile.patchPath, 'utf8')).toContain('monthlyLimitUsd: 100')
  await runTurn(agent)
  expect(booted.adapter.requests).toBe(2)

  const storedFiles = readdirSync(join(profile.patchPath, '..', '..', '..', 'storages'), { recursive: true })
  expect(storedFiles.some(file => String(file).includes('spend_budget'))).toBe(true)

  // A host shutdown does not order the storage backend after this plugin's drain.
  await booted.ctx.spendBudget.whenSettled()
  await booted.ctx.fiber.dispose()
  const restarted = await start()
  expect(restarted.ctx.spendBudget.summary(SessionId('composition'))).toMatchObject({
    session: { spentUsd: 36 },
    monthly: { spentUsd: 36, limitUsd: 100 },
  })
  await restarted.ctx.spendBudget.setMonthlyLimit(undefined)
  expect(restarted.ctx.spendBudget.summary(SessionId('composition')).monthly).toEqual({ spentUsd: 36, unpricedCalls: 0 })
  expect(readFileSync(profile.patchPath, 'utf8')).not.toContain('monthlyLimitUsd')
})
