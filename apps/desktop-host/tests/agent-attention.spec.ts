import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installDesktopAgentAttention, type DesktopAgentSignal } from '../src/agent-attention.ts'

let ctx: Context
let signals: DesktopAgentSignal[]

function agent(id: string, origin?: 'subagent'): Agent {
  return { id, session: { header: { origin } } } as unknown as Agent
}

beforeEach(() => {
  ctx = new Context()
  signals = []
  installDesktopAgentAttention(ctx, (signal) => { signals.push(signal) })
})

afterEach(async () => { await ctx.fiber.dispose() })

describe('desktop agent attention', () => {
  it('reports the running count and a root agent finishing', () => {
    const root = agent('root')
    ctx.emit('agent/status', { agent: root, status: 'running' })
    ctx.emit('agent/status', { agent: root, status: 'idle' })
    expect(signals).toEqual([
      { type: 'agent-activity', running: 1 },
      { type: 'agent-activity', running: 0 },
      { type: 'agent-attention', kind: 'turn-end' },
    ])
  })

  it('counts subagents as activity without notifying for them', () => {
    const child = agent('child', 'subagent')
    ctx.emit('agent/status', { agent: child, status: 'running' })
    ctx.emit('agent/status', { agent: child, status: 'idle' })
    expect(signals).toEqual([
      { type: 'agent-activity', running: 1 },
      { type: 'agent-activity', running: 0 },
    ])
  })

  it('drops a disposed running agent from the count', () => {
    const root = agent('root')
    ctx.emit('agent/status', { agent: root, status: 'running' })
    ctx.emit('agent/disposed', { agent: root })
    ctx.emit('agent/disposed', { agent: root })
    expect(signals).toEqual([
      { type: 'agent-activity', running: 1 },
      { type: 'agent-activity', running: 0 },
    ])
  })

  it('observes approvals and delegates to the answerer chain', async () => {
    ctx.on('approval/request', () => Promise.resolve('allowed-once'))
    const outcome = await ctx.waterfall('approval/request', { agent: agent('root'), toolName: 'bash' },
      () => Promise.resolve('unavailable'))
    expect(outcome).toBe('allowed-once')
    expect(signals).toEqual([{ type: 'agent-attention', kind: 'approval' }])
  })

  it('does not notify for subagent approvals but still delegates', async () => {
    const outcome = await ctx.waterfall('approval/request', { agent: agent('child', 'subagent'), toolName: 'bash' },
      () => Promise.resolve('rejected'))
    expect(outcome).toBe('rejected')
    expect(signals).toEqual([])
  })
})
