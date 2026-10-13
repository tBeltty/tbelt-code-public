import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import * as ToolGroups from '../src/index.ts'
import { ENABLE_TOOLS, resolveGroups } from '../src/index.ts'

const groups: ToolGroups.ToolGroup[] = [
  { name: 'extras', description: 'Look things up.', tools: ['lookup', 'lookup_more'] },
  { name: 'absent', description: 'Never registered.', tools: ['not_registered'] },
]

function fakeTool(name: string) {
  return defineTool({
    name,
    description: `Fake ${name}.`,
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true } } },
      render: () => [{ type: 'text', text: `${name} ran` }],
    },
    execute: () => Promise.resolve({ ok: true }),
  })
}

async function harness(adapter: MockAdapter, config: ToolGroups.Config = { groups }): Promise<Context> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.tools.register(fakeTool('lookup'))
  ctx.tools.register(fakeTool('lookup_more'))
  ctx.tools.register(fakeTool('always_on'))
  await ctx.plugin(ToolGroups, config)
  ctx.llm.registerAdapter(['mock'], adapter)
  return ctx
}

function waitForIdle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') {
        dispose()
        resolve()
      }
    })
  })
}

async function run(ctx: Context, agent: Agent, text: string): Promise<void> {
  agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
  await waitForIdle(ctx, agent)
}

const toolNames = (request: { tools?: readonly { name: string }[] | undefined }): string[] =>
  (request.tools ?? []).map(tool => tool.name)

function resultTexts(agent: Agent): string[] {
  return agent.session.snapshotEvents().flatMap((event: SessionEvent) => event.type === 'tool/result'
    ? event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : [])
    : [])
}

describe('resolveGroups', () => {
  it.each([
    [{ groups: [] }, 'at least one group'],
    [{ groups: [{ name: ' ', description: 'x', tools: ['a'] }] }, 'non-empty `name`'],
    [{ groups: [{ name: 'g', description: ' ', tools: ['a'] }] }, 'non-empty `description`'],
    [{ groups: [{ name: 'g', description: 'x', tools: ['a'] }, { name: 'g', description: 'y', tools: ['b'] }] }, 'declared twice'],
    [{ groups: [{ name: 'g', description: 'x', tools: [] }] }, 'at least one tool'],
    [{ groups: [{ name: 'g', description: 'x', tools: [ENABLE_TOOLS] }] }, `cannot contain ${ENABLE_TOOLS}`],
    [{ groups: [{ name: 'g', description: 'x', tools: ['a'] }, { name: 'h', description: 'y', tools: ['a'] }] }, 'is in both "g" and "h"'],
  ])('rejects %j', (config, message) => {
    expect(() => resolveGroups(config)).toThrow(message)
  })

  it('returns valid groups unchanged', () => {
    expect(resolveGroups({ groups })).toBe(groups)
  })
})

describe('enable_tools card', () => {
  it('presents the call as a generic card naming the group', async () => {
    const ctx = await harness(new MockAdapter([]))
    const definition = ctx.tools.get(ENABLE_TOOLS)
    expect(definition?.presentCall?.({ group: 'extras' })).toEqual({
      card: 'generic', title: 'Enable extras tools', kind: 'other', rawInput: { group: 'extras' },
    })
  })
})

describe('tool group prompt section', () => {
  it('renders nothing without an agent', async () => {
    const ctx = await harness(new MockAdapter([]))
    const assembly = await ctx.systemPrompt.assemble()
    expect(JSON.stringify(assembly.sections)).not.toContain('More tools are off')
  })

  it('renders nothing when no group has a registered tool', async () => {
    const ctx = await harness(new MockAdapter([]), { groups: [groups[1]!] })
    const agent = await ctx.agentLoop.create(SessionId('groups-none'), { provider: 'mock', model: 'mock' })
    const assembly = await ctx.systemPrompt.assemble({ scope: agent })
    expect(JSON.stringify(assembly.sections)).not.toContain('More tools are off')
  })
})

