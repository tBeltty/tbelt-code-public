/**
 * Real composition: `ctx.commands` + `@deepseek-ai/dsh-command-clear` over a
 * real `Agent` from the agent-loop testkit, driving `/clear` through the
 * actual command dispatch (`ctx.commands.execute`), mirroring
 * `command-compact`'s and `command-undo`'s own test style.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { MessageId, ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import { SessionId } from '@deepseek-ai/dsh-session'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import { clearNow, ManualClearError } from '@deepseek-ai/dsh-command-clear'
import * as commandClear from '@deepseek-ai/dsh-command-clear'

const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

interface Harness {
  readonly ctx: Context
  readonly agent: Agent
}

async function setupHarness(): Promise<Harness> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(CommandRuntime)
  await mountAgentLoopTestDependencies(ctx)
  void new TokenMeter(ctx)
  await ctx.plugin(commandClear)
  const loop = await mountAgentLoopTestHarness(ctx)
  const agent = await loop.create(SessionId('command-clear-test'), {}, {})
  return { ctx, agent }
}

/** Append one plain user/assistant exchange directly onto the surface. */
function seedTurn(agent: Agent, text: string): void {
  agent.session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: `user: ${text}` }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  agent.session.append('assistant/message', {
    stream: [],
    turn: 1,
    step: 1,
    message: {
      id: MessageId(`msg-${text}`),
      role: 'assistant',
      content: [{ type: 'text', text: `assistant: ${text}` }],
      source: { kind: 'model', provider: 'test', model: 'test' },
    },
  }, { surfaceOp: 'append' })
}

describe('/clear real composition', () => {
  it('shadows the whole surface and reports the count', async () => {
    const { ctx, agent } = await setupHarness()
    seedTurn(agent, 'one')
    seedTurn(agent, 'two')
    expect(agent.session.surface.nodes.length).toBe(4)

    const execution = await ctx.commands.execute(agent, '/clear', [], new AbortController().signal)
    if (execution === undefined) throw new Error('did not resolve /clear')
    expect(execution.result).toMatchObject({ kind: 'success', text: 'Cleared 4 history items (~46 tokens).' })

    // The surface holds only the replacement checkpoint; nothing is deleted
    // from the durable log, which still has every original event.
    expect(agent.session.surface.nodes.length).toBe(1)
    const types = agent.session.snapshotEvents().map(event => event.type)
    expect(types).toContain('context/clear')
    // 2 seeded originals plus the "Context cleared." replacement checkpoint.
    expect(types.filter(type => type === 'user/message').length).toBe(3)
  })

  it('reports nothing to clear on an empty session', async () => {
    const { ctx, agent } = await setupHarness()
    const execution = await ctx.commands.execute(agent, '/clear', [], new AbortController().signal)
    if (execution === undefined) throw new Error('did not resolve /clear')
    expect(execution.result).toEqual({ kind: 'success', text: 'Nothing to clear yet.' })
  })

  it('reconstructs the last cleared span via /cleared', async () => {
    const { ctx, agent } = await setupHarness()
    seedTurn(agent, 'remember-me')
    await ctx.commands.execute(agent, '/clear', [], new AbortController().signal)

    const execution = await ctx.commands.execute(agent, '/cleared', [], new AbortController().signal)
    if (execution === undefined) throw new Error('did not resolve /cleared')
    if (execution.result.kind !== 'success') throw new Error('expected a success result')
    expect(execution.result.text).toContain('remember-me')
  })

  it('finds the last checkpoint even after later messages join the surface', async () => {
    const { ctx, agent } = await setupHarness()
    seedTurn(agent, 'remember-me')
    await ctx.commands.execute(agent, '/clear', [], new AbortController().signal)
    seedTurn(agent, 'newer')

    const execution = await ctx.commands.execute(agent, '/cleared', [], new AbortController().signal)
    if (execution === undefined) throw new Error('did not resolve /cleared')
    if (execution.result.kind !== 'success') throw new Error('expected a success result')
    expect(execution.result.text).toContain('remember-me')
    expect(execution.result.text).not.toContain('newer')
  })

  it('renders a non-text block and omits a blank message from the cleared span', async () => {
    const { ctx, agent } = await setupHarness()
    agent.session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: '   ' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    agent.session.append('assistant/message', {
      stream: [],
      turn: 1,
      step: 1,
      message: {
        id: MessageId('msg-tool-call'),
        role: 'assistant',
        content: [{ type: 'tool-call', id: ToolCallId('call-1'), name: 'noop', arguments: '{}' }],
        source: { kind: 'model', provider: 'test', model: 'test' },
      },
    }, { surfaceOp: 'append' })
    await ctx.commands.execute(agent, '/clear', [], new AbortController().signal)

    const execution = await ctx.commands.execute(agent, '/cleared', [], new AbortController().signal)
    if (execution === undefined) throw new Error('did not resolve /cleared')
    if (execution.result.kind !== 'success') throw new Error('expected a success result')
    expect(execution.result.text).toBe('assistant: [tool-call]')
  })

  it('reports no history when the cleared span rendered no text', async () => {
    const { ctx, agent } = await setupHarness()
    agent.session.append('assistant/message', {
      stream: [],
      turn: 1,
      step: 1,
      message: {
        id: MessageId('msg-empty'),
        role: 'assistant',
        content: [],
        source: { kind: 'model', provider: 'test', model: 'test' },
      },
    }, { surfaceOp: 'append' })
    await ctx.commands.execute(agent, '/clear', [], new AbortController().signal)

    const execution = await ctx.commands.execute(agent, '/cleared', [], new AbortController().signal)
    if (execution === undefined) throw new Error('did not resolve /cleared')
    expect(execution.result).toEqual({ kind: 'success', text: 'Nothing has been cleared in this session yet.' })
  })

  it('reports no history before any /clear has run', async () => {
    const { ctx, agent } = await setupHarness()
    const execution = await ctx.commands.execute(agent, '/cleared', [], new AbortController().signal)
    if (execution === undefined) throw new Error('did not resolve /cleared')
    expect(execution.result).toEqual({ kind: 'success', text: 'Nothing has been cleared in this session yet.' })
  })

  it('refuses a rejected argument on either command', async () => {
    const { ctx, agent } = await setupHarness()
    const clear = await ctx.commands.execute(agent, '/clear bogus', [], new AbortController().signal)
    if (clear === undefined) throw new Error('did not resolve /clear bogus')
    expect(clear.result.kind).toBe('error')

    const history = await ctx.commands.execute(agent, '/cleared bogus', [], new AbortController().signal)
    if (history === undefined) throw new Error('did not resolve /cleared bogus')
    expect(history.result.kind).toBe('error')
  })

  it('is unavailable while the agent is not idle (negative control)', async () => {
    const { agent } = await setupHarness()
    seedTurn(agent, 'busy')
    const blocker = agent.runMaintenance(signal => new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => { reject(new Error(String(signal.reason))) })
    }))
    try {
      await expect(clearNow(agent)).rejects.toThrow(ManualClearError)
      // The blocked maintenance job left the surface untouched.
      expect(agent.session.surface.nodes.length).toBe(2)
    } finally {
      agent.cancel({ kind: 'disposed' })
      await blocker.catch(() => undefined)
    }
  })
})
