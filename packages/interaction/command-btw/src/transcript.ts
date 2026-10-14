/**
 * Plain-text rendering of the main conversation for the side model call.
 * Text keeps the call independent of tool declarations and reasoning replay
 * state, so any provider route accepts it.
 * @module @deepseek-ai/dsh-command-btw/transcript
 */

import type { ContentBlock, Message } from '@deepseek-ai/dsh-llm'

/** Marker that opens a transcript whose oldest entries were dropped. */
export const OMITTED_MARKER = '[earlier conversation omitted]'

/** Longest rendered tool result, in characters; longer output keeps its head. */
const TOOL_RESULT_MAX_CHARS = 400

/** Render one content block, or `undefined` when it carries no readable text. */
function renderBlock(block: ContentBlock): string | undefined {
  switch (block.type) {
    case 'text': return block.text
    case 'tool-call': return `[called tool ${block.name}]`
    case 'image': return '[image]'
    case 'file': return '[file]'
    default: return undefined
  }
}

/** Join the readable blocks of one message. */
function renderContent(content: readonly ContentBlock[]): string {
  return content.map(renderBlock).filter((part): part is string => part !== undefined).join('\n').trim()
}

/** Keep the head of a long tool result. */
function clipResult(text: string): string {
  return text.length <= TOOL_RESULT_MAX_CHARS ? text : `${text.slice(0, TOOL_RESULT_MAX_CHARS - 1)}…`
}

/**
 * Render one message as a labelled entry.
 * @param message - conversation message.
 * @returns the entry, or `undefined` for system and developer messages and
 * messages without readable text.
 */
function renderMessage(message: Message): string | undefined {
  switch (message.role) {
    case 'user': {
      const text = renderContent(message.content)
      return text.length === 0 ? undefined : `User: ${text}`
    }
    case 'assistant': {
      const text = renderContent(message.content)
      return text.length === 0 ? undefined : `Assistant: ${text}`
    }
    case 'tool': {
      const text = renderContent(message.content)
      return text.length === 0 ? undefined : `Tool result: ${clipResult(text)}`
    }
    default: return undefined
  }
}

/**
 * Render a conversation, keeping the newest entries within a character budget.
 * @param messages - derived session messages in conversation order.
 * @param maxChars - budget for the rendered text, excluding the omission marker.
 * @returns the transcript, or an empty string when nothing readable remains.
 */
export function renderTranscript(messages: readonly Message[], maxChars: number): string {
  const entries = messages.map(renderMessage).filter((entry): entry is string => entry !== undefined)
  const kept: string[] = []
  let used = 0
  for (const entry of entries.toReversed()) {
    if (kept.length > 0 && used + entry.length > maxChars) break
    kept.unshift(entry.length > maxChars ? entry.slice(entry.length - maxChars) : entry)
    used += entry.length
  }
  if (kept.length === 0) return ''
  const body = kept.join('\n\n')
  return kept.length < entries.length ? `${OMITTED_MARKER}\n\n${body}` : body
}
