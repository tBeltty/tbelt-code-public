/**
 * Clear checkpoint source: the correlated constructor and predicate every
 * consumer uses to recognize a `/clear` replacement message, mirroring
 * `@deepseek-ai/dsh-compaction`'s own checkpoint contract.
 *
 * @module @deepseek-ai/dsh-command-clear/checkpoint
 */

import type { MessageSource } from '@deepseek-ai/dsh-llm/message'
import type { CommandId } from '@deepseek-ai/dsh-commands/brand'
import type { ClearId } from './brand.ts'

const CLEAR_CHECKPOINT_MARKER = Object.freeze({ kind: 'clear-checkpoint' } as const)

/** Message source carried by a concrete clear checkpoint. */
export type ClearCheckpointSource = typeof CLEAR_CHECKPOINT_MARKER & {
  readonly clearId: ClearId
  readonly sourceCommandId?: CommandId
  /**
   * Rendered text of every message this clear shadowed, captured while that
   * content was still on the live surface. `/cleared` reads this field
   * instead of re-deriving shadowed content from the durable log, so it
   * never needs an arbitrary historical event lookup.
   */
  readonly shadowedText: string
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** `/clear` replacement message. */
    'clear-checkpoint': ClearCheckpointSource
  }
}

/**
 * Create a checkpoint source correlated with one clear transaction.
 * @param clearId - owning clear transaction identity.
 * @param shadowedText - rendered text of the shadowed span, captured at clear time.
 * @param sourceCommandId - initiating `/clear` command, when present.
 * @returns immutable checkpoint source.
 */
export function clearCheckpointSource(
  clearId: ClearId,
  shadowedText: string,
  sourceCommandId?: CommandId,
): ClearCheckpointSource {
  return Object.freeze({
    ...CLEAR_CHECKPOINT_MARKER,
    clearId,
    shadowedText,
    ...sourceCommandId === undefined ? {} : { sourceCommandId },
  })
}

/**
 * Test whether a persisted message source identifies a clear checkpoint.
 * @param source - source restored from a surface user message.
 * @returns whether the source carries the clear checkpoint marker.
 */
export function isClearCheckpointSource(source: MessageSource): source is ClearCheckpointSource {
  return source.kind === CLEAR_CHECKPOINT_MARKER.kind
}
