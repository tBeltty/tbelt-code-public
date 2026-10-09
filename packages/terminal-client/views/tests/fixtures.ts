import { MessageId, ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import type { ContentBlock, StreamChunk } from '@deepseek-ai/dsh-llm/types'
import { SessionSeq } from '@deepseek-ai/dsh-session/types'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { createStyle } from '../src/ansi.ts'
import type { LiveChunkEvent, TranscriptOptions } from '../src/transcript.ts'

let sequence = 0

/** Next monotonic event position. */
function next(): { seq: SessionEvent['seq']; time: number } {
  sequence += 1
  return { seq: SessionSeq(sequence), time: 1_000 + sequence }
}

export const text = (value: string): ContentBlock => ({ type: 'text', text: value })

export function userEvent(content: ContentBlock[], source: SessionEvent<'user/message'>['data']['source'] = { kind: 'user' }): SessionEvent<'user/message'> {
  return { type: 'user/message', ...next(), surfaceOp: 'append', data: { id: MessageId(`m${sequence}`), role: 'user', content, source } }
}

export function assistantEvent(turn: number, step: number, content: ContentBlock[]): SessionEvent<'assistant/message'> {
  return {
    type: 'assistant/message',
    ...next(),
    surfaceOp: 'append',
    data: { turn, step, message: { id: MessageId(`a${sequence}`), role: 'assistant', content, source: { kind: 'model', provider: 'test', model: 'test-model' } }, stream: [] },
  }
}

export function callEvent(callId: string, name: string, args: unknown, turn = 1, step = 1): SessionEvent<'tool/call'> {
  return { type: 'tool/call', ...next(), data: { turn, step, callId: ToolCallId(callId), name, arguments: JSON.stringify(args) } }
}

export interface ResultOptions {
  readonly isError?: boolean
  readonly error?: { name: string; code: string; reason?: string }
  readonly meta?: SessionEvent<'tool/result'>['data']['meta']
}

export function resultEvent(callId: string, output: string, options: ResultOptions = {}): SessionEvent<'tool/result'> {
  return {
    type: 'tool/result',
    ...next(),
    surfaceOp: 'append',
    data: {
      turn: 1,
      step: 1,
      message: {
        id: MessageId(`r${sequence}`),
        role: 'tool',
        content: [text(output)],
        source: { kind: 'tool', callId: ToolCallId(callId) },
        toolCallId: ToolCallId(callId),
        ...options.isError === true ? { isError: true } : {},
      },
      ...options.error === undefined ? {} : { error: options.error },
      ...options.meta === undefined ? {} : { meta: options.meta },
    },
  }
}

export function turnEnd(reason: SessionEvent<'turn/end'>['data']['reason']): SessionEvent<'turn/end'> {
  return { type: 'turn/end', ...next(), data: { turn: 1, reason } }
}

/** A live chunk; text deltas may omit the chunk index, which the views do not read. */
export function liveEvent(chunk: StreamChunk | { type: 'text-delta' | 'reasoning-delta'; text: string }, turn = 1, step = 1): LiveChunkEvent {
  return { type: 'assistant/live-chunk', ...next(), data: { turn, step, chunk: { index: 0, ...chunk } as StreamChunk } }
}

export const style = createStyle(false)

export function options(overrides: Partial<TranscriptOptions> = {}): TranscriptOptions {
  return { style, cwd: '/work/app', home: '/home/me', columns: () => 80, maxOutputLines: 4, ...overrides }
}
