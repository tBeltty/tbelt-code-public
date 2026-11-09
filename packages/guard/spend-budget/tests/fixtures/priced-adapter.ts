/**
 * Scripted model adapter for spend tests: publishes an optional list price
 * and answers every request with one text block and one usage sample, or
 * with a usage sample followed by an error finish.
 */

import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelPricing, LlmResolvedModelInfo, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'

/** One scripted response. */
export type ScriptedResponse = 'text' | 'error'

/** Adapter answering from a response script; an exhausted script answers `text`. */
export class PricedAdapter extends LlmAdapter {
  /** Requests streamed so far. */
  requests = 0

  constructor(
    private readonly usage: TokenUsage,
    private readonly pricing: LlmModelPricing | undefined,
    private readonly script: ScriptedResponse[] = [],
  ) {
    super()
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      ...this.pricing === undefined ? {} : { pricing: this.pricing },
    })
  }

  async * stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests += 1
    const response = this.script.shift() ?? 'text'
    if (response === 'error') {
      yield { type: 'usage', usage: this.usage }
      yield { type: 'finish', reason: { kind: 'error', failure: { message: 'scripted outage', code: 'SERVER' } } }
      return
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'done' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'done' } }
    yield { type: 'usage', usage: this.usage }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
