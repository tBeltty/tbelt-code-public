import { describe, expect, it } from 'vitest'
import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import { loggedPlan, submittedPlan } from '../src/index.ts'

const call = (callId: string, plan: unknown, type = 'tool/call') => ({
  type,
  data: type === 'tool/call'
    ? { name: 'exit_plan_mode', callId, arguments: JSON.stringify({ plan }) }
    : { name: 'exit_plan_mode', subCallId: callId, arguments: { plan } },
})

describe('submittedPlan', () => {
  it('reads the title and Markdown of a native call', () => {
    expect(submittedPlan(call('c1', '# Ship it\n\n- step'))).toEqual({
      callId: 'c1', markdown: '# Ship it\n\n- step', title: 'Ship it',
    })
  })

  it('reads a PTC dispatch whose arguments are already parsed', () => {
    expect(submittedPlan(call('s1', '# From code', 'tool/ptc-dispatch'))?.callId).toBe('s1')
    expect(submittedPlan(call('s2', '# From code', 'tool/ptc-dispatch-start'))?.callId).toBe('s2')
  })

  it.each([
    ['another event type', { type: 'turn/start', data: {} }],
    ['non-record data', { type: 'tool/call', data: 'x' }],
    ['another tool', { type: 'tool/call', data: { name: 'bash', callId: 'c', arguments: '{}' } }],
    ['a missing call id', { type: 'tool/call', data: { name: 'exit_plan_mode', arguments: '{}' } }],
    ['an empty call id', call('', '# t')],
    ['arguments that are not a string', { type: 'tool/call', data: { name: 'exit_plan_mode', callId: 'c', arguments: {} } }],
    ['malformed JSON', { type: 'tool/call', data: { name: 'exit_plan_mode', callId: 'c', arguments: '{' } }],
    ['arguments without a plan', { type: 'tool/call', data: { name: 'exit_plan_mode', callId: 'c', arguments: '{"plan":1}' } }],
    ['a plan without a heading', call('c', 'no heading')],
  ])('returns nothing for %s', (_label, event) => {
    expect(submittedPlan(event)).toBeUndefined()
  })
})

describe('loggedPlan', () => {
  const id = (value: string): ToolCallId => value as ToolCallId

  it('collects the versions submitted in one plan-mode episode, oldest first', () => {
    const events = [
      { type: 'plan/mode', data: { active: true } },
      call('c1', '# One'),
      call('c1', '# One again', 'tool/ptc-dispatch'),
      call('c2', '# Two'),
      { type: 'plan/mode', data: { active: true } },
      call('c3', '# Three'),
    ]
    expect(loggedPlan(events, id('c2'))?.versions).toEqual([
      { callId: 'c1', title: 'One' },
      { callId: 'c2', title: 'Two' },
    ])
    expect(loggedPlan(events, id('c3'))?.versions).toEqual([{ callId: 'c3', title: 'Three' }])
  })

  it('returns nothing when the log holds no such plan', () => {
    expect(loggedPlan([call('c1', '# One')], id('missing'))).toBeUndefined()
  })
})
