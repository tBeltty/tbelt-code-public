/**
 * Queued messages: the rows of the `/queue` list and the line that says how many wait.
 * The rows come from the session's `inbox` projection, which is wire data, so they are read defensively.
 * @module @deepseek-ai/dsh-terminal-views/queue
 */
import { t } from './copy.ts'
import { recordOf } from './lines.ts'
import type { Style } from './ansi.ts'
import type { PickerItem } from './picker.ts'
import { truncate } from './width.ts'

/** Longest preview of one queued message, in cells. */
const PREVIEW_CELLS = 80

/** One message waiting for the agent. */
export interface QueueRow {
  /** The Host's identity for the occurrence; the key of every queue action. */
  readonly id: string
  /** One line of the message text. */
  readonly preview: string
  /** The full text when the message is one line of text with no attachment, which is when `/queue` can edit it. */
  readonly text: string | undefined
  /** Images and files that go with the message. */
  readonly attachments: number
}

/**
 * The messages waiting for the next turn.
 * @param inbox - the `inbox` projection value, or undefined before the Host reports it.
 * @returns one row per message that has an id and a content list, in queue order.
 */
export function queueRows(inbox: unknown): QueueRow[] {
  const waiting: unknown = recordOf(inbox)?.['next-turn']
  if (!Array.isArray(waiting)) return []
  const rows: QueueRow[] = []
  for (const item of waiting as unknown[]) {
    const message = recordOf(item)
    const id = message?.['id']
    const content = message?.['content']
    if (typeof id !== 'string' || !Array.isArray(content)) continue
    const blocks = (content as unknown[]).map(block => recordOf(block))
    const words = blocks.flatMap((block) => {
      if (block?.['type'] === 'text' && typeof block['text'] === 'string') return [block['text']]
      return []
    })
    const full = words.join('')
    const editable = blocks.length > 0 && words.length === blocks.length && !full.includes('\n')
    rows.push({
      id,
      preview: words.join(' ').replace(/\s+/gu, ' ').trim(),
      text: editable ? full : undefined,
      attachments: blocks.filter(block => block?.['type'] === 'image' || block?.['type'] === 'file').length,
    })
  }
  return rows
}

/**
 * Rows of the queue list.
 * @param rows - the waiting messages.
 * @returns one item per message, with its attachment count as detail.
 */
export function queueItems(rows: readonly QueueRow[]): PickerItem[] {
  return rows.map(row => ({
    value: row.id,
    label: row.preview === '' ? t('queue.attachmentOnly') : row.preview,
    detail: row.attachments === 0 ? undefined : t('queue.attached', { count: row.attachments }),
  }))
}

/**
 * The line above the composer while messages wait.
 * @param style - text styles.
 * @param count - how many messages wait.
 * @returns one line.
 */
export function queueStatusLine(style: Style, count: number): string {
  return style.dim(truncate(t('queue.status', { count }), PREVIEW_CELLS))
}
