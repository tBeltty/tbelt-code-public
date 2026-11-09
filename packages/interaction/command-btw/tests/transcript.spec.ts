import { describe, expect, it } from 'vitest'
import { createAssistantMessage, createSystemMessage, createToolResultMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Message } from '@deepseek-ai/dsh-llm'
import { OMITTED_MARKER, renderTranscript } from '../src/transcript.ts'

const user = (text: string): Message => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
const assistant = (text: string): Message => createAssistantMessage({
  content: [{ type: 'text', text }],
  source: { provider: 'mock', model: 'mock' },
})

describe('renderTranscript', () => {
  it('labels user and assistant text and skips unreadable messages', () => {
    const empty = createAssistantMessage({ content: [{ type: 'reasoning', text: 'hidden' }], source: { provider: 'mock', model: 'mock' } })
    expect(renderTranscript([user('hi'), empty, assistant('hello')], 1000)).toBe('User: hi\n\nAssistant: hello')
  })

  it('names tool calls and images without their payloads', () => {
    const message = createAssistantMessage({
      content: [
        { type: 'text', text: 'looking' },
        { type: 'tool-call', id: 'call-1' as never, name: 'read_file', arguments: '{"path":"secret"}' },
      ],
      source: { provider: 'mock', model: 'mock' },
    })
    const rendered = renderTranscript([message], 1000)
    expect(rendered).toContain('[called tool read_file]')
    expect(rendered).not.toContain('secret')
  })

  it('renders attachments as placeholders and skips system messages', () => {
    const attachments = createUserMessage({
      content: [
        { type: 'image', attachment: {} as never },
        { type: 'file', attachment: {} as never },
      ],
      source: { kind: 'user' },
    })
    const blank = createUserMessage({ content: [{ type: 'reasoning', text: 'x' }], source: { kind: 'user' } })
    expect(renderTranscript([createSystemMessage('rules'), blank, attachments], 1000)).toBe('User: [image]\n[file]')
  })

  it('keeps short tool results and clips long ones to their head', () => {
    const result = (text: string): Message => createToolResultMessage({
      callId: 'call-1' as never,
      content: [{ type: 'text', text }],
      isError: false,
    })
    expect(renderTranscript([result('ok')], 1000)).toBe('Tool result: ok')
    const clipped = renderTranscript([result('x'.repeat(900))], 5000)
    expect(clipped.length).toBeLessThan(450)
    expect(clipped.endsWith('…')).toBe(true)
    expect(renderTranscript([createToolResultMessage({ callId: 'call-2' as never, content: [], isError: false })], 1000)).toBe('')
  })

  it('keeps the newest entries within the budget and marks the omission', () => {
    const rendered = renderTranscript([user('a'.repeat(30)), user('b'.repeat(30)), user('c'.repeat(30))], 80)
    expect(rendered.startsWith(OMITTED_MARKER)).toBe(true)
    expect(rendered).not.toContain('a'.repeat(30))
    expect(rendered).toContain('c'.repeat(30))
  })

  it('cuts a single entry larger than the budget from its head', () => {
    const rendered = renderTranscript([user('z'.repeat(500))], 100)
    expect(rendered.length).toBeLessThanOrEqual(100)
  })

  it('returns an empty string for an empty conversation', () => {
    expect(renderTranscript([], 100)).toBe('')
  })
})
