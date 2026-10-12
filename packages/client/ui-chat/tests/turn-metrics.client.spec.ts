// Assistant timing readings and statistics formatting.

import { describe, expect, it } from 'vitest'
import type {
  AssistantMessageNode,
} from '@deepseek-ai/dsh-client-ui-chat/client'
import { assistantStepReading } from '../src/client/contract/turn-metrics.ts'
import { formatTokensPerSecond } from '../src/client/chat/message-chrome.ts'
import { formatCacheHitPercent, formatTokens } from '../src/client/chat/token-format.ts'

interface StepSpec {
  seq: number
  turn: number
  step: number
  timing?: AssistantMessageNode['timing']
  usage?: unknown
}

const assistant = ({ seq, turn, step, timing, usage }: StepSpec): AssistantMessageNode => ({
  kind: 'assistant', seq, time: seq * 1_000, turn, step, blocks: [{ kind: 'text', text: `t${seq}` }],
  ...(timing === undefined ? {} : { timing }),
  ...(usage === undefined ? {} : { usage }),
})

describe('assistantStepReading', () => {
  it('derives ttft, decode time, and output tokens from a fully recorded step', () => {
    const reading = assistantStepReading(assistant({
      seq: 2, turn: 1, step: 1,
      timing: { stepStartTime: 1_000, firstTokenTime: 1_800, completedTime: 6_800 },
      usage: { outputTokens: 200 },
    }))
    expect(reading).toEqual({ ttftMs: 800, decodeMs: 5_000, outputTokens: 200 })
  })

  it('returns nulls when timing is absent', () => {
    const reading = assistantStepReading(assistant({ seq: 2, turn: 1, step: 1, usage: { outputTokens: 5 } }))
    expect(reading).toEqual({ ttftMs: null, decodeMs: null, outputTokens: 5 })
  })

  it('needs both boundaries for ttft and clamps negative spans to zero', () => {
    expect(assistantStepReading(assistant({
      seq: 2, turn: 1, step: 1,
      timing: { stepStartTime: null, firstTokenTime: 1_800, completedTime: 6_800 },
    }))).toEqual({ ttftMs: null, decodeMs: 5_000, outputTokens: null })
    expect(assistantStepReading(assistant({
      seq: 2, turn: 1, step: 1,
      timing: { stepStartTime: 1_000, firstTokenTime: null, completedTime: 6_800 },
    }))).toEqual({ ttftMs: null, decodeMs: null, outputTokens: null })
    expect(assistantStepReading(assistant({
      seq: 2, turn: 1, step: 1,
      timing: { stepStartTime: 2_000, firstTokenTime: 1_500, completedTime: 1_200 },
    }))).toEqual({ ttftMs: 0, decodeMs: 0, outputTokens: null })
  })

  it('rejects non-object, missing, and non-finite usage token counts', () => {
    const timing = { stepStartTime: 1_000, firstTokenTime: 1_500, completedTime: 2_000 }
    expect(assistantStepReading(assistant({ seq: 2, turn: 1, step: 1, timing, usage: 'weird' })).outputTokens).toBeNull()
    expect(assistantStepReading(assistant({ seq: 2, turn: 1, step: 1, timing, usage: {} })).outputTokens).toBeNull()
    const nan = assistant({ seq: 2, turn: 1, step: 1, timing, usage: { outputTokens: Number.NaN } })
    expect(assistantStepReading(nan).outputTokens).toBeNull()
    expect(assistantStepReading(assistant({ seq: 2, turn: 1, step: 1, timing, usage: { outputTokens: -3 } })).outputTokens).toBeNull()
  })
})

describe('footer figure formatters', () => {
  it('omits a redundant decimal zero in cache-hit percentages', () => {
    expect(formatCacheHitPercent(1, 2, 1)).toBe('50')
  })

  it('writes the decimal mark of the displayed language', () => {
    expect(formatCacheHitPercent(494, 1_000, 1)).toBe('49.4')
    expect(formatCacheHitPercent(494, 1_000, 1, ',')).toBe('49,4')
    expect(formatCacheHitPercent(999_999, 1_000_000, 0, ',')).toBe('99,9999')
  })

  it('scales token counts with the decimal mark of the language tag the translator reports', () => {
    const english = ((key: string, params?: Record<string, unknown>) =>
      key === 'format.locale' ? 'en-US' : `${String(params?.['value'])}K`) as Parameters<typeof formatTokens>[1]
    const spanish = ((key: string, params?: Record<string, unknown>) =>
      key === 'format.locale' ? 'es-ES' : `${String(params?.['value'])} K`) as Parameters<typeof formatTokens>[1]
    expect(formatTokens(12_200, english)).toBe('12.2K')
    expect(formatTokens(12_200, spanish)).toBe('12,2 K')
    expect(formatTokens(517_000, spanish)).toBe('517 K')
  })

  it('formats throughput with whole tokens from ten up and one decimal below', () => {
    expect(formatTokensPerSecond(34.4, 'en-US')).toBe('34')
    expect(formatTokensPerSecond(9.96, 'en-US')).toBe('10')
    expect(formatTokensPerSecond(3.14, 'en-US')).toBe('3.1')
    expect(formatTokensPerSecond(-1, 'en-US')).toBe('0')
    expect(formatTokensPerSecond(3.14, 'es-ES')).toBe('3,1')
  })
})
