/** Raw tool call narrowing: argument parsing, single-text results and the escalation pair. */
import { describe, expect, it } from 'vitest'
import {
  parsedToolCall, singleResultText, validEscalationFields,
  type StartedToolCall, type ToolResultNode,
} from '../src/index.ts'

const started = (argsRaw: string): StartedToolCall => ({
  phase: 'start', callId: 'c1', name: 'bash', argsRaw, turn: 1, step: 1, time: 1, subCalls: [],
})

const settled = (over: Partial<ToolResultNode> = {}): ToolResultNode => ({
  kind: 'tool-result', seq: 1, time: 2, callId: 'c1', call: { name: 'bash', argsRaw: '{"a":1}' },
  callTime: 1, content: [], isError: false, subCalls: [], ...over,
})

describe('parsedToolCall', () => {
  it('parses an object argument payload from a dispatched or settled call and caches it per block', () => {
    const block = started('{"command":"ls"}')
    const parsed = parsedToolCall(block)
    expect(parsed).toEqual({ name: 'bash', args: { command: 'ls' } })
    expect(parsedToolCall(block)).toBe(parsed)
    expect(parsedToolCall(settled())).toEqual({ name: 'bash', args: { a: 1 } })
  })

  it('returns null while preparing, without a call head, and for payloads that are not an object', () => {
    expect(parsedToolCall({ phase: 'preparing', callId: 'c1', name: 'bash', turn: 1, step: 1, time: 1, subCalls: [] }))
      .toBeNull()
    const windowless = settled({ call: null })
    expect(parsedToolCall(windowless)).toBeNull()
    expect(parsedToolCall(windowless)).toBeNull()
    for (const argsRaw of ['not json', '[1]', '3', 'null']) {
      const block = started(argsRaw)
      expect(parsedToolCall(block)).toBeNull()
      expect(parsedToolCall(block)).toBeNull()
    }
  })
})

describe('singleResultText', () => {
  it('returns the text of exactly one text block and nothing else', () => {
    expect(singleResultText(settled({ content: [{ type: 'text', text: 'out' }] }))).toBe('out')
    expect(singleResultText(settled({ content: [] }))).toBeUndefined()
    expect(singleResultText(settled({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }))).toBeUndefined()
    expect(singleResultText(settled({ content: [{ type: 'image', data: 'x' } as never] }))).toBeUndefined()
  })
})

describe('validEscalationFields', () => {
  it('accepts no fields, or a known permission with a non-blank justification', () => {
    expect(validEscalationFields({})).toBe(true)
    expect(validEscalationFields({ sandbox_permissions: 'workspace-write', justification: 'needs network' })).toBe(true)
    expect(validEscalationFields({ sandbox_permissions: 'danger-full-access', justification: 'x' })).toBe(true)
  })

  it('rejects a lone field, an unknown permission and a blank justification', () => {
    expect(validEscalationFields({ justification: 'why' })).toBe(false)
    expect(validEscalationFields({ sandbox_permissions: 'workspace-write' })).toBe(false)
    expect(validEscalationFields({ sandbox_permissions: 'root', justification: 'why' })).toBe(false)
    expect(validEscalationFields({ sandbox_permissions: 'workspace-write', justification: '  ' })).toBe(false)
    expect(validEscalationFields({ sandbox_permissions: 'workspace-write', justification: 7 })).toBe(false)
  })
})
