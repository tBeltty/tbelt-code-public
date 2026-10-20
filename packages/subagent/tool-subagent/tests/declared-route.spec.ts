/** Child LLM route declared by the agent preset a delegation selects. */
import { mountWorkingDirectoryFixture } from '../../subagent/tests/working-directory-fixture.ts'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import AgentPresets from '@deepseek-ai/dsh-agent-preset-registry'
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import type { SubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MockAdapter } from '../../../core/agent-loop/tests/mock-adapter.ts'
import * as tool from '../src/index.ts'
import { assertDeclaredRouteAllowed, presetRouteOptions, requestedAgentOptions } from '../src/model-selection.ts'
import { mountScriptedProvider, type Config as ProviderConfig } from './scripted-provider.ts'
import { callSubagent, text } from './harness.ts'

const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
})

const REASONING = {
  efforts: [
    { id: ReasoningEffortId('low'), name: 'Low' },
    { id: ReasoningEffortId('high'), name: 'High' },
  ],
  defaultEffort: ReasoningEffortId('high'),
} as const

const fastReviewer: PresetDefinition = {
  id: 'fast-reviewer',
  description: 'Reviews on a cheap route',
  agentRoute: { provider: 'alpha', model: 'fast-model', reasoningEffort: 'low' },
  plugins: [],
}

async function setup(
  config: Omit<tool.Config, 'provider' | 'agentPreset'> & { agentPreset?: string },
  providerConfig: Partial<ProviderConfig> = {},
  preset: PresetDefinition = fastReviewer,
) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(AgentPresets, { default: 'writer' })
  await ctx.agentPresets.register({ id: 'writer', plugins: [] })
  await ctx.agentPresets.register(preset)
  ctx.llm.registerAdapter(['alpha'], new MockAdapter([], REASONING))
  await mountWorkingDirectoryFixture(ctx)
  await ctx.plugin(SubagentRuntime)
  const onStart = vi.fn<(request: SubagentStartRequest) => void>()
  await mountScriptedProvider(ctx, {
    name: 'custom-spawn', capabilities: { agentPreset: true }, onStart, ...providerConfig,
  })
  ctx.loader.builtins.subagentTool = tool
  await ctx.loader.root.update([{
    id: 'tool', name: 'cordis:subagentTool', inject: ['agentPresets'],
    config: { provider: 'custom-spawn', ...config },
  }])
  for (const entry of ctx.loader.entries()) await entry.fiber?.await()
  return { ctx, onStart }
}

const args = { description: 'review task', prompt: 'Review this change.' }

describe('declared preset route', () => {
  it('runs the child on the route its preset declares when the call names none', async () => {
    const { ctx, onStart } = await setup({ agentPreset: 'fast-reviewer' })
    expect((await callSubagent(ctx, args)).isError).not.toBe(true)
    expect(onStart.mock.calls[0]?.[0]).toMatchObject({
      agentPreset: 'fast-reviewer',
      agentOptions: { provider: 'alpha', model: 'fast-model', reasoningEffort: 'low' },
    })
  })

  it('lets a model-chosen route replace the declared one and drops the declared effort', () => {
    const declared = presetRouteOptions(undefined, fastReviewer.agentRoute!)
    expect(requestedAgentOptions({}, declared, { provider: 'alpha', model: 'unlisted-model' }, true))
      .toEqual({ provider: 'alpha', model: 'unlisted-model' })
    expect(requestedAgentOptions({}, declared, { reasoning_effort: 'high' }, true))
      .toEqual({ provider: 'alpha', model: 'fast-model', reasoningEffort: 'high' })
  })

  it('keeps deployment defaults that the declared route does not own', async () => {
    const { ctx, onStart } = await setup({ agentPreset: 'fast-reviewer', agentOptions: { maxTokens: 321 } })
    await callSubagent(ctx, args)
    expect(onStart.mock.calls[0]?.[0].agentOptions).toEqual({
      maxTokens: 321,
      provider: 'alpha',
      model: 'fast-model',
      reasoningEffort: 'low',
    })
  })

  it('starts no child when the declared route does not resolve', async () => {
    const { ctx, onStart } = await setup({ agentPreset: 'fast-reviewer' }, {}, {
      ...fastReviewer,
      agentRoute: { provider: 'missing', model: 'fast-model' },
    })
    const result = await callSubagent(ctx, args)
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('missing')
    expect(onStart).not.toHaveBeenCalled()
  })

  it('fails loud when the provider cannot apply Agent options', async () => {
    const { ctx, onStart } = await setup(
      { agentPreset: 'fast-reviewer' },
      { capabilities: { agentPreset: true, agentOptions: false } },
    )
    const result = await callSubagent(ctx, args)
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('declares a model route, which provider "custom-spawn" cannot apply')
    expect(onStart).not.toHaveBeenCalled()
  })

  it('leaves children on the parent route when the preset declares none', async () => {
    const { ctx, onStart } = await setup({ agentPreset: 'writer' })
    await callSubagent(ctx, args)
    expect(onStart.mock.calls[0]?.[0]).not.toHaveProperty('agentOptions')
  })
})

