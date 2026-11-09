/**
 * Feedback: the reply a rating applies to and the ratings a person can give.
 * @module @deepseek-ai/dsh-terminal-views/feedback
 */
import { t } from './copy.ts'
import type { PickerItem } from './picker.ts'
import { oneLine } from './lines.ts'
import type { TranscriptEvent } from './transcript.ts'

/** The assistant reply a rating applies to. */
export interface RatedReply {
  readonly messageId: string
  readonly preview: string
}

/** A rating. */
export type Rating = 'positive' | 'negative'

/**
 * The newest assistant reply that has text.
 * @param events - session events in order.
 * @returns its id and the start of its text, or undefined when the loaded history has no reply.
 */
export function lastReply(events: readonly TranscriptEvent[]): RatedReply | undefined {
  for (const event of [...events].reverse()) {
    if (event.type !== 'assistant/message') continue
    const text = event.data.message.content
      .map(block => block.type === 'text' ? block.text : '')
      .join(' ')
    if (text.trim() !== '') return { messageId: event.data.message.id, preview: oneLine(text, 60) }
  }
  return undefined
}

/**
 * The choices for rating a reply.
 * @param current - the rating already given, if any.
 * @returns up, down and, when a rating exists, remove; the current rating is marked.
 */
export function ratingItems(current: Rating | undefined): PickerItem[] {
  return [
    { value: 'positive', label: t('feedback.positive'), current: current === 'positive' },
    { value: 'negative', label: t('feedback.negative'), current: current === 'negative' },
    ...current === undefined ? [] : [{ value: 'remove', label: t('feedback.remove') }],
  ]
}
