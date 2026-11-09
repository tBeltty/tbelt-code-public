/**
 * Real profile composition: `/budget` dispatched through the command registry
 * over the spend stack booted by `dsh-app-boot`'s Loader, with only the model
 * adapter scripted. Asserts the user-visible command results, the durable
 * `command/done` record, the profile write, and the refused turn.
 */

import { readFileSync } from 'node:fs'
import { afterEach, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { SPEND_LIMIT_CODE } from '@deepseek-ai/dsh-spend-budget'
import { PricedAdapter } from '../../spend-budget/tests/fixtures/priced-adapter.ts'
import { createSpendProfile, type SpendProfile } from '../../spend-budget/tests/fixtures/profile.ts'
import * as commandBudget from '../src/index.ts'

let ctx: Context | undefined
let profile: SpendProfile | undefined

afterEach(async () => {
  try { await ctx?.fiber.dispose() } finally { profile?.remove() }
  ctx = undefined
  profile = undefined
})

async function budget(agent: Agent, input: string) {
  if (ctx === undefined) throw new Error('profile not booted')
  const execution = await ctx.commands.execute(agent, `/budget${input}`, [], new AbortController().signal)
  if (execution === undefined) throw new Error('/budget is not registered')
  return execution.result
}

async function runTurn(agent: Agent): Promise<void> {
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
  await agent.whenIdle()
}

it('reports spend, sets both limits, and the session limit refuses the next turn', { timeout: 60_000 }, async () => {
  profile = createSpendProfile(`
    - id: spend-budget
      name: cordis:spend-budget
`, {
    yaml: `
    - id: commands
      name: cordis:commands
    - id: command-budget
      name: cordis:command-budget
`,
    builtins: { 'commands': CommandRuntime, 'command-budget': commandBudget },
  })
  ctx = await profile.start()
  const unloaded = [...ctx.loader.entries()]
    .filter(entry => entry.fiber === undefined && !entry.disabled)
    .map(entry => entry.options.name)
  expect(unloaded).toEqual([])
  // 100k input + 10k output at $3/$15 per million: $0.45 per request.
  const adapter = new PricedAdapter({ inputTokens: 100_000, outputTokens: 10_000 }, { input: 3, output: 15 })
  ctx.llm.registerAdapter(['mock'], adapter)
  const agent = await ctx.agentLoop.create(SessionId('command-budget'), { provider: 'mock', model: 'm' })

  expect(ctx.commands.list(agent)).toContainEqual({
    definitionId: '@deepseek-ai/dsh-command-budget',
    name: 'budget',
    description: 'Show model spend for this session and month, or set a spend limit',
    input: { hint: '<usd> | off | month <usd> | month off' },
  })

  await runTurn(agent)
  expect(await budget(agent, '')).toEqual({ kind: 'success', text: 'This session: $0.45. This month: $0.45.' })
  expect(await budget(agent, ' 0.40')).toEqual({ kind: 'success', text: 'This session\'s spend limit is now $0.40.' })
  expect(await budget(agent, ' month 20')).toEqual({ kind: 'success', text: 'The monthly spend limit is now $20.00.' })
  expect(readFileSync(profile.patchPath, 'utf8')).toContain('monthlyLimitUsd: 20')
  expect(await budget(agent, '')).toEqual({ kind: 'success', text: 'This session: $0.45 of $0.40. This month: $0.45 of $20.00.' })
  expect(agent.session.snapshotEvents().filter(event => event.type === 'command/done').at(-1)?.data).toMatchObject({
    kind: 'success',
    text: 'This session: $0.45 of $0.40. This month: $0.45 of $20.00.',
  })

  await runTurn(agent)
  expect(adapter.requests).toBe(1)
  expect(agent.session.snapshotEvents().filter(event => event.type === 'turn/end').at(-1)?.data.reason).toEqual({
    kind: 'error',
    error: {
      message: 'This session reached its spend limit: $0.45 spent of $0.40. Raise it with /budget <usd> or remove it with /budget off.',
      code: SPEND_LIMIT_CODE,
    },
  })

  expect(await budget(agent, ' off')).toEqual({ kind: 'success', text: 'This session has no spend limit now.' })
  expect(await budget(agent, ' month off')).toEqual({ kind: 'success', text: 'There is no monthly spend limit now.' })
  expect(readFileSync(profile.patchPath, 'utf8')).not.toContain('monthlyLimitUsd')
  await runTurn(agent)
  expect(adapter.requests).toBe(2)
  expect(await budget(agent, ' lots')).toEqual({
    kind: 'error',
    text: 'Usage: /budget, /budget <usd>, /budget off, /budget month <usd>, or /budget month off',
  })
  await ctx.spendBudget.whenSettled()
})