describe('agent-file presets', () => {
  const agentFile: PresetDefinition = {
    ...fastReviewer,
    origin: 'agent-file',
    oneShot: true,
  }

  function agentChoices(ctx: Context): string[] {
    const schema = ctx.tools.schemas().find(entry => entry.name === 'subagent')
    const props = (schema?.parameters as { properties?: Record<string, { enum?: string[] }> } | undefined)?.properties
    return props?.agent_preset?.enum ?? []
  }

  it('offers agent-file presets without any allowlist and runs them as one-task children', async () => {
    const { ctx, onStart } = await setup({}, {}, agentFile)
    expect(agentChoices(ctx)).toEqual(['fast-reviewer'])
    expect(JSON.stringify(ctx.tools.schemas())).toContain('fast-reviewer: Reviews on a cheap route Runs one task and accepts no follow-up messages.')
    const result = await callSubagent(ctx, { ...args, agent_preset: 'fast-reviewer' })
    expect(result.isError).not.toBe(true)
    expect(onStart.mock.calls[0]?.[0]).toMatchObject({
      agentPreset: 'fast-reviewer',
      oneShot: true,
      agentOptions: { provider: 'alpha', model: 'fast-model', reasoningEffort: 'low' },
    })
  })

  it('does not offer agent files to a provider that cannot compose independent children', async () => {
    const { ctx } = await setup({}, { capabilities: { agentPreset: false } }, agentFile)
    expect(agentChoices(ctx)).toEqual([])
  })

  it('follows agent files registered and removed while the tool is mounted', async () => {
    const { ctx } = await setup({}, {}, agentFile)
    const late = await ctx.agentPresets.register({ ...agentFile, id: 'late-reviewer' })
    expect(agentChoices(ctx)).toEqual(['fast-reviewer', 'late-reviewer'])
    await late()
    expect(agentChoices(ctx)).toEqual(['fast-reviewer'])
  })
})

describe('one-shot preset children', () => {
  it('starts a child of a one-shot preset with the one-shot flag', async () => {
    const { ctx, onStart } = await setup({ agentPreset: 'fast-reviewer' }, {}, { ...fastReviewer, oneShot: true })
    await callSubagent(ctx, args)
    expect(onStart.mock.calls[0]?.[0]).toMatchObject({ agentPreset: 'fast-reviewer', oneShot: true })
  })

  it('leaves a child of a preset without the flag continuable', async () => {
    const { ctx, onStart } = await setup({ agentPreset: 'fast-reviewer' })
    await callSubagent(ctx, args)
    expect(onStart.mock.calls[0]?.[0]).not.toHaveProperty('oneShot')
  })

  it('tells the model which presets run one task', async () => {
    const { ctx } = await setup({ allowedAgentPresets: ['writer', 'fast-reviewer'] }, {}, { ...fastReviewer, oneShot: true })
    expect(JSON.stringify(ctx.tools.schemas())).toContain('fast-reviewer: Reviews on a cheap route Runs one task and accepts no follow-up messages.')
  })
})

describe('assertDeclaredRouteAllowed', () => {
  const route = { provider: 'alpha', model: 'fast-model' }

  it('accepts every declared route without an active allowlist', () => {
    expect(() => { assertDeclaredRouteAllowed(undefined, route) }).not.toThrow()
  })

  it('requires an active allowlist to contain the declared route', () => {
    const policy = { routes: [{ provider: 'alpha', model: 'other-model' }] }
    expect(() => { assertDeclaredRouteAllowed(policy, route) })
      .toThrow('agent preset route "alpha/fast-model" is not allowed for this Session')
    expect(() => { assertDeclaredRouteAllowed({ routes: [route] }, route) }).not.toThrow()
  })
})