describe('tool groups through the agent loop', () => {
  it('keeps a group out of the request until enable_tools, then offers it from the next step', async () => {
    const adapter = new MockAdapter([
      toolCallResponse('call-1', ENABLE_TOOLS, { group: 'extras' }),
      toolCallResponse('call-2', 'lookup', {}),
      textResponse('Done.'),
    ])
    const ctx = await harness(adapter)
    const agent = await ctx.agentLoop.create(SessionId('groups-enable'), { provider: 'mock', model: 'mock' })
    await run(ctx, agent, 'look something up')

    expect(toolNames(adapter.requests[0]!)).toEqual(expect.arrayContaining([ENABLE_TOOLS, 'always_on']))
    expect(toolNames(adapter.requests[0]!)).not.toContain('lookup')
    expect(toolNames(adapter.requests[0]!)).not.toContain('lookup_more')
    expect(toolNames(adapter.requests[1]!)).toEqual(expect.arrayContaining(['lookup', 'lookup_more']))
    expect(resultTexts(agent)).toEqual(['Enabled extras: lookup, lookup_more. Use them from your next step.', 'lookup ran'])

    const additions = agent.session.snapshotEvents().flatMap(event => event.type === 'developer/message'
      ? event.data.message.content.flatMap(block => block.type === 'tool-addition' ? [block.toolName] : [])
      : [])
    expect(additions).toEqual(['lookup', 'lookup_more'])
  })

  it('lists only groups with registered tools, and the list does not change when a group is enabled', async () => {
    const adapter = new MockAdapter([
      toolCallResponse('call-1', ENABLE_TOOLS, { group: 'extras' }),
      textResponse('Done.'),
    ])
    const ctx = await harness(adapter)
    const agent = await ctx.agentLoop.create(SessionId('groups-prompt'), { provider: 'mock', model: 'mock' })
    await run(ctx, agent, 'go')

    const prompts = agent.session.snapshotEvents().flatMap(event => event.type === 'system/message'
      ? event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : [])
      : [])
    const text = prompts.join('\n')
    expect(text).toContain(`More tools are off until you call ${ENABLE_TOOLS} with a group name.`)
    expect(text).toContain('- extras: Look things up.')
    expect(text).not.toContain('absent')
    expect(prompts).toHaveLength(1)
  })

  it('reports a repeated enable without failing', async () => {
    const adapter = new MockAdapter([
      toolCallResponse('call-1', ENABLE_TOOLS, { group: 'extras' }),
      toolCallResponse('call-2', ENABLE_TOOLS, { group: 'extras' }),
      textResponse('Done.'),
    ])
    const ctx = await harness(adapter)
    const agent = await ctx.agentLoop.create(SessionId('groups-twice'), { provider: 'mock', model: 'mock' })
    await run(ctx, agent, 'go')

    expect(resultTexts(agent)).toEqual([
      'Enabled extras: lookup, lookup_more. Use them from your next step.',
      'extras is already enabled: lookup, lookup_more.',
    ])
  })

  it('refuses a group with no registered tools', async () => {
    const adapter = new MockAdapter([
      toolCallResponse('call-1', ENABLE_TOOLS, { group: 'absent' }),
      textResponse('Done.'),
    ])
    const ctx = await harness(adapter)
    const agent = await ctx.agentLoop.create(SessionId('groups-absent'), { provider: 'mock', model: 'mock' })
    await run(ctx, agent, 'go')

    expect(resultTexts(agent).join('\n')).toContain('group "absent" has no tools in this mode')
  })

  it('refuses a caller without an agent', async () => {
    const ctx = await harness(new MockAdapter([]))
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: 'call-x' as never,
      name: ENABLE_TOOLS,
      arguments: { group: 'extras' },
    })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain(`${ENABLE_TOOLS} requires a calling agent`)
  })

  it('keeps a group on for an agent seeded from a session whose last request carried its tools', async () => {
    const adapter = new MockAdapter([
      toolCallResponse('call-1', ENABLE_TOOLS, { group: 'extras' }),
      textResponse('Done.'),
      textResponse('Again.'),
    ])
    const ctx = await harness(adapter)
    const first = await ctx.agentLoop.create(SessionId('groups-origin'), { provider: 'mock', model: 'mock' })
    await run(ctx, first, 'enable')

    const handle = await ctx.agentLoop.createAgent(ctx, {
      sessionId: SessionId('groups-replay'),
      seed: first.session.snapshotEvents(),
      agentOptions: { provider: 'mock', model: 'mock' },
    })
    await run(ctx, handle.agent, 'continue')

    expect(toolNames(adapter.requests.at(-1)!)).toEqual(expect.arrayContaining(['lookup', 'lookup_more']))
    await handle.dispose()
  })
})
